package bff

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"context"
	"fmt"

	"github.com/michael-freling/anime-craft/internal/ai"
	"github.com/michael-freling/anime-craft/internal/model"
	"github.com/michael-freling/anime-craft/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// errorFeedbackClient is an AI client that always returns an error.
type errorFeedbackClient struct{}

func (e *errorFeedbackClient) AnalyzeDrawing(ctx context.Context, req ai.AnalysisRequest) (ai.AnalysisResponse, error) {
	return ai.AnalysisResponse{}, fmt.Errorf("AI service unavailable")
}

func TestFeedbackService_RequestFeedback(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	aiClient := ai.NewMockFeedbackClient()

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, aiClient, dataDir)

	// Create reference image file and update seeded ref-001 to point to it
	require.NoError(t, os.MkdirAll(filepath.Join(dataDir, "references"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dataDir, "references", "ref-001.png"), []byte("fake-ref-image"), 0644))
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?", "references/ref-001.png", "ref-001")
	require.NoError(t, err)

	// Create a session
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-001",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "completed",
		StartedAt:        time.Now(),
	}))

	// Create a drawing file and record
	drawingPath := filepath.Join(dataDir, "drawings", "sess-001.png")
	require.NoError(t, os.MkdirAll(filepath.Dir(drawingPath), 0755))
	require.NoError(t, os.WriteFile(drawingPath, []byte("fake-drawing"), 0644))
	require.NoError(t, drawingRepo.Create(model.Drawing{
		ID:        "draw-001",
		SessionID: "sess-001",
		FilePath:  drawingPath,
		CreatedAt: time.Now(),
	}))

	// Request feedback
	feedback, err := svc.RequestFeedback("sess-001")
	require.NoError(t, err)
	assert.NotEmpty(t, feedback.ID)
	assert.Equal(t, "sess-001", feedback.SessionID)
	assert.Equal(t, 72, feedback.OverallScore)
	assert.Nil(t, feedback.ColorAccuracyScore) // line_work mode: color=0 so not set
	assert.NotNil(t, feedback.ProportionsScore)
	assert.Equal(t, 75, *feedback.ProportionsScore)
	assert.NotNil(t, feedback.LineQualityScore)
	assert.Equal(t, 68, *feedback.LineQualityScore)
	assert.NotEmpty(t, feedback.Summary)
	assert.Len(t, feedback.Strengths, 3)
	assert.Len(t, feedback.Improvements, 3)

	// Verify it's persisted
	got, err := svc.GetFeedback("sess-001")
	require.NoError(t, err)
	assert.Equal(t, feedback.ID, got.ID)
}

func TestFeedbackService_RequestFeedback_ReturnsCached(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	aiClient := ai.NewMockFeedbackClient()

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, aiClient, dataDir)

	// Create reference image file and update seeded ref-001 to point to it
	require.NoError(t, os.MkdirAll(filepath.Join(dataDir, "references"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dataDir, "references", "ref-001.png"), []byte("fake-ref-image"), 0644))
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?", "references/ref-001.png", "ref-001")
	require.NoError(t, err)

	// Create a session
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-002",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "completed",
		StartedAt:        time.Now(),
	}))

	// Create a drawing file and record
	drawingPath := filepath.Join(dataDir, "drawings", "sess-002.png")
	require.NoError(t, os.MkdirAll(filepath.Dir(drawingPath), 0755))
	require.NoError(t, os.WriteFile(drawingPath, []byte("fake-drawing"), 0644))
	require.NoError(t, drawingRepo.Create(model.Drawing{
		ID:        "draw-002",
		SessionID: "sess-002",
		FilePath:  drawingPath,
		CreatedAt: time.Now(),
	}))

	// Request feedback first time
	first, err := svc.RequestFeedback("sess-002")
	require.NoError(t, err)
	assert.NotEmpty(t, first.ID)

	// Request feedback second time -- should return the cached result
	second, err := svc.RequestFeedback("sess-002")
	require.NoError(t, err)
	assert.Equal(t, first.ID, second.ID, "second call should return the same feedback")
}

