package inference

import (
	"bytes"
	"context"
	"image"
	"image/png"
	"math"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	pb "github.com/michael-freling/anime-craft/gateway/internal/inference/pb"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

// bufSize is the buffer size for the in-process bufconn listener.
const bufSize = 1024 * 1024

// fakeInferenceServer is a configurable in-process implementation of
// pb.InferenceServiceServer used by the client tests.
type fakeInferenceServer struct {
	pb.UnimplementedInferenceServiceServer

	// ExtractLineArt behavior.
	extractResponse   []byte
	extractErr        error
	extractReceivedMu sync.Mutex
	extractReceived   []byte

	// GenerateFeedback behavior.
	feedbackTextChunks  []string
	feedbackResult      *pb.FeedbackResult
	feedbackErr         error
	feedbackReceivedMu  sync.Mutex
	feedbackReceivedReq *pb.GenerateFeedbackRequest

	// CompareImages behavior.
	compareResponse    []byte
	compareErr         error
	compareReceivedMu  sync.Mutex
	compareReceivedReq *pb.CompareImagesRequest

	// HealthCheck behavior.
	healthCheckCalls      int32
	healthCheckReadyAfter int32 // number of not-ready responses before ready
	healthCheckAlwaysDown bool
}

func (s *fakeInferenceServer) ExtractLineArt(ctx context.Context, req *pb.ExtractLineArtRequest) (*pb.ExtractLineArtResponse, error) {
	s.extractReceivedMu.Lock()
	s.extractReceived = append([]byte(nil), req.GetImageData()...)
	s.extractReceivedMu.Unlock()

	if s.extractErr != nil {
		return nil, s.extractErr
	}
	return &pb.ExtractLineArtResponse{LineArtPng: s.extractResponse}, nil
}

func (s *fakeInferenceServer) GenerateFeedback(req *pb.GenerateFeedbackRequest, stream grpc.ServerStreamingServer[pb.GenerateFeedbackResponse]) error {
	s.feedbackReceivedMu.Lock()
	// Copy the request so later mutation of byte slices can't race with
	// test assertions. Protobuf generated messages don't provide a clone
	// helper without importing proto, so we manually duplicate the fields.
	s.feedbackReceivedReq = &pb.GenerateFeedbackRequest{
		ReferenceLineArtPng: append([]byte(nil), req.GetReferenceLineArtPng()...),
		DrawingPng:          append([]byte(nil), req.GetDrawingPng()...),
		ExerciseMode:        req.GetExerciseMode(),
	}
	s.feedbackReceivedMu.Unlock()

	if s.feedbackErr != nil {
		return s.feedbackErr
	}

	for _, chunk := range s.feedbackTextChunks {
		if err := stream.Send(&pb.GenerateFeedbackResponse{
			Payload: &pb.GenerateFeedbackResponse_TextChunk{TextChunk: chunk},
		}); err != nil {
			return err
		}
	}

	if s.feedbackResult != nil {
		if err := stream.Send(&pb.GenerateFeedbackResponse{
			Payload: &pb.GenerateFeedbackResponse_Result{Result: s.feedbackResult},
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *fakeInferenceServer) CompareImages(ctx context.Context, req *pb.CompareImagesRequest) (*pb.CompareImagesResponse, error) {
	s.compareReceivedMu.Lock()
	s.compareReceivedReq = &pb.CompareImagesRequest{
		ReferenceLineArtPng: append([]byte(nil), req.GetReferenceLineArtPng()...),
		DrawingPng:          append([]byte(nil), req.GetDrawingPng()...),
	}
	s.compareReceivedMu.Unlock()

	if s.compareErr != nil {
		return nil, s.compareErr
	}
	return &pb.CompareImagesResponse{HeatmapPng: s.compareResponse}, nil
}

func (s *fakeInferenceServer) HealthCheck(ctx context.Context, req *pb.HealthCheckRequest) (*pb.HealthCheckResponse, error) {
	calls := atomic.AddInt32(&s.healthCheckCalls, 1)
	if s.healthCheckAlwaysDown {
		return &pb.HealthCheckResponse{
			LineArtReady:  false,
			FeedbackReady: false,
			StatusMessage: "still loading",
		}, nil
	}
	if calls <= s.healthCheckReadyAfter {
		return &pb.HealthCheckResponse{
			LineArtReady:  false,
			FeedbackReady: false,
			StatusMessage: "warming up",
		}, nil
	}
	return &pb.HealthCheckResponse{
		LineArtReady:  true,
		FeedbackReady: true,
		StatusMessage: "ready",
	}, nil
}

// startTestServer creates an in-process gRPC server backed by bufconn and
// registers the provided fake servicer. It returns a connected Client and
// a cleanup func that must be called via t.Cleanup.
func startTestServer(t *testing.T, srv *fakeInferenceServer) *Client {
	t.Helper()

	listener := bufconn.Listen(bufSize)
	// Configured the way the real pair is, so the tests exercise what the app
	// actually runs with rather than gRPC's defaults.
	grpcServer := grpc.NewServer(
		grpc.MaxRecvMsgSize(unlimitedMessageBytes),
		grpc.MaxSendMsgSize(unlimitedMessageBytes),
	)
	pb.RegisterInferenceServiceServer(grpcServer, srv)

	serveErrCh := make(chan error, 1)
	go func() {
		serveErrCh <- grpcServer.Serve(listener)
	}()

	dialer := func(ctx context.Context, _ string) (net.Conn, error) {
		return listener.DialContext(ctx)
	}

	conn, err := grpc.NewClient(
		"passthrough:///bufnet",
		grpc.WithContextDialer(dialer),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithDefaultCallOptions(
			grpc.MaxCallRecvMsgSize(unlimitedMessageBytes),
			grpc.MaxCallSendMsgSize(unlimitedMessageBytes),
		),
	)
	if err != nil {
		grpcServer.Stop()
		t.Fatalf("grpc.NewClient: %v", err)
	}

	client := &Client{
		conn:   conn,
		client: pb.NewInferenceServiceClient(conn),
	}

	t.Cleanup(func() {
		_ = client.Close()
		grpcServer.Stop()
		// Drain the serve goroutine.
		select {
		case <-serveErrCh:
		case <-time.After(2 * time.Second):
			t.Logf("grpc server did not stop within timeout")
		}
	})

	return client
}

func TestClient_Extract(t *testing.T) {
	// A minimal non-image byte slice is fine; the fake doesn't decode it.
	testImageBytes := []byte("pretend-this-is-a-png")
	expectedPNG := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00}

	srv := &fakeInferenceServer{
		extractResponse: expectedPNG,
	}
	client := startTestServer(t, srv)

	got, err := client.Extract(testImageBytes)
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}
	if string(got) != string(expectedPNG) {
		t.Errorf("Extract returned bytes = %x, want %x", got, expectedPNG)
	}

	srv.extractReceivedMu.Lock()
	received := srv.extractReceived
	srv.extractReceivedMu.Unlock()
	if string(received) != string(testImageBytes) {
		t.Errorf("server received bytes = %q, want %q", received, testImageBytes)
	}
}

func TestClient_GenerateFeedback(t *testing.T) {
	refBytes := []byte("reference-line-art")
	drawingBytes := []byte("user-drawing")
	exerciseMode := "free"

	expectedResult := &pb.FeedbackResult{
		OverallScore:     85,
		ProportionsScore: 80,
		LineQualityScore: 90,
		AccuracyScore:    85,
		Summary:          "Good work",
		Details:          "Details here",
		Strengths:        []string{"s1", "s2"},
		Improvements:     []string{"i1"},
	}

	srv := &fakeInferenceServer{
		feedbackTextChunks: []string{"hello ", "world ", "!"},
		feedbackResult:     expectedResult,
	}
	client := startTestServer(t, srv)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := client.GenerateFeedback(ctx, refBytes, drawingBytes, exerciseMode)
	if err != nil {
		t.Fatalf("GenerateFeedback: %v", err)
	}
	if result == nil {
		t.Fatal("GenerateFeedback returned nil result")
	}

	if result.GetOverallScore() != 85 {
		t.Errorf("OverallScore = %d, want 85", result.GetOverallScore())
	}
	if result.GetProportionsScore() != 80 {
		t.Errorf("ProportionsScore = %d, want 80", result.GetProportionsScore())
	}
	if result.GetLineQualityScore() != 90 {
		t.Errorf("LineQualityScore = %d, want 90", result.GetLineQualityScore())
	}
	if result.GetAccuracyScore() != 85 {
		t.Errorf("AccuracyScore = %d, want 85", result.GetAccuracyScore())
	}
	if result.GetSummary() != "Good work" {
		t.Errorf("Summary = %q, want %q", result.GetSummary(), "Good work")
	}
	if result.GetDetails() != "Details here" {
		t.Errorf("Details = %q, want %q", result.GetDetails(), "Details here")
	}
	wantStrengths := []string{"s1", "s2"}
	if !equalStrings(result.GetStrengths(), wantStrengths) {
		t.Errorf("Strengths = %v, want %v", result.GetStrengths(), wantStrengths)
	}
	wantImprovements := []string{"i1"}
	if !equalStrings(result.GetImprovements(), wantImprovements) {
		t.Errorf("Improvements = %v, want %v", result.GetImprovements(), wantImprovements)
	}

	// Verify the server received the correct request fields.
	srv.feedbackReceivedMu.Lock()
	req := srv.feedbackReceivedReq
	srv.feedbackReceivedMu.Unlock()
	if req == nil {
		t.Fatal("server did not record any feedback request")
	}
	if string(req.GetReferenceLineArtPng()) != string(refBytes) {
		t.Errorf("server ReferenceLineArtPng = %q, want %q", req.GetReferenceLineArtPng(), refBytes)
	}
	if string(req.GetDrawingPng()) != string(drawingBytes) {
		t.Errorf("server DrawingPng = %q, want %q", req.GetDrawingPng(), drawingBytes)
	}
	if req.GetExerciseMode() != exerciseMode {
		t.Errorf("server ExerciseMode = %q, want %q", req.GetExerciseMode(), exerciseMode)
	}
}

func TestClient_GenerateFeedback_NoResult(t *testing.T) {
	srv := &fakeInferenceServer{
		feedbackTextChunks: []string{"only ", "text"},
		feedbackResult:     nil,
	}
	client := startTestServer(t, srv)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := client.GenerateFeedback(ctx, []byte("ref"), []byte("draw"), "free")
	if err == nil {
		t.Fatalf("GenerateFeedback returned nil error, want error; result=%v", result)
	}
	if !strings.Contains(err.Error(), "no feedback result") {
		t.Errorf("error = %q, want to contain %q", err.Error(), "no feedback result")
	}
}

func TestClient_WaitReady_Success(t *testing.T) {
	srv := &fakeInferenceServer{
		healthCheckReadyAfter: 2, // first two calls return not-ready
	}
	client := startTestServer(t, srv)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := client.WaitReady(ctx, 5*time.Second); err != nil {
		t.Fatalf("WaitReady: %v", err)
	}

	calls := atomic.LoadInt32(&srv.healthCheckCalls)
	if calls < 3 {
		t.Errorf("expected at least 3 HealthCheck calls, got %d", calls)
	}
}

func TestClient_WaitReady_Timeout(t *testing.T) {
	srv := &fakeInferenceServer{
		healthCheckAlwaysDown: true,
	}
	client := startTestServer(t, srv)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := client.WaitReady(ctx, 100*time.Millisecond)
	if err == nil {
		t.Fatal("WaitReady returned nil error, want timeout error")
	}
	if !strings.Contains(err.Error(), "not ready") {
		t.Errorf("error = %q, want to contain %q", err.Error(), "not ready")
	}
}

func TestClient_CompareImages(t *testing.T) {
	refBytes := []byte("reference-line-art")
	drawingBytes := []byte("user-drawing")
	expectedHeatmap := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x01, 0x02}

	srv := &fakeInferenceServer{
		compareResponse: expectedHeatmap,
	}
	client := startTestServer(t, srv)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	got, err := client.CompareImages(ctx, refBytes, drawingBytes)
	if err != nil {
		t.Fatalf("CompareImages: %v", err)
	}
	if string(got) != string(expectedHeatmap) {
		t.Errorf("CompareImages returned bytes = %x, want %x", got, expectedHeatmap)
	}

	// Verify the server received the correct request fields.
	srv.compareReceivedMu.Lock()
	req := srv.compareReceivedReq
	srv.compareReceivedMu.Unlock()
	if req == nil {
		t.Fatal("server did not record any compare request")
	}
	if string(req.GetReferenceLineArtPng()) != string(refBytes) {
		t.Errorf("server ReferenceLineArtPng = %q, want %q", req.GetReferenceLineArtPng(), refBytes)
	}
	if string(req.GetDrawingPng()) != string(drawingBytes) {
		t.Errorf("server DrawingPng = %q, want %q", req.GetDrawingPng(), drawingBytes)
	}
}

// equalStrings is a small helper to compare two string slices.
func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// ResourceExhausted means two different things on this connection: the service
// turning away a second concurrent feedback request, which passes, and gRPC
// refusing a message over the size limit, which never will. Retrying the
// second turned a request that could not succeed into two minutes of backoff.
func TestWorthRetrying(t *testing.T) {
	tests := []struct {
		name  string
		err   error
		retry bool
	}{
		{
			name:  "the service is still starting up",
			err:   status.Error(codes.Unavailable, "model is loading"),
			retry: true,
		},
		{
			name:  "another feedback request is already running",
			err:   status.Error(codes.ResourceExhausted, "Another feedback request is already in progress. Please wait."),
			retry: true,
		},
		{
			name:  "the message is too large for the service",
			err:   status.Error(codes.ResourceExhausted, "SERVER: Received message larger than max (4425484 vs. 4194304)"),
			retry: false,
		},
		{
			name:  "the response is too large for us",
			err:   status.Error(codes.ResourceExhausted, "grpc: received message larger than max (5000000 vs. 4194304)"),
			retry: false,
		},
		{
			name:  "the request was rejected outright",
			err:   status.Error(codes.InvalidArgument, "drawing_png must not be empty."),
			retry: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Equal(t, test.retry, worthRetrying(status.Code(test.err), test.err))
		})
	}
}

