package bff

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/michael-freling/anime-craft/internal/model"
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

func TestReferenceService_AddReferenceByFilePath(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// Create a source image file on disk
	srcDir := t.TempDir()
	srcPath := filepath.Join(srcDir, "test-image.png")
	imageBytes := []byte("fake-png-data-for-file-path-testing")
	require.NoError(t, os.WriteFile(srcPath, imageBytes, 0o644))

	ref, err := svc.AddReferenceByFilePath("File Path Image", "beginner", srcPath)
	require.NoError(t, err)
	assert.NotEmpty(t, ref.ID)
	assert.Equal(t, "File Path Image", ref.Title)
	assert.Equal(t, "beginner", ref.Difficulty)
	assert.Equal(t, "line_work", ref.ExerciseMode)
	assert.Equal(t, "", ref.Tags)
	assert.Contains(t, ref.FilePath, "references/")
	assert.Contains(t, ref.FilePath, ".png")

	// Verify the file was copied
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

func TestReferenceService_AddReferenceByFilePath_FileNotFound(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	_, err := svc.AddReferenceByFilePath("Missing File", "beginner", "/nonexistent/path/image.png")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "read source file")
}

func TestReferenceService_AddReferenceByFilePath_PreservesExtension(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// Create a JPEG source file
	srcDir := t.TempDir()
	srcPath := filepath.Join(srcDir, "photo.jpg")
	imageBytes := []byte("fake-jpeg-data")
	require.NoError(t, os.WriteFile(srcPath, imageBytes, 0o644))

	ref, err := svc.AddReferenceByFilePath("JPEG Image", "intermediate", srcPath)
	require.NoError(t, err)
	assert.Contains(t, ref.FilePath, ".jpg", "should preserve .jpg extension from source file")
	assert.NotContains(t, ref.FilePath, ".png", "should not use .png when source is .jpg")

	// Verify the file was copied with the correct extension
	absPath := filepath.Join(dataDir, ref.FilePath)
	data, err := os.ReadFile(absPath)
	require.NoError(t, err)
	assert.Equal(t, imageBytes, data)
}

func TestReferenceService_AddReferenceByFilePath_EmptyFile(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// Create an empty source file
	srcDir := t.TempDir()
	srcPath := filepath.Join(srcDir, "empty.png")
	require.NoError(t, os.WriteFile(srcPath, []byte{}, 0o644))

	_, err := svc.AddReferenceByFilePath("Empty File", "beginner", srcPath)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "file is empty")
}

func TestReferenceService_AddReferenceByFilePath_NoExtension(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// Create a source file with no extension
	srcDir := t.TempDir()
	srcPath := filepath.Join(srcDir, "imagefile")
	imageBytes := []byte("fake-image-no-ext")
	require.NoError(t, os.WriteFile(srcPath, imageBytes, 0o644))

	ref, err := svc.AddReferenceByFilePath("No Ext Image", "beginner", srcPath)
	require.NoError(t, err)
	assert.Contains(t, ref.FilePath, ".png", "should default to .png when source has no extension")

	// Verify the file was copied
	absPath := filepath.Join(dataDir, ref.FilePath)
	data, err := os.ReadFile(absPath)
	require.NoError(t, err)
	assert.Equal(t, imageBytes, data)
}

func TestReferenceService_GetReferenceImageData(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// Create a reference with a real file
	imageBytes := []byte("fake-png-data-for-testing")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)
	ref, err := svc.AddReference("Test Image", "beginner", imageBase64)
	require.NoError(t, err)

	// Happy path: get image data
	dataURL, err := svc.GetReferenceImageData(ref.ID)
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(dataURL, "data:image/png;base64,"),
		"data URL should start with data:image/png;base64,")

	// Verify the base64 payload decodes to the original bytes
	parts := strings.SplitN(dataURL, ",", 2)
	require.Len(t, parts, 2)
	decoded, err := base64.StdEncoding.DecodeString(parts[1])
	require.NoError(t, err)
	assert.Equal(t, imageBytes, decoded)
}

