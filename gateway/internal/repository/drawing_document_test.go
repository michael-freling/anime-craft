package repository

import (
	"testing"
	"time"

	"github.com/michael-freling/anime-craft/gateway/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func seedSession(t *testing.T, db *DB, id string) {
	t.Helper()
	require.NoError(t, NewSessionRepository(db).Create(model.Session{
		ID:               id,
		ReferenceImageID: "ref-001",
		ExerciseMode:     "line_work",
		Status:           "in_progress",
		StartedAt:        time.Now().Truncate(time.Second),
	}))
}

// Autosave writes the same row over and over as the drawing grows, so this is
// an upsert rather than an insert.
func TestDrawingDocumentRepository_UpsertOverwrites(t *testing.T) {
	db := testDB(t)
	seedSession(t, db, "sess-200")
	repo := NewDrawingDocumentRepository(db)

	saved := time.Now().Truncate(time.Second)
	require.NoError(t, repo.Upsert(model.DrawingDocument{
		SessionID: "sess-200", FilePath: "/data/drawings/sess-200/document.ora",
		Revision: 1, OperationCount: 3, UpdatedAt: saved,
	}))
	require.NoError(t, repo.Upsert(model.DrawingDocument{
		SessionID: "sess-200", FilePath: "/data/drawings/sess-200/document.ora",
		Revision: 2, OperationCount: 7, UpdatedAt: saved.Add(time.Minute),
	}))

	got, err := repo.Get("sess-200")
	require.NoError(t, err)
	assert.Equal(t, 2, got.Revision)
	assert.Equal(t, 7, got.OperationCount)
}

func TestDrawingDocumentRepository_GetNotFound(t *testing.T) {
	_, err := NewDrawingDocumentRepository(testDB(t)).Get("nope")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "drawing document not found")
}

func TestDrawingDocumentRepository_Delete(t *testing.T) {
	db := testDB(t)
	seedSession(t, db, "sess-201")
	repo := NewDrawingDocumentRepository(db)
	require.NoError(t, repo.Upsert(model.DrawingDocument{
		SessionID: "sess-201", FilePath: "path", Revision: 1, UpdatedAt: time.Now(),
	}))

	require.NoError(t, repo.Delete("sess-201"))

	_, err := repo.Get("sess-201")
	assert.Error(t, err)
	// Deleting a session that was never saved is not an error.
	assert.NoError(t, repo.Delete("sess-201"))
}

func TestSessionRepository_ListResumable(t *testing.T) {
	db := testDB(t)
	repo := NewSessionRepository(db)
	seedSession(t, db, "sess-300")
	seedSession(t, db, "sess-301")

	// A finished session is not something to pick back up.
	finished, err := repo.Get("sess-301")
	require.NoError(t, err)
	now := time.Now()
	finished.Status = "completed"
	finished.EndedAt = &now
	require.NoError(t, repo.Update(finished))

	resumable, err := repo.ListResumable(10)
	require.NoError(t, err)
	require.Len(t, resumable, 1)
	assert.Equal(t, "sess-300", resumable[0].ID)
	assert.Equal(t, "Simple Face - Lines", resumable[0].ReferenceTitle)
	assert.Nil(t, resumable[0].LastSavedAt)
}