// Nothing is refused for being large. A fixed ceiling would only choose how
// big an image has to be before the app fails.
func TestNoMessageSizeCeiling(t *testing.T) {
	assert.Equal(t, math.MaxInt32, unlimitedMessageBytes,
		"the inference service uses gRPC's own -1 for the same thing")
}

// The reported failure: a photographic reference and a drawing came to 4.4MB
// together and were refused by gRPC's 4MB default. The photograph now arrives
// as something neither model would have looked past anyway.
func TestGenerateFeedback_SendsAPhotographTheModelsCanUse(t *testing.T) {
	srv := &fakeInferenceServer{
		feedbackResult: &pb.FeedbackResult{OverallScore: 70, Summary: "ok"},
	}
	client := startTestServer(t, srv)

	reference := photographPNG(t, 4000, 3000)
	require.Greater(t, len(reference), 4*1024*1024, "the kind of upload that was being refused")
	drawing := photographPNG(t, 1024, 768)

	result, err := client.GenerateFeedback(context.Background(), reference, drawing, "line_work")
	require.NoError(t, err)
	assert.Equal(t, int32(70), result.GetOverallScore())

	srv.feedbackReceivedMu.Lock()
	received := srv.feedbackReceivedReq
	srv.feedbackReceivedMu.Unlock()
	require.NotNil(t, received)

	assert.Less(t, len(received.GetReferenceLineArtPng()), len(reference),
		"the reference was shrunk rather than sent whole")
	assertWithinModelInput(t, received.GetReferenceLineArtPng())
	// A drawing already within the bound is passed through untouched.
	assert.Equal(t, drawing, received.GetDrawingPng())
}

