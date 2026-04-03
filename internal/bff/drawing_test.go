package bff

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/michael-freling/anime-craft/internal/model"
	"github.com/michael-freling/anime-craft/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// createTestSession inserts a session record so that drawings can reference it via FK.
func createTestSession(t *testing.T, db *repository.DB, sessionID string) {
	t.Helper()
	sessionRepo := repository.NewSessionRepository(db)
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               sessionID,
		ReferenceImageID: "ref-001", // seeded reference image
		ExerciseMode:     "line_work",
		Status:           "in_progress",
		StartedAt:        time.Now(),
	}))
}

func TestDrawingService_SaveDrawing(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewDrawingService(repository.NewDrawingRepository(db), dataDir)

	createTestSession(t, db, "sess-001")

	imageBytes := []byte("fake-png-data-for-drawing")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	drawing, err := svc.SaveDrawing("sess-001", imageBase64)
	require.NoError(t, err)
	assert.NotEmpty(t, drawing.ID)
	assert.Equal(t, "sess-001", drawing.SessionID)
	assert.Contains(t, drawing.FilePath, "drawings/")
	assert.Contains(t, drawing.FilePath, "sess-001.png")

	// Verify the file was written
	data, err := os.ReadFile(drawing.FilePath)
	require.NoError(t, err)
	assert.Equal(t, imageBytes, data)

	// Verify the DB record
	got, err := svc.GetDrawing("sess-001")
	require.NoError(t, err)
	assert.Equal(t, drawing.ID, got.ID)
	assert.Equal(t, drawing.SessionID, got.SessionID)
	assert.Equal(t, drawing.FilePath, got.FilePath)
}

func TestDrawingService_SaveDrawing_WithDataURI(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewDrawingService(repository.NewDrawingRepository(db), dataDir)

	createTestSession(t, db, "sess-002")

	imageBytes := []byte("fake-png-data")
	imageBase64 := "data:image/png;base64," + base64.StdEncoding.EncodeToString(imageBytes)

	drawing, err := svc.SaveDrawing("sess-002", imageBase64)
	require.NoError(t, err)
	assert.NotEmpty(t, drawing.ID)

	// Verify the file was written with correct decoded content
	data, err := os.ReadFile(drawing.FilePath)
	require.NoError(t, err)
	assert.Equal(t, imageBytes, data)
}

func TestDrawingService_SaveDrawing_InvalidBase64(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewDrawingService(repository.NewDrawingRepository(db), dataDir)

	_, err := svc.SaveDrawing("sess-003", "not-valid-base64!!!")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decode base64")
}

func TestDrawingService_GetDrawing(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewDrawingService(repository.NewDrawingRepository(db), dataDir)

	createTestSession(t, db, "sess-010")

	// Save a drawing first
	imageBytes := []byte("drawing-data-for-get-test")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	saved, err := svc.SaveDrawing("sess-010", imageBase64)
	require.NoError(t, err)

	// Get the drawing back
	got, err := svc.GetDrawing("sess-010")
	require.NoError(t, err)
	assert.Equal(t, saved.ID, got.ID)
	assert.Equal(t, saved.SessionID, got.SessionID)
	assert.Equal(t, saved.FilePath, got.FilePath)
}

func TestDrawingService_GetDrawing_NotFound(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewDrawingService(repository.NewDrawingRepository(db), dataDir)

	_, err := svc.GetDrawing("nonexistent-session")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "drawing not found")
}

func TestDrawingService_SaveDrawing_CreatesDirectory(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewDrawingService(repository.NewDrawingRepository(db), dataDir)

	createTestSession(t, db, "sess-dir-test")

	// Verify drawings directory does not exist yet
	drawingsDir := filepath.Join(dataDir, "drawings")
	_, err := os.Stat(drawingsDir)
	require.True(t, os.IsNotExist(err))

	imageBytes := []byte("drawing-data")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	_, err = svc.SaveDrawing("sess-dir-test", imageBase64)
	require.NoError(t, err)

	// Verify drawings directory was created
	info, err := os.Stat(drawingsDir)
	require.NoError(t, err)
	assert.True(t, info.IsDir())
}

func TestDrawingService_SaveDrawing_MkdirAllFailure(t *testing.T) {
	db := testDB(t)

	// Use a path under a file (not a directory) so MkdirAll fails
	tmpDir := t.TempDir()
	blockingFile := filepath.Join(tmpDir, "blocker")
	require.NoError(t, os.WriteFile(blockingFile, []byte("x"), 0o644))
	// dataDir points under the file, so MkdirAll("blocker/drawings") will fail
	dataDir := blockingFile

	svc := NewDrawingService(repository.NewDrawingRepository(db), dataDir)

	imageBytes := []byte("some-data")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	_, err := svc.SaveDrawing("sess-mkdir-fail", imageBase64)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "create drawings directory")
}

func TestDrawingService_SaveDrawing_WriteFileFailure(t *testing.T) {
	db := testDB(t)
	tmpDir := t.TempDir()

	// Create the drawings directory as read-only so WriteFile fails
	drawingsDir := filepath.Join(tmpDir, "drawings")
	require.NoError(t, os.MkdirAll(drawingsDir, 0o755))
	require.NoError(t, os.Chmod(drawingsDir, 0o444))
	t.Cleanup(func() { _ = os.Chmod(drawingsDir, 0o755) })

	svc := NewDrawingService(repository.NewDrawingRepository(db), tmpDir)

	imageBytes := []byte("some-data")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	_, err := svc.SaveDrawing("sess-write-fail", imageBase64)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "write drawing file")
}

func TestDrawingService_SaveDrawing_RepoCreateFailure(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewDrawingService(repository.NewDrawingRepository(db), dataDir)

	// Do NOT create a session, so the FK constraint will cause repo.Create to fail
	imageBytes := []byte("some-data")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	_, err := svc.SaveDrawing("nonexistent-session", imageBase64)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "create drawing record")
}

func TestDrawingService_GetDrawingImageData(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewDrawingService(repository.NewDrawingRepository(db), dataDir)

	createTestSession(t, db, "sess-img-data")

	imageBytes := []byte("fake-png-data-for-image-data-test")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	_, err := svc.SaveDrawing("sess-img-data", imageBase64)
	require.NoError(t, err)

	// Get the image data as base64 data URI
	result, err := svc.GetDrawingImageData("sess-img-data")
	require.NoError(t, err)
	assert.True(t, len(result) > 0)
	assert.Contains(t, result, "data:image/png;base64,")

	// Verify the base64 content decodes to the original file content
	prefix := "data:image/png;base64,"
	encoded := result[len(prefix):]
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	require.NoError(t, err)
	assert.Equal(t, imageBytes, decoded)
}

func TestDrawingService_GetDrawingImageData_NotFound(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewDrawingService(repository.NewDrawingRepository(db), dataDir)

	_, err := svc.GetDrawingImageData("nonexistent-session")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "get drawing")
}

func TestDrawingService_GetDrawingImageData_FileDeleted(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewDrawingService(repository.NewDrawingRepository(db), dataDir)

	createTestSession(t, db, "sess-file-deleted")

	imageBytes := []byte("data-that-will-be-deleted")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	drawing, err := svc.SaveDrawing("sess-file-deleted", imageBase64)
	require.NoError(t, err)

	// Delete the file to simulate a missing file scenario
	require.NoError(t, os.Remove(drawing.FilePath))

	_, err = svc.GetDrawingImageData("sess-file-deleted")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "read drawing file")
}
