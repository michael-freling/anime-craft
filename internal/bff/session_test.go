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

	session, err := svc.StartSession("line_work", "ref-001")
	require.NoError(t, err)
	assert.NotEmpty(t, session.ID)
	assert.Equal(t, "line_work", session.ExerciseMode)
	assert.Equal(t, "in_progress", session.Status)
	assert.Equal(t, "ref-001", session.ReferenceImageID)
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

	session, err := svc.StartSession("line_work", "ref-001")
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

func TestSessionService_GetSession(t *testing.T) {
	db := testDB(t)
	svc := NewSessionService(repository.NewSessionRepository(db))

	started, err := svc.StartSession("line_work", "ref-001")
	require.NoError(t, err)

	got, err := svc.GetSession(started.ID)
	require.NoError(t, err)
	assert.Equal(t, started.ID, got.ID)
	assert.Equal(t, "line_work", got.ExerciseMode)
	assert.Equal(t, "in_progress", got.Status)
	assert.Equal(t, "ref-001", got.ReferenceImageID)
}

func TestSessionService_GetSession_NotFound(t *testing.T) {
	db := testDB(t)
	svc := NewSessionService(repository.NewSessionRepository(db))

	_, err := svc.GetSession("nonexistent-id")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "session not found")
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

func TestSessionService_ListSessions_WithPagination(t *testing.T) {
	db := testDB(t)
	svc := NewSessionService(repository.NewSessionRepository(db))

	for range 5 {
		_, err := svc.StartSession("line_work", "ref-001")
		require.NoError(t, err)
	}

	// Get first 2
	sessions, err := svc.ListSessions(2, 0)
	require.NoError(t, err)
	assert.Len(t, sessions, 2)

	// Get next 2
	sessions, err = svc.ListSessions(2, 2)
	require.NoError(t, err)
	assert.Len(t, sessions, 2)

	// Get remaining 1
	sessions, err = svc.ListSessions(2, 4)
	require.NoError(t, err)
	assert.Len(t, sessions, 1)
}

func TestSessionService_ListSessions_Empty(t *testing.T) {
	db := testDB(t)
	svc := NewSessionService(repository.NewSessionRepository(db))

	sessions, err := svc.ListSessions(10, 0)
	require.NoError(t, err)
	assert.Empty(t, sessions)
}

func TestSessionService_StartSession_RepoCreateFailure(t *testing.T) {
	db := testDB(t)
	svc := NewSessionService(repository.NewSessionRepository(db))

	// Drop the sessions table to force a create error
	_, err := db.Exec("DROP TABLE feedback")
	require.NoError(t, err)
	_, err = db.Exec("DROP TABLE drawings")
	require.NoError(t, err)
	_, err = db.Exec("DROP TABLE session_achievements")
	require.NoError(t, err)
	_, err = db.Exec("DROP TABLE sessions")
	require.NoError(t, err)

	_, err = svc.StartSession("line_work", "ref-001")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "create session")
}

func TestSessionService_EndSession_UpdateFailure(t *testing.T) {
	db := testDB(t)
	svc := NewSessionService(repository.NewSessionRepository(db))

	session, err := svc.StartSession("line_work", "ref-001")
	require.NoError(t, err)

	// Drop the sessions table to force an update error.
	// We need to get the session first (which will work from cache/memory) then fail on update.
	// Instead, close the DB connection to force errors on subsequent queries.
	require.NoError(t, db.Close())

	_, err = svc.EndSession(session.ID)
	require.Error(t, err)
}

func TestSessionService_ListSessions_DBError(t *testing.T) {
	db := testDB(t)
	svc := NewSessionService(repository.NewSessionRepository(db))

	// Close the DB to force an error
	require.NoError(t, db.Close())

	_, err := svc.ListSessions(10, 0)
	require.Error(t, err)
}
