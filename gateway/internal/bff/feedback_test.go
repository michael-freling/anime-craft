package bff

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	pb "github.com/michael-freling/anime-craft/gateway/internal/inference/pb"
	"github.com/michael-freling/anime-craft/gateway/internal/model"
	"github.com/michael-freling/anime-craft/gateway/internal/repository"
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

// countingImageComparer records how often the inference service is asked for
// a heatmap, so a test can show that revisiting a result does not ask again.
type countingImageComparer struct{ calls int }

func (c *countingImageComparer) CompareImages(_ context.Context, _ []byte, _ []byte) ([]byte, error) {
	c.calls++
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.RGBA{R: 200, A: 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// countingLineArtExtractor is mockLineArtExtractor with a call count.
type countingLineArtExtractor struct {
	mockLineArtExtractor
	calls int
}

func (c *countingLineArtExtractor) Extract(pngData []byte) ([]byte, error) {
	c.calls++
	return c.mockLineArtExtractor.Extract(pngData)
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

// mockFeedbackGenerator is a test double for FeedbackGenerator that returns
// deterministic feedback matching the values the old ai.MockFeedbackClient
// returned for "line_work" mode.
type mockFeedbackGenerator struct{}

func (m *mockFeedbackGenerator) GenerateFeedback(_ context.Context, _ []byte, _ []byte, exerciseMode string) (*pb.FeedbackResult, error) {
	result := &pb.FeedbackResult{
		OverallScore:     72,
		ProportionsScore: 75,
		LineQualityScore: 68,
		AccuracyScore:    0,
		Summary:          "Good effort! Your proportions are solid, but the line work could be smoother. Keep practicing to build line confidence.",
		Details:          "Your drawing shows a good understanding of the overall shape and proportions of the reference. The main areas for improvement are in line quality — try drawing longer, more confident strokes instead of short, sketchy lines. Focus on varying line weight to add depth and dimension.",
		Strengths:        []string{"Good overall proportions", "Clean line intersections", "Accurate placement of features"},
		Improvements:     []string{"Work on line confidence — try drawing strokes in single motions", "Vary line weight to convey depth and form", "Practice consistent line weight throughout the drawing"},
	}

	// The old mock returned ColorAccuracyScore=73 for non-line_work modes.
	// The proto-based FeedbackResult uses AccuracyScore instead.
	if exerciseMode != "line_work" {
		result.AccuracyScore = 73
	}

	return result, nil
}

func TestFeedbackService_RequestFeedback(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	generator := &mockFeedbackGenerator{}

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, nil, generator, nil)

	// Create reference image file and update seeded ref-001 to point to it (relative path)
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
	assert.Nil(t, feedback.AccuracyScore) // line_work mode: accuracy=0 so not set
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
	generator := &mockFeedbackGenerator{}

	dataDir := t.TempDir()

	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, nil, generator, nil)

	// Create reference image file and update seeded ref-001 to point to it (relative path)
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

func TestFeedbackService_RequestFeedback_WithLineArt(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	generator := &mockFeedbackGenerator{}

	dataDir := t.TempDir()

	extractor := &mockLineArtExtractor{}
	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, extractor, generator, nil)

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

func TestFeedbackService_RequestFeedback_CachedWithLineArt(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	generator := &mockFeedbackGenerator{}

	dataDir := t.TempDir()

	extractor := &mockLineArtExtractor{}
	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, extractor, generator, nil)

	// Create a valid PNG reference image file
	refImagePath := filepath.Join(dataDir, "references", "ref-001.png")
	createTestPNGFile(t, refImagePath)
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?", "references/ref-001.png", "ref-001")
	require.NoError(t, err)

	// Create a session
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-cached-lineart",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "completed",
		StartedAt:        time.Now(),
	}))

	// Create a drawing
	drawingPath := filepath.Join(dataDir, "drawings", "sess-cached-lineart.png")
	createTestPNGFile(t, drawingPath)
	require.NoError(t, drawingRepo.Create(model.Drawing{
		ID:        "draw-cached-lineart",
		SessionID: "sess-cached-lineart",
		FilePath:  drawingPath,
		CreatedAt: time.Now(),
	}))

	// First call creates feedback
	first, err := svc.RequestFeedback("sess-cached-lineart")
	require.NoError(t, err)
	assert.Contains(t, first.ReferenceLineArt, "data:image/png;base64,")

	// Second call hits the cached path -- must still return line art
	second, err := svc.RequestFeedback("sess-cached-lineart")
	require.NoError(t, err)
	assert.Equal(t, first.ID, second.ID, "should return same feedback")
	assert.Contains(t, second.ReferenceLineArt, "data:image/png;base64,",
		"cached RequestFeedback must still populate line art")
}

