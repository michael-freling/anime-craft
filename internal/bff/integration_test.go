package bff

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/png"
	"path/filepath"
	"sync"
	"testing"

	"github.com/michael-freling/anime-craft/internal/ai"
	"github.com/michael-freling/anime-craft/internal/repository"
)

// newTestBase64PNG creates a minimal 1x1 PNG and returns it as a base64 string.
func newTestBase64PNG() string {
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return base64.StdEncoding.EncodeToString(buf.Bytes())
}

// setupIntegrationServices creates a file-backed SQLite DB, runs migrations,
// and builds the full service graph used in production.
func setupIntegrationServices(t *testing.T) (
	*ReferenceService,
	*SessionService,
	*DrawingService,
	*FeedbackService,
) {
	t.Helper()

	dataDir := t.TempDir()
	dbPath := filepath.Join(dataDir, "test.db")

	db, err := repository.NewDB(dbPath)
	if err != nil {
		t.Fatalf("create database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if err := db.RunMigrations(); err != nil {
		t.Fatalf("run migrations: %v", err)
	}

	refRepo := repository.NewReferenceRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	feedbackRepo := repository.NewFeedbackRepository(db)

	aiClient := ai.NewMockFeedbackClient()

	refService := NewReferenceService(refRepo, dataDir)
	sessionService := NewSessionService(sessionRepo)
	drawingService := NewDrawingService(drawingRepo, dataDir)
	feedbackService := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, aiClient, dataDir)

	return refService, sessionService, drawingService, feedbackService
}

// TestFullSessionFlow exercises the exact user flow that previously triggered
// SQLITE_BUSY errors: select reference -> start session -> save drawing ->
// end session -> request feedback -> get feedback again.
func TestFullSessionFlow(t *testing.T) {
	refService, sessionService, drawingService, feedbackService := setupIntegrationServices(t)

	base64PNG := newTestBase64PNG()

	// Step 1: Add a reference image
	ref, err := refService.AddReference("Test Reference", "beginner", base64PNG)
	if err != nil {
		t.Fatalf("AddReference: %v", err)
	}
	if ref.ID == "" {
		t.Fatal("expected reference to have a non-empty ID")
	}
	if ref.Title != "Test Reference" {
		t.Fatalf("expected title %q, got %q", "Test Reference", ref.Title)
	}

	// Step 2: Start a drawing session
	session, err := sessionService.StartSession("line_work", ref.ID)
	if err != nil {
		t.Fatalf("StartSession: %v", err)
	}
	if session.ID == "" {
		t.Fatal("expected session to have a non-empty ID")
	}
	if session.Status != "in_progress" {
		t.Fatalf("expected session status %q, got %q", "in_progress", session.Status)
	}

	// Step 3: Save a drawing (simulates canvas export)
	drawing, err := drawingService.SaveDrawing(session.ID, base64PNG)
	if err != nil {
		t.Fatalf("SaveDrawing: %v", err)
	}
	if drawing.ID == "" {
		t.Fatal("expected drawing to have a non-empty ID")
	}
	if drawing.SessionID != session.ID {
		t.Fatalf("expected drawing session ID %q, got %q", session.ID, drawing.SessionID)
	}

	// Step 4: End the session
	endedSession, err := sessionService.EndSession(session.ID)
	if err != nil {
		t.Fatalf("EndSession: %v", err)
	}
	if endedSession.Status != "completed" {
		t.Fatalf("expected session status %q, got %q", "completed", endedSession.Status)
	}
	if endedSession.EndedAt == nil {
		t.Fatal("expected EndedAt to be set after ending session")
	}
	if endedSession.DurationSeconds == nil {
		t.Fatal("expected DurationSeconds to be set after ending session")
	}

	// Step 5: Request feedback (this is where SQLITE_BUSY previously occurred)
	feedback, err := feedbackService.RequestFeedback(session.ID)
	if err != nil {
		t.Fatalf("RequestFeedback: %v", err)
	}
	if feedback.ID == "" {
		t.Fatal("expected feedback to have a non-empty ID")
	}
	if feedback.SessionID != session.ID {
		t.Fatalf("expected feedback session ID %q, got %q", session.ID, feedback.SessionID)
	}
	if feedback.OverallScore <= 0 {
		t.Fatalf("expected positive overall score, got %d", feedback.OverallScore)
	}
	if feedback.Summary == "" {
		t.Fatal("expected non-empty feedback summary")
	}
	if len(feedback.Strengths) == 0 {
		t.Fatal("expected at least one strength in feedback")
	}
	if len(feedback.Improvements) == 0 {
		t.Fatal("expected at least one improvement in feedback")
	}

	// Step 6: Get feedback again (verifies read-back / caching path)
	fb2, err := feedbackService.GetFeedback(session.ID)
	if err != nil {
		t.Fatalf("GetFeedback: %v", err)
	}
	if fb2.ID != feedback.ID {
		t.Fatalf("expected feedback ID %q on re-read, got %q", feedback.ID, fb2.ID)
	}
	if fb2.OverallScore != feedback.OverallScore {
		t.Fatalf("expected overall score %d on re-read, got %d", feedback.OverallScore, fb2.OverallScore)
	}

	// Step 7: Request feedback again should return the cached feedback
	fb3, err := feedbackService.RequestFeedback(session.ID)
	if err != nil {
		t.Fatalf("RequestFeedback (cached): %v", err)
	}
	if fb3.ID != feedback.ID {
		t.Fatalf("expected cached feedback ID %q, got %q", feedback.ID, fb3.ID)
	}
}

