package repository

import (
	"testing"
	"time"

	"github.com/michael-freling/anime-craft/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDrawingRepository_CreateAndGetBySessionID(t *testing.T) {
	db := testDB(t)
	sessionRepo := NewSessionRepository(db)
	drawingRepo := NewDrawingRepository(db)

	// Create a session first (FK constraint)
	require.NoError(t, sessionRepo.Create(model.Session{
		ID:               "sess-100",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "in_progress",
		StartedAt:        time.Now().Truncate(time.Second),
	}))

	drawing := model.Drawing{
		ID:        "draw-001",
		SessionID: "sess-100",
		FilePath:  "/data/drawings/sess-100.png",
		CreatedAt: time.Now().Truncate(time.Second),
	}

	err := drawingRepo.Create(drawing)
	require.NoError(t, err)

	got, err := drawingRepo.GetBySessionID("sess-100")
	require.NoError(t, err)
	assert.Equal(t, drawing.ID, got.ID)
	assert.Equal(t, drawing.SessionID, got.SessionID)
	assert.Equal(t, drawing.FilePath, got.FilePath)
}

func TestDrawingRepository_GetBySessionID_NotFound(t *testing.T) {
	db := testDB(t)
	drawingRepo := NewDrawingRepository(db)

	_, err := drawingRepo.GetBySessionID("nonexistent")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "drawing not found")
}