func TestFeedbackService_GetFeedback_WithLineArt(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)
	generator := &mockFeedbackGenerator{}

	dataDir := t.TempDir()

	extractor := &mockLineArtExtractor{}
	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, extractor, generator, nil)

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
	generator := &mockFeedbackGenerator{}

	dataDir := t.TempDir()

	// Pass nil extractor -- line art should be empty
	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, nil, generator, nil)

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

// The scores go to the database, but the pictures the analysis produces used
// to be rebuilt by the inference service on every visit — which is least
// likely to be running exactly when an old result is being looked at.
func TestFeedbackService_KeepsTheAnalysisImages(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)

	dataDir := t.TempDir()
	extractor := &countingLineArtExtractor{}
	comparer := &countingImageComparer{}
	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir,
		extractor, &mockFeedbackGenerator{}, comparer)

	createTestPNGFile(t, filepath.Join(dataDir, "references", "ref-001.png"))
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?", "references/ref-001.png", "ref-001")
	require.NoError(t, err)
	require.NoError(t, sessionRepo.Create(model.Session{
		ID: "sess-keep", ReferenceImageID: "ref-001", ExerciseMode: "line_work",
		Status: "completed", StartedAt: time.Now(),
	}))
	drawingPath := filepath.Join(dataDir, "drawings", "sess-keep.png")
	createTestPNGFile(t, drawingPath)
	require.NoError(t, drawingRepo.Create(model.Drawing{
		ID: "draw-keep", SessionID: "sess-keep", FilePath: drawingPath, CreatedAt: time.Now(),
	}))

	first, err := svc.RequestFeedback("sess-keep")
	require.NoError(t, err)
	require.Contains(t, first.ReferenceLineArt, "data:image/png;base64,")
	require.Contains(t, first.ComparisonHeatmap, "data:image/png;base64,")

	// Both pictures are on disk next to the drawing.
	assert.FileExists(t, filepath.Join(dataDir, "feedback", "sess-keep", referenceLineArtFile))
	assert.FileExists(t, filepath.Join(dataDir, "feedback", "sess-keep", comparisonHeatmapFile))

	extractorCalls, comparerCalls := extractor.calls, comparer.calls

	// Looking at the result again returns the same pictures without asking
	// the inference service for them a second time.
	again, err := svc.RequestFeedback("sess-keep")
	require.NoError(t, err)
	assert.Equal(t, first.ReferenceLineArt, again.ReferenceLineArt)
	assert.Equal(t, first.ComparisonHeatmap, again.ComparisonHeatmap)
	assert.Equal(t, extractorCalls, extractor.calls, "the line art is not extracted again")
	assert.Equal(t, comparerCalls, comparer.calls, "the heatmap is not rebuilt")
}

// A result saved before the pictures were kept must still open, rebuilding
// them once so the next visit is free.
func TestFeedbackService_RebuildsAnalysisImagesOnceForOlderResults(t *testing.T) {
	db := testDB(t)
	feedbackRepo := repository.NewFeedbackRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	refRepo := repository.NewReferenceRepository(db)

	dataDir := t.TempDir()
	extractor := &countingLineArtExtractor{}
	comparer := &countingImageComparer{}
	svc := NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir,
		extractor, &mockFeedbackGenerator{}, comparer)

	createTestPNGFile(t, filepath.Join(dataDir, "references", "ref-001.png"))
	_, err := db.Exec("UPDATE reference_images SET file_path = ? WHERE id = ?", "references/ref-001.png", "ref-001")
	require.NoError(t, err)
	require.NoError(t, sessionRepo.Create(model.Session{
		ID: "sess-old", ReferenceImageID: "ref-001", ExerciseMode: "line_work",
		Status: "completed", StartedAt: time.Now(),
	}))
	drawingPath := filepath.Join(dataDir, "drawings", "sess-old.png")
	createTestPNGFile(t, drawingPath)
	require.NoError(t, drawingRepo.Create(model.Drawing{
		ID: "draw-old", SessionID: "sess-old", FilePath: drawingPath, CreatedAt: time.Now(),
	}))
	// Feedback recorded by an older version, with no pictures kept for it.
	require.NoError(t, feedbackRepo.Create(model.Feedback{
		ID: "fb-old", SessionID: "sess-old", OverallScore: 64,
		Summary: "An earlier attempt.", CreatedAt: time.Now(),
	}))

	restored, err := svc.RequestFeedback("sess-old")
	require.NoError(t, err)
	assert.Equal(t, 64, restored.OverallScore, "the stored result is not regenerated")
	assert.Contains(t, restored.ReferenceLineArt, "data:image/png;base64,")
	assert.Equal(t, 1, extractor.calls)

	// Rebuilt once, then kept.
	again, err := svc.RequestFeedback("sess-old")
	require.NoError(t, err)
	assert.Equal(t, restored.ReferenceLineArt, again.ReferenceLineArt)
	assert.Equal(t, 1, extractor.calls, "rebuilt once, not on every visit")
}
