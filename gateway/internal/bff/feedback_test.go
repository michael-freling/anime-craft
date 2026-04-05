package bff

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/michael-freling/anime-craft/gateway/internal/ai"
	"github.com/michael-freling/anime-craft/gateway/internal/model"
	"github.com/michael-freling/anime-craft/gateway/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

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
	refPath := filepath.Join(dataDir, "ref.png")
	require.NoError(t, os.WriteFile(refPath, []byte("fake-ref-image"), 0644))
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?", refPath, "ref-001")
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
	refPath := filepath.Join(dataDir, "ref.png")
	require.NoError(t, os.WriteFile(refPath, []byte("fake-ref-image"), 0644))
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?", refPath, "ref-001")
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