func TestReferenceService_GetReferenceImageData_NotFound(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	_, err := svc.GetReferenceImageData("nonexistent-id")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "get reference")
}

func TestReferenceService_GetReferenceImageData_FileMissing(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// Create a reference with a file, then delete the file
	imageBytes := []byte("ephemeral-image")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)
	ref, err := svc.AddReference("Ephemeral", "beginner", imageBase64)
	require.NoError(t, err)

	// Remove the file
	absPath := filepath.Join(dataDir, ref.FilePath)
	require.NoError(t, os.Remove(absPath))

	_, err = svc.GetReferenceImageData(ref.ID)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "read image file")
}

func TestReferenceService_GetReferenceImageData_JPEGMimeType(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// Create a JPEG reference via AddReferenceByFilePath
	srcDir := t.TempDir()
	srcPath := filepath.Join(srcDir, "photo.jpg")
	imageBytes := []byte("fake-jpeg-data")
	require.NoError(t, os.WriteFile(srcPath, imageBytes, 0o644))

	ref, err := svc.AddReferenceByFilePath("JPEG Image", "beginner", srcPath)
	require.NoError(t, err)

	dataURL, err := svc.GetReferenceImageData(ref.ID)
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(dataURL, "data:image/jpeg;base64,"),
		"JPEG file should produce data:image/jpeg MIME type")
}

func TestReferenceService_GetReferenceImageData_GIFMimeType(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	srcDir := t.TempDir()
	srcPath := filepath.Join(srcDir, "anim.gif")
	require.NoError(t, os.WriteFile(srcPath, []byte("fake-gif-data"), 0o644))

	ref, err := svc.AddReferenceByFilePath("GIF Image", "beginner", srcPath)
	require.NoError(t, err)

	dataURL, err := svc.GetReferenceImageData(ref.ID)
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(dataURL, "data:image/gif;base64,"),
		"GIF file should produce data:image/gif MIME type")
}

func TestReferenceService_GetReferenceImageData_WebPMimeType(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	srcDir := t.TempDir()
	srcPath := filepath.Join(srcDir, "photo.webp")
	require.NoError(t, os.WriteFile(srcPath, []byte("fake-webp-data"), 0o644))

	ref, err := svc.AddReferenceByFilePath("WebP Image", "beginner", srcPath)
	require.NoError(t, err)

	dataURL, err := svc.GetReferenceImageData(ref.ID)
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(dataURL, "data:image/webp;base64,"),
		"WebP file should produce data:image/webp MIME type")
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

func TestReferenceService_ListReferences(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// The DB has 2 seeded line_work references from migrations.
	// Add more references with mode "line_work" via AddReference (which hardcodes line_work).
	imageBytes := []byte("fake-png-data")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	_, err := svc.AddReference("Alpha", "beginner", imageBase64)
	require.NoError(t, err)
	_, err = svc.AddReference("Bravo", "intermediate", imageBase64)
	require.NoError(t, err)
	_, err = svc.AddReference("Charlie", "advanced", imageBase64)
	require.NoError(t, err)

	refs, err := svc.ListReferences("line_work")
	require.NoError(t, err)
	// 2 seeded + 3 added = 5 total
	require.Len(t, refs, 5)

	for _, ref := range refs {
		assert.Equal(t, "line_work", ref.ExerciseMode)
	}

	// Results are ordered by title; verify added ones are present
	titles := make([]string, len(refs))
	for i, ref := range refs {
		titles[i] = ref.Title
	}
	assert.Contains(t, titles, "Alpha")
	assert.Contains(t, titles, "Bravo")
	assert.Contains(t, titles, "Charlie")
}

func TestReferenceService_ListReferences_EmptyList(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// Use a mode that has no seeded data so we get an empty result
	refs, err := svc.ListReferences("color_study")
	require.NoError(t, err)
	assert.Empty(t, refs)
}

