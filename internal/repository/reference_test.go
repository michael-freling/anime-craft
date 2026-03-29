package repository

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReferenceRepository_List(t *testing.T) {
	db := testDB(t)
	repo := NewReferenceRepository(db)

	// List all (seed data has 5 reference images)
	all, err := repo.List("")
	require.NoError(t, err)
	assert.Len(t, all, 5)

	// List by mode
	lineWork, err := repo.List("line_work")
	require.NoError(t, err)
	assert.Len(t, lineWork, 2)
	for _, img := range lineWork {
		assert.Equal(t, "line_work", img.ExerciseMode)
	}

	coloring, err := repo.List("coloring")
	require.NoError(t, err)
	assert.Len(t, coloring, 2)
	for _, img := range coloring {
		assert.Equal(t, "coloring", img.ExerciseMode)
	}

	fullDrawing, err := repo.List("full_drawing")
	require.NoError(t, err)
	assert.Len(t, fullDrawing, 1)
	assert.Equal(t, "full_drawing", fullDrawing[0].ExerciseMode)
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
