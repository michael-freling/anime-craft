package bff

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"

	"github.com/michael-freling/anime-craft/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReferenceService_AddReference(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// Create a small valid PNG-like payload (just test bytes, not a real image)
	imageBytes := []byte("fake-png-data-for-testing")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	ref, err := svc.AddReference("Test Image", "beginner", imageBase64)
	require.NoError(t, err)
	assert.NotEmpty(t, ref.ID)
	assert.Equal(t, "Test Image", ref.Title)
	assert.Equal(t, "beginner", ref.Difficulty)
	assert.Equal(t, "line_work", ref.ExerciseMode)
	assert.Equal(t, "", ref.Tags)
	assert.Contains(t, ref.FilePath, "references/")
	assert.Contains(t, ref.FilePath, ".png")

	// Verify the file was written
	absPath := filepath.Join(dataDir, ref.FilePath)
	data, err := os.ReadFile(absPath)
	require.NoError(t, err)
	assert.Equal(t, imageBytes, data)

	// Verify the DB record
	got, err := svc.GetReference(ref.ID)
	require.NoError(t, err)
	assert.Equal(t, ref.ID, got.ID)
	assert.Equal(t, ref.Title, got.Title)
}

func TestReferenceService_AddReference_WithDataURI(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	imageBytes := []byte("fake-png-data")
	imageBase64 := "data:image/png;base64," + base64.StdEncoding.EncodeToString(imageBytes)

	ref, err := svc.AddReference("Data URI Image", "intermediate", imageBase64)
	require.NoError(t, err)
	assert.NotEmpty(t, ref.ID)

	// Verify the file was written with correct decoded content
	absPath := filepath.Join(dataDir, ref.FilePath)
	data, err := os.ReadFile(absPath)
	require.NoError(t, err)
	assert.Equal(t, imageBytes, data)
}

func TestReferenceService_AddReference_InvalidBase64(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	_, err := svc.AddReference("Bad Image", "beginner", "not-valid-base64!!!")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decode base64")
}

func TestReferenceService_DeleteReference(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// First add a reference
	imageBytes := []byte("image-to-delete")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	ref, err := svc.AddReference("To Delete", "beginner", imageBase64)
	require.NoError(t, err)

	absPath := filepath.Join(dataDir, ref.FilePath)
	_, err = os.Stat(absPath)
	require.NoError(t, err, "file should exist before deletion")

	// Delete it
	err = svc.DeleteReference(ref.ID)
	require.NoError(t, err)

	// Verify file is gone
	_, err = os.Stat(absPath)
	assert.True(t, os.IsNotExist(err), "file should be deleted")

	// Verify DB record is gone
	_, err = svc.GetReference(ref.ID)
	require.Error(t, err)
}

func TestReferenceService_DeleteReference_NotFound(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	err := svc.DeleteReference("nonexistent-id")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "get reference for deletion")
}

func TestReferenceService_DeleteReference_FileAlreadyGone(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// Add a reference
	imageBytes := []byte("ephemeral-image")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	ref, err := svc.AddReference("Ephemeral", "beginner", imageBase64)
	require.NoError(t, err)

	// Manually remove the file to simulate it being already gone
	absPath := filepath.Join(dataDir, ref.FilePath)
	require.NoError(t, os.Remove(absPath))

	// Delete should still succeed (file missing is tolerated)
	err = svc.DeleteReference(ref.ID)
	require.NoError(t, err)

	// Verify DB record is gone
	_, err = svc.GetReference(ref.ID)
	require.Error(t, err)
}
