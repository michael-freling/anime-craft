package bff

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/michael-freling/anime-craft/internal/model"
	"github.com/michael-freling/anime-craft/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockLineArtExtractor is a test double that returns a minimal valid PNG.
type mockLineArtExtractor struct{}

func (m *mockLineArtExtractor) Extract(pngData []byte) ([]byte, error) {
	// Verify input is valid PNG by decoding it
	_, err := png.Decode(bytes.NewReader(pngData))
	if err != nil {
		return nil, err
	}
	// Return a 1x1 white pixel PNG
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.White)
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// createTestPNGFile writes a small valid PNG file to the given path.
func createTestPNGFile(t *testing.T, path string) {
	t.Helper()
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0755))
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	img.Set(1, 1, color.RGBA{B: 255, A: 255})
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))
	require.NoError(t, os.WriteFile(path, buf.Bytes(), 0644))
}

func TestFeedbackService_RequestFeedback(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, nil)

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
	assert.False(t, feedback.CreatedAt.IsZero())

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

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, nil)

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

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, nil)

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

	// Get feedback and verify fields match
	got, err := svc.GetFeedback("sess-get-fb")
	require.NoError(t, err)
	assert.Equal(t, created.ID, got.ID)
	assert.Equal(t, created.SessionID, got.SessionID)
}

func TestFeedbackService_GetFeedback_NotFound(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, nil)

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

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, nil)

	_, err := svc.RequestFeedback("nonexistent-session")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "get session")
}

func TestFeedbackService_RequestFeedback_ReferenceNotFound(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, nil)

	// Create a session with a valid ref first, then use raw SQL to change the ref ID
	// to a nonexistent one, bypassing FK checks.
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-no-ref",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "completed",
		StartedAt:        time.Now(),
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

func TestFeedbackService_RequestFeedback_RefFileMissing(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, nil)

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

	_, err = svc.RequestFeedback("sess-ref-missing")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "read reference image file")
}

func TestFeedbackService_RequestFeedback_StoreFailure(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, nil)

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

	// Drop the feedback table to force a store error
	_, err = db.Exec("DROP TABLE feedback")
	require.NoError(t, err)

	_, err = svc.RequestFeedback("sess-store-fail")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "store feedback")
}

func TestFeedbackService_RequestFeedback_WithLineArt(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)

	dataDir := t.TempDir()

	extractor := &mockLineArtExtractor{}
	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, extractor)

	// Create a valid PNG reference image file
	refImagePath := filepath.Join(dataDir, "references", "ref-001.png")
	createTestPNGFile(t, refImagePath)
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?", "references/ref-001.png", "ref-001")
	require.NoError(t, err)

	// Create a session
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-lineart",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "completed",
		StartedAt:        time.Now(),
	}))

	// Create a drawing
	drawingPath := filepath.Join(dataDir, "drawings", "sess-lineart.png")
	createTestPNGFile(t, drawingPath)
	require.NoError(t, drawingRepo.Create(model.Drawing{
		ID:        "draw-lineart",
		SessionID: "sess-lineart",
		FilePath:  drawingPath,
		CreatedAt: time.Now(),
	}))

	// Request feedback
	feedback, err := svc.RequestFeedback("sess-lineart")
	require.NoError(t, err)
	assert.NotEmpty(t, feedback.ID)
	assert.Equal(t, "sess-lineart", feedback.SessionID)
	assert.Contains(t, feedback.ReferenceLineArt, "data:image/png;base64,",
		"ReferenceLineArt should contain data:image/png;base64,")
	assert.Greater(t, len(feedback.ReferenceLineArt), len("data:image/png;base64,"),
		"ReferenceLineArt should contain base64 data after the prefix")
}

func TestFeedbackService_GetFeedback_WithLineArt(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)

	dataDir := t.TempDir()

	extractor := &mockLineArtExtractor{}
	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, extractor)

	// Create a valid PNG reference image file
	refImagePath := filepath.Join(dataDir, "references", "ref-001.png")
	createTestPNGFile(t, refImagePath)
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?", "references/ref-001.png", "ref-001")
	require.NoError(t, err)

	// Create a session
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-lineart-get",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "completed",
		StartedAt:        time.Now(),
	}))

	// Create a drawing
	drawingPath := filepath.Join(dataDir, "drawings", "sess-lineart-get.png")
	createTestPNGFile(t, drawingPath)
	require.NoError(t, drawingRepo.Create(model.Drawing{
		ID:        "draw-lineart-get",
		SessionID: "sess-lineart-get",
		FilePath:  drawingPath,
		CreatedAt: time.Now(),
	}))

	// Request feedback first to create the record
	created, err := svc.RequestFeedback("sess-lineart-get")
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)

	// Get feedback -- this tests the cached/read-back path
	got, err := svc.GetFeedback("sess-lineart-get")
	require.NoError(t, err)
	assert.Equal(t, created.ID, got.ID)
	assert.Contains(t, got.ReferenceLineArt, "data:image/png;base64,",
		"GetFeedback ReferenceLineArt should contain data:image/png;base64,")
	assert.Greater(t, len(got.ReferenceLineArt), len("data:image/png;base64,"),
		"GetFeedback ReferenceLineArt should contain base64 data after the prefix")
}

func TestFeedbackService_RequestFeedback_WithoutLineArt(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)

	dataDir := t.TempDir()

	// Pass nil extractor -- line art should be empty
	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, nil)

	// Create a valid PNG reference image file (content doesn't matter since extractor is nil)
	refImagePath := filepath.Join(dataDir, "references", "ref-001.png")
	createTestPNGFile(t, refImagePath)
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?", "references/ref-001.png", "ref-001")
	require.NoError(t, err)

	// Create a session
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-no-lineart",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "completed",
		StartedAt:        time.Now(),
	}))

	// Create a drawing
	drawingPath := filepath.Join(dataDir, "drawings", "sess-no-lineart.png")
	createTestPNGFile(t, drawingPath)
	require.NoError(t, drawingRepo.Create(model.Drawing{
		ID:        "draw-no-lineart",
		SessionID: "sess-no-lineart",
		FilePath:  drawingPath,
		CreatedAt: time.Now(),
	}))

	// Request feedback
	feedback, err := svc.RequestFeedback("sess-no-lineart")
	require.NoError(t, err)
	assert.NotEmpty(t, feedback.ID)
	assert.Empty(t, feedback.ReferenceLineArt, "ReferenceLineArt should be empty when extractor is nil")
}