func TestFeedbackService_GetFeedback(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	aiClient := ai.NewMockFeedbackClient()

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, aiClient, dataDir)

	// Create reference image file and update seeded ref-001 to point to it
	require.NoError(t, os.MkdirAll(filepath.Join(dataDir, "references"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dataDir, "references", "ref-001.png"), []byte("fake-ref-image"), 0644))
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?", "references/ref-001.png", "ref-001")
	require.NoError(t, err)

	// Create a session
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-get-fb",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "completed",
		StartedAt:        time.Now(),
	}))

	// Create a drawing file and record
	drawingPath := filepath.Join(dataDir, "drawings", "sess-get-fb.png")
	require.NoError(t, os.MkdirAll(filepath.Dir(drawingPath), 0755))
	require.NoError(t, os.WriteFile(drawingPath, []byte("fake-drawing"), 0644))
	require.NoError(t, drawingRepo.Create(model.Drawing{
		ID:        "draw-get-fb",
		SessionID: "sess-get-fb",
		FilePath:  drawingPath,
		CreatedAt: time.Now(),
	}))

	// Request feedback to create it
	created, err := svc.RequestFeedback("sess-get-fb")
	require.NoError(t, err)

	// Get feedback and verify all fields match
	got, err := svc.GetFeedback("sess-get-fb")
	require.NoError(t, err)
	assert.Equal(t, created.ID, got.ID)
	assert.Equal(t, created.SessionID, got.SessionID)
	assert.Equal(t, created.OverallScore, got.OverallScore)
	assert.Equal(t, created.Summary, got.Summary)
	assert.Equal(t, created.Details, got.Details)
	assert.Equal(t, created.Strengths, got.Strengths)
	assert.Equal(t, created.Improvements, got.Improvements)
}

func TestFeedbackService_GetFeedback_NotFound(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	aiClient := ai.NewMockFeedbackClient()

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, aiClient, dataDir)

	_, err := svc.GetFeedback("nonexistent-session")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "feedback not found")
}

func TestFeedbackService_RequestFeedback_SessionNotFound(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	aiClient := ai.NewMockFeedbackClient()

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, aiClient, dataDir)

	_, err := svc.RequestFeedback("nonexistent-session")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "get session")
}

func TestFeedbackService_RequestFeedback_DrawingNotFound(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	aiClient := ai.NewMockFeedbackClient()

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, aiClient, dataDir)

	// Create a session but no drawing
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-no-draw",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "completed",
		StartedAt:        time.Now(),
	}))

	_, err := svc.RequestFeedback("sess-no-draw")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "get drawing")
}

func TestFeedbackService_RequestFeedback_ReferenceNotFound(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	aiClient := ai.NewMockFeedbackClient()

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, aiClient, dataDir)

	// Create a session with a valid ref first, then use raw SQL to change the ref ID
	// to a nonexistent one, bypassing FK checks.
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-no-ref",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "completed",
		StartedAt:        time.Now(),
	}))

	// Create a drawing for the session
	drawingPath := filepath.Join(dataDir, "drawings", "sess-no-ref.png")
	require.NoError(t, os.MkdirAll(filepath.Dir(drawingPath), 0755))
	require.NoError(t, os.WriteFile(drawingPath, []byte("fake-drawing"), 0644))
	require.NoError(t, drawingRepo.Create(model.Drawing{
		ID:        "draw-no-ref",
		SessionID: "sess-no-ref",
		FilePath:  drawingPath,
		CreatedAt: time.Now(),
	}))

	// Disable FK checks temporarily to update the session's reference_image_id to a nonexistent value
	_, err := db.Exec("PRAGMA foreign_keys=OFF")
	require.NoError(t, err)
	_, err = db.Exec("UPDATE sessions SET reference_image_id = 'nonexistent-ref' WHERE id = 'sess-no-ref'")
	require.NoError(t, err)
	_, err = db.Exec("PRAGMA foreign_keys=ON")
	require.NoError(t, err)

	_, err = svc.RequestFeedback("sess-no-ref")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "get reference image")
}