func TestReferenceService_ListReferences_DBError(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// Drop the table to force a query error
	_, err := db.Exec("DROP TABLE reference_images")
	require.NoError(t, err)

	_, err = svc.ListReferences("line_work")
	require.Error(t, err)
}

func TestReferenceService_AddReference_MkdirAllFailure(t *testing.T) {
	db := testDB(t)
	// Use a path under a regular file so MkdirAll fails
	tmpDir := t.TempDir()
	blockingFile := filepath.Join(tmpDir, "blocker")
	require.NoError(t, os.WriteFile(blockingFile, []byte("x"), 0o644))
	dataDir := blockingFile

	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	imageBytes := []byte("fake-png-data")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	_, err := svc.AddReference("Test", "beginner", imageBase64)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "create references directory")
}

func TestReferenceService_AddReference_WriteFileFailure(t *testing.T) {
	db := testDB(t)
	tmpDir := t.TempDir()

	// Create the references directory as read-only so WriteFile fails
	refsDir := filepath.Join(tmpDir, "references")
	require.NoError(t, os.MkdirAll(refsDir, 0o755))
	require.NoError(t, os.Chmod(refsDir, 0o444))
	t.Cleanup(func() { _ = os.Chmod(refsDir, 0o755) })

	svc := NewReferenceService(repository.NewReferenceRepository(db), tmpDir)

	imageBytes := []byte("fake-png-data")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	_, err := svc.AddReference("Test", "beginner", imageBase64)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "write reference image file")
}

func TestReferenceService_AddReference_RepoCreateFailure(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	imageBytes := []byte("fake-png-data")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)

	// Drop the table to force a repo create error
	_, err := db.Exec("DROP TABLE reference_images")
	require.NoError(t, err)

	_, err = svc.AddReference("Test", "beginner", imageBase64)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "create reference record")
}

func TestReferenceService_AddReferenceByFilePath_MkdirAllFailure(t *testing.T) {
	db := testDB(t)
	// Use a path under a regular file so MkdirAll fails
	tmpDir := t.TempDir()
	blockingFile := filepath.Join(tmpDir, "blocker")
	require.NoError(t, os.WriteFile(blockingFile, []byte("x"), 0o644))
	dataDir := blockingFile

	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// Create a valid source file
	srcDir := t.TempDir()
	srcPath := filepath.Join(srcDir, "test.png")
	require.NoError(t, os.WriteFile(srcPath, []byte("some-data"), 0o644))

	_, err := svc.AddReferenceByFilePath("Test", "beginner", srcPath)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "create references directory")
}

func TestReferenceService_AddReferenceByFilePath_WriteFileFailure(t *testing.T) {
	db := testDB(t)
	tmpDir := t.TempDir()

	// Create the references directory as read-only so WriteFile fails
	refsDir := filepath.Join(tmpDir, "references")
	require.NoError(t, os.MkdirAll(refsDir, 0o755))
	require.NoError(t, os.Chmod(refsDir, 0o444))
	t.Cleanup(func() { _ = os.Chmod(refsDir, 0o755) })

	svc := NewReferenceService(repository.NewReferenceRepository(db), tmpDir)

	srcDir := t.TempDir()
	srcPath := filepath.Join(srcDir, "test.png")
	require.NoError(t, os.WriteFile(srcPath, []byte("some-data"), 0o644))

	_, err := svc.AddReferenceByFilePath("Test", "beginner", srcPath)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "write reference image file")
}

func TestReferenceService_AddReferenceByFilePath_RepoCreateFailure(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	srcDir := t.TempDir()
	srcPath := filepath.Join(srcDir, "test.png")
	require.NoError(t, os.WriteFile(srcPath, []byte("some-data"), 0o644))

	// Drop the table to force a repo create error
	_, err := db.Exec("DROP TABLE reference_images")
	require.NoError(t, err)

	_, err = svc.AddReferenceByFilePath("Test", "beginner", srcPath)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "create reference record")
}

