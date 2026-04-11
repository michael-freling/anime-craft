package inference

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"time"

	pb "github.com/michael-freling/anime-craft/gateway/internal/inference/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

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
		ImageData: imageData,
	})
	if err != nil {
		return nil, fmt.Errorf("extract line art via gRPC: %w", err)
	}
	return resp.GetLineArtPng(), nil
}

// GenerateFeedback sends images to the VLM and returns the structured result.
// For now, this is a blocking call that collects all streaming chunks.
// Streaming to the frontend can be added later.
func (c *Client) GenerateFeedback(ctx context.Context, referenceLineArt []byte, drawingPNG []byte, exerciseMode string) (*pb.FeedbackResult, error) {
	stream, err := c.client.GenerateFeedback(ctx, &pb.GenerateFeedbackRequest{
		ReferenceLineArtPng: referenceLineArt,
		DrawingPng:          drawingPNG,
		ExerciseMode:        exerciseMode,
	})
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
			return nil, fmt.Errorf("receive feedback stream: %w", err)
		}

		// We only care about the final FeedbackResult for now.
		// Text chunks are logged but discarded.
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
