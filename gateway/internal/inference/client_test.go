package inference

import (
	"context"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	pb "github.com/michael-freling/anime-craft/gateway/internal/inference/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
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
	feedbackTextChunks   []string
	feedbackResult       *pb.FeedbackResult
	feedbackErr          error
	feedbackReceivedMu   sync.Mutex
	feedbackReceivedReq  *pb.GenerateFeedbackRequest

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
	grpcServer := grpc.NewServer()
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
