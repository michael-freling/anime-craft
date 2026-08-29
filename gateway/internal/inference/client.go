package inference

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"math"
	"strings"
	"time"

	pb "github.com/michael-freling/anime-craft/gateway/internal/inference/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
)

// unlimitedMessageBytes removes gRPC's 4MB cap on what may be received.
//
// A cap only chooses how large an image has to be before the app fails; it
// never stops there being a larger one. What keeps requests small is
// shrinkForInference, which sends no image larger than either model can look
// at — so this is a backstop for what that cannot help with, such as a format
// Go does not decode and therefore passes through whole.
//
// Go has no sentinel for "no limit", so this is its largest int32; the Python
// side uses gRPC's own -1 for the same thing.
const unlimitedMessageBytes = math.MaxInt32

// Client wraps the gRPC connection to the Python inference service.
// It implements bff.LineArtExtractor and bff.FeedbackGenerator.
type Client struct {
	conn   *grpc.ClientConn
	client pb.InferenceServiceClient
}

// New creates a new gRPC client connected to the inference service at addr.
func New(ctx context.Context, addr string) (*Client, error) {
	conn, err := grpc.NewClient(addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithDefaultCallOptions(
			grpc.MaxCallRecvMsgSize(unlimitedMessageBytes),
			grpc.MaxCallSendMsgSize(unlimitedMessageBytes),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("grpc dial %s: %w", addr, err)
	}
	return &Client{
		conn:   conn,
		client: pb.NewInferenceServiceClient(conn),
	}, nil
}

// Close releases the gRPC connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

// Extract implements bff.LineArtExtractor. It sends image data to the
// Python inference service and returns the extracted line art PNG.
func (c *Client) Extract(imageData []byte) ([]byte, error) {
	resp, err := c.client.ExtractLineArt(context.Background(), &pb.ExtractLineArtRequest{
		ImageData: shrinkForInference(imageData),
	})
	if err != nil {
		return nil, fmt.Errorf("extract line art via gRPC: %w", err)
	}
	return resp.GetLineArtPng(), nil
}

// GenerateFeedback sends images to the VLM and returns the structured result.
// If the inference service returns UNAVAILABLE (model still loading), it
// retries with exponential backoff up to 2 minutes.
func (c *Client) GenerateFeedback(ctx context.Context, referenceLineArt []byte, drawingPNG []byte, exerciseMode string) (*pb.FeedbackResult, error) {
	req := &pb.GenerateFeedbackRequest{
		ReferenceLineArtPng: shrinkForInference(referenceLineArt),
		DrawingPng:          shrinkForInference(drawingPNG),
		ExerciseMode:        exerciseMode,
	}

	backoff := 2 * time.Second
	deadline := time.Now().Add(2 * time.Minute)

	for {
		result, err := c.doGenerateFeedback(ctx, req)
		if err == nil {
			return result, nil
		}

		code := status.Code(err)
		if !worthRetrying(code, err) || time.Now().After(deadline) {
			return nil, err
		}

		slog.Info("inference service not ready or busy, retrying...", "backoff", backoff, "code", code, "error", err)

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

// worthRetrying says whether waiting could plausibly change the answer.
//
// ResourceExhausted carries two very different meanings here. The service
// sends it when another feedback request is already running, which passes.
// gRPC's transport sends it when a message is over the size limit, which never
// will — and retrying that turned a request that could not succeed into two
// minutes of backing off and trying again, which is how this was noticed.
//
// The only thing separating them is the message text, since they share a code.
func worthRetrying(code codes.Code, err error) bool {
	if code == codes.Unavailable {
		return true
	}
	if code != codes.ResourceExhausted {
		return false
	}
	return !strings.Contains(status.Convert(err).Message(), "larger than max")
}

func (c *Client) doGenerateFeedback(ctx context.Context, req *pb.GenerateFeedbackRequest) (*pb.FeedbackResult, error) {
	stream, err := c.client.GenerateFeedback(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("generate feedback via gRPC: %w", err)
	}

	var result *pb.FeedbackResult
	for {
		resp, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}

		switch payload := resp.GetPayload().(type) {
		case *pb.GenerateFeedbackResponse_TextChunk:
			slog.Debug("feedback text chunk received", "length", len(payload.TextChunk))
		case *pb.GenerateFeedbackResponse_Result:
			result = payload.Result
		}
	}

	if result == nil {
		return nil, fmt.Errorf("inference service returned no feedback result")
	}
	return result, nil
}

// CompareImages sends both images to the inference service and returns
// an SSIM heatmap PNG.
func (c *Client) CompareImages(ctx context.Context, referenceLineArt []byte, drawingPNG []byte) ([]byte, error) {
	resp, err := c.client.CompareImages(ctx, &pb.CompareImagesRequest{
		ReferenceLineArtPng: shrinkForInference(referenceLineArt),
		DrawingPng:          shrinkForInference(drawingPNG),
	})
	if err != nil {
		return nil, fmt.Errorf("compare images via gRPC: %w", err)
	}
	return resp.GetHeatmapPng(), nil
}

// WaitReady polls HealthCheck until the service reports ready or the timeout
// expires. It checks both line_art_ready and feedback_ready flags.
func (c *Client) WaitReady(ctx context.Context, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		resp, err := c.client.HealthCheck(ctx, &pb.HealthCheckRequest{})
		if err == nil && resp.GetLineArtReady() && resp.GetFeedbackReady() {
			slog.Info("inference service is ready", "status", resp.GetStatusMessage())
			return nil
		}

		if err != nil {
			slog.Debug("inference health check failed", "error", err)
		} else {
			slog.Debug("inference service not ready yet",
				"lineArtReady", resp.GetLineArtReady(),
				"feedbackReady", resp.GetFeedbackReady(),
				"status", resp.GetStatusMessage(),
			)
		}

		if time.Now().After(deadline) {
			return fmt.Errorf("inference service not ready after %s", timeout)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}