func TestReferenceService_GetReferenceImageData_BMPMimeType(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	srcDir := t.TempDir()
	srcPath := filepath.Join(srcDir, "image.bmp")
	require.NoError(t, os.WriteFile(srcPath, []byte("fake-bmp-data"), 0o644))

	ref, err := svc.AddReferenceByFilePath("BMP Image", "beginner", srcPath)
	require.NoError(t, err)

	dataURL, err := svc.GetReferenceImageData(ref.ID)
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(dataURL, "data:image/bmp;base64,"),
		"BMP file should produce data:image/bmp MIME type")
}

func TestReferenceService_DeleteReference_RepoDeleteFailure(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	svc := NewReferenceService(repository.NewReferenceRepository(db), dataDir)

	// Add a reference
	imageBytes := []byte("some-image")
	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)
	ref, err := svc.AddReference("To Delete", "beginner", imageBase64)
	require.NoError(t, err)

	// Create an FK dependency on this reference by creating a session referencing it
	sessionRepo := repository.NewSessionRepository(db)
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-block-delete",
		ReferenceImageID: ref.ID,
		ExerciseMode:     "line_work",
		Status:           "in_progress",
		StartedAt:        time.Now(),
	}))

	// Deleting should fail because of FK constraint
	err = svc.DeleteReference(ref.ID)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "delete reference record")
}

func TestReferenceService_ListReferences_FiltersByMode(t *testing.T) {
	db := testDB(t)
	dataDir := t.TempDir()
	repo := repository.NewReferenceRepository(db)
	svc := NewReferenceService(repo, dataDir)

	// Insert references with different modes directly via the repository
	// since AddReference hardcodes mode to "line_work"
	now := time.Now()
	require.NoError(t, repo.Create(model.ReferenceImage{
		ID:           "id-line-1",
		Title:        "Line Work 1",
		FilePath:     "references/line1.png",
		ExerciseMode: "line_work",
		Difficulty:   "beginner",
		CreatedAt:    now,
	}))
	require.NoError(t, repo.Create(model.ReferenceImage{
		ID:           "id-line-2",
		Title:        "Line Work 2",
		FilePath:     "references/line2.png",
		ExerciseMode: "line_work",
		Difficulty:   "intermediate",
		CreatedAt:    now,
	}))
	require.NoError(t, repo.Create(model.ReferenceImage{
		ID:           "id-color-1",
		Title:        "Color Study 1",
		FilePath:     "references/color1.png",
		ExerciseMode: "color_study",
		Difficulty:   "beginner",
		CreatedAt:    now,
	}))
	require.NoError(t, repo.Create(model.ReferenceImage{
		ID:           "id-gesture-1",
		Title:        "Gesture 1",
		FilePath:     "references/gesture1.png",
		ExerciseMode: "gesture",
		Difficulty:   "advanced",
		CreatedAt:    now,
	}))

	// Filter for line_work: should return 2 seeded + 2 inserted = 4 line_work references
	lineRefs, err := svc.ListReferences("line_work")
	require.NoError(t, err)
	require.Len(t, lineRefs, 4)
	for _, ref := range lineRefs {
		assert.Equal(t, "line_work", ref.ExerciseMode)
	}

	// Filter for color_study: should return only the 1 color_study reference
	colorRefs, err := svc.ListReferences("color_study")
	require.NoError(t, err)
	require.Len(t, colorRefs, 1)
	assert.Equal(t, "id-color-1", colorRefs[0].ID)
	assert.Equal(t, "color_study", colorRefs[0].ExerciseMode)

	// Filter for gesture: should return only the 1 gesture reference
	gestureRefs, err := svc.ListReferences("gesture")
	require.NoError(t, err)
	require.Len(t, gestureRefs, 1)
	assert.Equal(t, "id-gesture-1", gestureRefs[0].ID)
	assert.Equal(t, "gesture", gestureRefs[0].ExerciseMode)

	// Filter for nonexistent mode: should return empty
	noneRefs, err := svc.ListReferences("nonexistent_mode")
	require.NoError(t, err)
	assert.Empty(t, noneRefs)
}
