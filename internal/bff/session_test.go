package bff

import (
	"testing"

	"github.com/michael-freling/anime-craft/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testDB(t *testing.T) *repository.DB {
	t.Helper()
	db, err := repository.NewDB(":memory:")
	require.NoError(t, err)
	require.NoError(t, db.RunMigrations())
	return db
}

func TestSessionService_StartSession_ValidModes(t *testing.T) {
	db := testDB(t)
	svc := NewSessionService(repository.NewSessionRepository(db))

	for _, mode := range []string{"line_work", "coloring", "full_drawing"} {
		session, err := svc.StartSession(mode, "ref-001")
		require.NoError(t, err)
		assert.NotEmpty(t, session.ID)
		assert.Equal(t, mode, session.ExerciseMode)
		assert.Equal(t, "in_progress", session.Status)
		assert.Equal(t, "ref-001", session.ReferenceImageID)
	}
}

func TestSessionService_StartSession_InvalidMode(t *testing.T) {
	db := testDB(t)
	svc := NewSessionService(repository.NewSessionRepository(db))

	_, err := svc.StartSession("invalid_mode", "ref-001")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid exercise mode")
}

func TestSessionService_EndSession(t *testing.T) {
	db := testDB(t)
	svc := NewSessionService(repository.NewSessionRepository(db))

	session, err := svc.StartSession("line_work", "ref-001")
	require.NoError(t, err)

	ended, err := svc.EndSession(session.ID)
	require.NoError(t, err)
	assert.Equal(t, "completed", ended.Status)
	assert.NotNil(t, ended.EndedAt)
	assert.NotNil(t, ended.DurationSeconds)
}

func TestSessionService_EndSession_AlreadyCompleted(t *testing.T) {
	db := testDB(t)
	svc := NewSessionService(repository.NewSessionRepository(db))

	session, err := svc.StartSession("coloring", "ref-001")
	require.NoError(t, err)

	_, err = svc.EndSession(session.ID)
	require.NoError(t, err)

	_, err = svc.EndSession(session.ID)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not in progress")
}

func TestSessionService_EndSession_NotFound(t *testing.T) {
	db := testDB(t)
	svc := NewSessionService(repository.NewSessionRepository(db))

	_, err := svc.EndSession("nonexistent")
	require.Error(t, err)
}

func TestSessionService_ListSessions(t *testing.T) {
	db := testDB(t)
	svc := NewSessionService(repository.NewSessionRepository(db))

	for range 3 {
		_, err := svc.StartSession("line_work", "ref-001")
		require.NoError(t, err)
	}

	sessions, err := svc.ListSessions(10, 0)
	require.NoError(t, err)
	assert.Len(t, sessions, 3)
}