func TestFeedbackService_RequestFeedback_DrawingFileMissing(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	aiClient := ai.NewMockFeedbackClient()

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, aiClient, dataDir)

	// Create reference image file and update seeded ref-001
	require.NoError(t, os.MkdirAll(filepath.Join(dataDir, "references"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dataDir, "references", "ref-001.png"), []byte("fake-ref-image"), 0644))
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?", "references/ref-001.png", "ref-001")
	require.NoError(t, err)

	// Create a session
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-missing-file",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "completed",
		StartedAt:        time.Now(),
	}))

	// Create a drawing record pointing to a non-existent file
	require.NoError(t, drawingRepo.Create(model.Drawing{
		ID:        "draw-missing-file",
		SessionID: "sess-missing-file",
		FilePath:  filepath.Join(dataDir, "drawings", "nonexistent.png"),
		CreatedAt: time.Now(),
	}))

	_, err = svc.RequestFeedback("sess-missing-file")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "read drawing file")
}

func TestFeedbackService_RequestFeedback_RefFileMissing(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	aiClient := ai.NewMockFeedbackClient()

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, aiClient, dataDir)

	// Update seeded ref-001 to point to a non-existent file
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?",
		"references/nonexistent-ref.png", "ref-001")
	require.NoError(t, err)

	// Create a session
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-ref-missing",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "completed",
		StartedAt:        time.Now(),
	}))

	// Create a valid drawing file and record
	drawingPath := filepath.Join(dataDir, "drawings", "sess-ref-missing.png")
	require.NoError(t, os.MkdirAll(filepath.Dir(drawingPath), 0755))
	require.NoError(t, os.WriteFile(drawingPath, []byte("fake-drawing"), 0644))
	require.NoError(t, drawingRepo.Create(model.Drawing{
		ID:        "draw-ref-missing",
		SessionID: "sess-ref-missing",
		FilePath:  drawingPath,
		CreatedAt: time.Now(),
	}))

	_, err = svc.RequestFeedback("sess-ref-missing")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "read reference image file")
}

func TestFeedbackService_RequestFeedback_AIClientError(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	aiClient := &errorFeedbackClient{}

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, aiClient, dataDir)

	// Create reference image file and update seeded ref-001
	require.NoError(t, os.MkdirAll(filepath.Join(dataDir, "references"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dataDir, "references", "ref-001.png"), []byte("fake-ref-image"), 0644))
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?", "references/ref-001.png", "ref-001")
	require.NoError(t, err)

	// Create a session
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-ai-err",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "completed",
		StartedAt:        time.Now(),
	}))

	// Create a drawing file and record
	drawingPath := filepath.Join(dataDir, "drawings", "sess-ai-err.png")
	require.NoError(t, os.MkdirAll(filepath.Dir(drawingPath), 0755))
	require.NoError(t, os.WriteFile(drawingPath, []byte("fake-drawing"), 0644))
	require.NoError(t, drawingRepo.Create(model.Drawing{
		ID:        "draw-ai-err",
		SessionID: "sess-ai-err",
		FilePath:  drawingPath,
		CreatedAt: time.Now(),
	}))

	_, err = svc.RequestFeedback("sess-ai-err")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "analyze drawing")
}

func TestFeedbackService_RequestFeedback_StoreFailure(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	aiClient := ai.NewMockFeedbackClient()

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, aiClient, dataDir)

	// Create reference image file and update seeded ref-001
	require.NoError(t, os.MkdirAll(filepath.Join(dataDir, "references"), 0755))
	require.NoError(t, os.WriteFile(filepath.Join(dataDir, "references", "ref-001.png"), []byte("fake-ref-image"), 0644))
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?", "references/ref-001.png", "ref-001")
	require.NoError(t, err)

	// Create a session
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-store-fail",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "completed",
		StartedAt:        time.Now(),
	}))

	// Create a drawing file and record
	drawingPath := filepath.Join(dataDir, "drawings", "sess-store-fail.png")
	require.NoError(t, os.MkdirAll(filepath.Dir(drawingPath), 0755))
	require.NoError(t, os.WriteFile(drawingPath, []byte("fake-drawing"), 0644))
	require.NoError(t, drawingRepo.Create(model.Drawing{
		ID:        "draw-store-fail",
		SessionID: "sess-store-fail",
		FilePath:  drawingPath,
		CreatedAt: time.Now(),
	}))

	// Drop the feedback table to force a store error
	_, err = db.Exec("DROP TABLE feedback")
	require.NoError(t, err)

	_, err = svc.RequestFeedback("sess-store-fail")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "store feedback")
}
