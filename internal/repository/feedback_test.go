package repository

import (
	"testing"
	"time"

	"github.com/michael-freling/anime-craft/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFeedbackRepository_CreateAndGetBySessionID(t *testing.T) {
	db := testDB(t)
	repo := NewFeedbackRepository(db)

	// Insert a session using seeded reference image (ref-001 from seed data)
	_, err := db.Exec(
		"INSERT INTO sessions (id, reference_image_id, exercise_mode, status, started_at) VALUES (?, ?, ?, ?, ?)",
		"sess-001", "ref-001", "line_work", "completed", time.Now(),
	)
	require.NoError(t, err)

	feedback := model.Feedback{
		ID:        "fb-001",
		SessionID: "sess-001",
		CreatedAt: time.Now().Truncate(time.Second),
	}

	err = repo.Create(feedback)
	require.NoError(t, err)

	got, err := repo.GetBySessionID("sess-001")
	require.NoError(t, err)
	assert.Equal(t, feedback.ID, got.ID)
	assert.Equal(t, feedback.SessionID, got.SessionID)
}

func TestFeedbackRepository_GetBySessionID_NotFound(t *testing.T) {
	db := testDB(t)
	repo := NewFeedbackRepository(db)

	_, err := repo.GetBySessionID("nonexistent")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "feedback not found")
}

func TestFeedbackRepository_Create_DuplicateSessionID(t *testing.T) {
	db := testDB(t)
	repo := NewFeedbackRepository(db)

	// Insert a session
	_, err := db.Exec(
		"INSERT INTO sessions (id, reference_image_id, exercise_mode, status, started_at) VALUES (?, ?, ?, ?, ?)",
		"sess-dup-fb", "ref-001", "line_work", "completed", time.Now(),
	)
	require.NoError(t, err)

	feedback := model.Feedback{
		ID:        "fb-dup-1",
		SessionID: "sess-dup-fb",
		CreatedAt: time.Now().Truncate(time.Second),
	}

	err = repo.Create(feedback)
	require.NoError(t, err)

	// Creating another feedback for the same session should fail (UNIQUE constraint)
	feedback2 := model.Feedback{
		ID:        "fb-dup-2",
		SessionID: "sess-dup-fb",
		CreatedAt: time.Now().Truncate(time.Second),
	}
	err = repo.Create(feedback2)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "insert feedback")
}

func TestFeedbackRepository_GetBySessionID_DBClosed(t *testing.T) {
	db := testDB(t)
	repo := NewFeedbackRepository(db)

	require.NoError(t, db.Close())

	_, err := repo.GetBySessionID("any-session")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "get feedback")
}
