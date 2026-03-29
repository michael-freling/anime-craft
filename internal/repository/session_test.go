package repository

import (
	"testing"
	"time"

	"github.com/michael-freling/anime-craft/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testDB(t *testing.T) *DB {
	t.Helper()
	db, err := NewDB(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })
	require.NoError(t, db.RunMigrations())
	return db
}

func TestSessionRepository_CreateAndGet(t *testing.T) {
	db := testDB(t)
	repo := NewSessionRepository(db)

	session := model.Session{
		ID:               "sess-001",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "in_progress",
		StartedAt:        time.Now().Truncate(time.Second),
	}

	err := repo.Create(session)
	require.NoError(t, err)

	got, err := repo.Get("sess-001")
	require.NoError(t, err)
	assert.Equal(t, session.ID, got.ID)
	assert.Equal(t, session.ReferenceImageID, got.ReferenceImageID)
	assert.Equal(t, session.ExerciseMode, got.ExerciseMode)
	assert.Equal(t, session.Status, got.Status)
}

func TestSessionRepository_GetNotFound(t *testing.T) {
	db := testDB(t)
	repo := NewSessionRepository(db)

	_, err := repo.Get("nonexistent")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "session not found")
}

func TestSessionRepository_Update(t *testing.T) {
	db := testDB(t)
	repo := NewSessionRepository(db)

	session := model.Session{
		ID:               "sess-002",
		ReferenceImageID: "ref-001",
		ExerciseMode:     "coloring",
		Status:           "in_progress",
		StartedAt:        time.Now().Truncate(time.Second),
	}
	require.NoError(t, repo.Create(session))

	now := time.Now().Truncate(time.Second)
	duration := 120
	session.Status = "completed"
	session.EndedAt = &now
	session.DurationSeconds = &duration

	err := repo.Update(session)
	require.NoError(t, err)

	got, err := repo.Get("sess-002")
	require.NoError(t, err)
	assert.Equal(t, "completed", got.Status)
	assert.NotNil(t, got.DurationSeconds)
	assert.Equal(t, 120, *got.DurationSeconds)
}

func TestSessionRepository_List(t *testing.T) {
	db := testDB(t)
	repo := NewSessionRepository(db)

	for i, id := range []string{"sess-a", "sess-b", "sess-c"} {
		require.NoError(t, repo.Create(model.Session{
			ID:               id,
			ReferenceImageID: "ref-001",
			ExerciseMode:     "line_work",
			Status:           "in_progress",
			StartedAt:        time.Now().Add(time.Duration(i) * time.Second).Truncate(time.Second),
		}))
	}

	sessions, err := repo.List(2, 0)
	require.NoError(t, err)
	assert.Len(t, sessions, 2)
	// Should be ordered by started_at DESC
	assert.Equal(t, "sess-c", sessions[0].ID)
	assert.Equal(t, "sess-b", sessions[1].ID)

	sessions, err = repo.List(10, 2)
	require.NoError(t, err)
	assert.Len(t, sessions, 1)
	assert.Equal(t, "sess-a", sessions[0].ID)
}