// TestDuplicateRequestFeedback reproduces the race condition where the frontend
// calls RequestFeedback twice for the same session (React useEffect double-fire).
// The second call must not fail with UNIQUE constraint violation.
func TestDuplicateRequestFeedback(t *testing.T) {
	refService, sessionService, drawingService, feedbackService := setupIntegrationServices(t)

	base64PNG := newTestBase64PNG()

	ref, err := refService.AddReference("Test Ref", "beginner", base64PNG)
	if err != nil {
		t.Fatalf("AddReference: %v", err)
	}

	session, err := sessionService.StartSession("line_work", ref.ID)
	if err != nil {
		t.Fatalf("StartSession: %v", err)
	}

	_, err = drawingService.SaveDrawing(session.ID, base64PNG)
	if err != nil {
		t.Fatalf("SaveDrawing: %v", err)
	}

	_, err = sessionService.EndSession(session.ID)
	if err != nil {
		t.Fatalf("EndSession: %v", err)
	}

	// Simulate React double-fire: two concurrent RequestFeedback for the same session
	var wg sync.WaitGroup
	results := make(chan error, 2)

	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			fb, err := feedbackService.RequestFeedback(session.ID)
			if err != nil {
				results <- fmt.Errorf("RequestFeedback: %w", err)
				return
			}
			if fb.ID == "" {
				results <- fmt.Errorf("feedback has empty ID")
				return
			}
			results <- nil
		}()
	}

	wg.Wait()
	close(results)

	for err := range results {
		if err != nil {
			t.Fatalf("duplicate RequestFeedback failed: %v", err)
		}
	}
}

// TestConcurrentSessionFlow runs multiple full session flows concurrently to
// verify that the busy_timeout and connection pooling settings prevent
// SQLITE_BUSY errors under concurrent access.
func TestConcurrentSessionFlow(t *testing.T) {
	refService, sessionService, drawingService, feedbackService := setupIntegrationServices(t)

	base64PNG := newTestBase64PNG()
	const numWorkers = 5

	var wg sync.WaitGroup
	errs := make(chan error, numWorkers)

	for i := range numWorkers {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()

			// Each goroutine runs the full user flow independently
			ref, err := refService.AddReference(
				fmt.Sprintf("Concurrent Ref %d", workerID),
				"beginner",
				base64PNG,
			)
			if err != nil {
				errs <- fmt.Errorf("worker %d AddReference: %w", workerID, err)
				return
			}

			session, err := sessionService.StartSession("line_work", ref.ID)
			if err != nil {
				errs <- fmt.Errorf("worker %d StartSession: %w", workerID, err)
				return
			}

			_, err = drawingService.SaveDrawing(session.ID, base64PNG)
			if err != nil {
				errs <- fmt.Errorf("worker %d SaveDrawing: %w", workerID, err)
				return
			}

			_, err = sessionService.EndSession(session.ID)
			if err != nil {
				errs <- fmt.Errorf("worker %d EndSession: %w", workerID, err)
				return
			}

			feedback, err := feedbackService.RequestFeedback(session.ID)
			if err != nil {
				errs <- fmt.Errorf("worker %d RequestFeedback: %w", workerID, err)
				return
			}

			if feedback.ID == "" {
				errs <- fmt.Errorf("worker %d: feedback has empty ID", workerID)
				return
			}
			if feedback.OverallScore <= 0 {
				errs <- fmt.Errorf("worker %d: expected positive score, got %d", workerID, feedback.OverallScore)
				return
			}
		}(i)
	}

	wg.Wait()
	close(errs)

	var failures []error
	for err := range errs {
		failures = append(failures, err)
	}
	if len(failures) > 0 {
		for _, err := range failures {
			t.Errorf("concurrent flow error: %v", err)
		}
		t.Fatalf("%d of %d concurrent flows failed (SQLITE_BUSY or other error)", len(failures), numWorkers)
	}
}
