package repository

import (
	"testing"
	"time"

	"github.com/michael-freling/anime-craft/gateway/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReferenceRepository_List(t *testing.T) {
	db := testDB(t)
	repo := NewReferenceRepository(db)

	// List all (seed data has 2 reference images, both line_work)
	all, err := repo.List("")
	require.NoError(t, err)
	assert.Len(t, all, 2)

	// List by mode
	lineWork, err := repo.List("line_work")
	require.NoError(t, err)
	assert.Len(t, lineWork, 2)
	for _, img := range lineWork {
		assert.Equal(t, "line_work", img.ExerciseMode)
	}
}

func TestReferenceRepository_Get(t *testing.T) {
	db := testDB(t)
	repo := NewReferenceRepository(db)

	img, err := repo.Get("ref-001")
	require.NoError(t, err)
	assert.Equal(t, "ref-001", img.ID)
	assert.Equal(t, "Simple Face - Lines", img.Title)
	assert.Equal(t, "line_work", img.ExerciseMode)
	assert.Equal(t, "beginner", img.Difficulty)

	// Non-existent
	_, err = repo.Get("nonexistent")
	require.Error(t, err)
}

func TestReferenceRepository_Create(t *testing.T) {
	db := testDB(t)
	repo := NewReferenceRepository(db)

	ref := model.ReferenceImage{
		ID:           "ref-new-001",
		Title:        "New Reference",
		FilePath:     "references/ref-new-001.png",
		ExerciseMode: "line_work",
		Difficulty:   "intermediate",
		Tags:         "test,new",
		CreatedAt:    time.Now().Truncate(time.Second),
	}

	err := repo.Create(ref)
	require.NoError(t, err)

	got, err := repo.Get("ref-new-001")
	require.NoError(t, err)
	assert.Equal(t, ref.ID, got.ID)
	assert.Equal(t, ref.Title, got.Title)
	assert.Equal(t, ref.FilePath, got.FilePath)
	assert.Equal(t, ref.ExerciseMode, got.ExerciseMode)
	assert.Equal(t, ref.Difficulty, got.Difficulty)
	assert.Equal(t, ref.Tags, got.Tags)

	// Verify it appears in the list
	all, err := repo.List("")
	require.NoError(t, err)
	assert.Len(t, all, 3) // 2 seed + 1 new
}

func TestReferenceRepository_Create_DuplicateID(t *testing.T) {
	db := testDB(t)
	repo := NewReferenceRepository(db)

	ref := model.ReferenceImage{
		ID:           "ref-001", // already exists in seed data
		Title:        "Duplicate",
		FilePath:     "references/dup.png",
		ExerciseMode: "line_work",
		Difficulty:   "beginner",
		Tags:         "",
		CreatedAt:    time.Now().Truncate(time.Second),
	}

	err := repo.Create(ref)
	require.Error(t, err)
}

func TestReferenceRepository_Delete(t *testing.T) {
	db := testDB(t)
	repo := NewReferenceRepository(db)

	// Delete an existing seed record
	err := repo.Delete("ref-001")
	require.NoError(t, err)

	// Verify it's gone
	_, err = repo.Get("ref-001")
	require.Error(t, err)

	// List should now have 1
	all, err := repo.List("")
	require.NoError(t, err)
	assert.Len(t, all, 1)
}

func TestReferenceRepository_Delete_NotFound(t *testing.T) {
	db := testDB(t)
	repo := NewReferenceRepository(db)

	err := repo.Delete("nonexistent")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "reference image not found")
}