// Nothing is rejected for being large, whichever way it travels.
func TestExtractLineArt_AcceptsAResponseOfAnySize(t *testing.T) {
	srv := &fakeInferenceServer{
		extractResponse: bytes.Repeat([]byte{0x11}, 6*1024*1024),
	}
	client := startTestServer(t, srv)

	lineArt, err := client.Extract(photographPNG(t, 3000, 2000))

	require.NoError(t, err)
	assert.Len(t, lineArt, 6*1024*1024)
}

// An image Go cannot decode is sent as it is rather than failing the request,
// which is what the removed ceiling is there for.
func TestCompareImages_SendsAnUndecodableImageAsItIs(t *testing.T) {
	srv := &fakeInferenceServer{compareResponse: []byte("heatmap")}
	client := startTestServer(t, srv)

	// Larger than gRPC's old default, and not an image format Go knows.
	opaque := bytes.Repeat([]byte{0x7F}, 5*1024*1024)

	heatmap, err := client.CompareImages(context.Background(), opaque, opaque)

	require.NoError(t, err)
	assert.Equal(t, []byte("heatmap"), heatmap)
	srv.compareReceivedMu.Lock()
	received := srv.compareReceivedReq
	srv.compareReceivedMu.Unlock()
	require.NotNil(t, received)
	assert.Len(t, received.GetReferenceLineArtPng(), len(opaque))
}

// photographPNG builds a PNG with enough variation that it does not compress
// away to nothing, so the sizes in these tests are realistic.
func photographPNG(t *testing.T, width int, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	seed := uint32(12345)
	for i := 0; i < len(img.Pix); i++ {
		seed = seed*1664525 + 1013904223
		img.Pix[i] = uint8(seed >> 24)
	}
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))
	return buf.Bytes()
}

func assertWithinModelInput(t *testing.T, data []byte) {
	t.Helper()
	decoded, _, err := image.Decode(bytes.NewReader(data))
	require.NoError(t, err)
	assert.LessOrEqual(t, decoded.Bounds().Dx(), maxImageEdge)
	assert.LessOrEqual(t, decoded.Bounds().Dy(), maxImageEdge)
}
