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
	docs := NewDrawingDocumentRepository(db)
	saved := time.Now().Truncate(time.Second)

	seedSession(t, db, "sess-300")
	seedSession(t, db, "sess-301")
	seedSession(t, db, "sess-302")
	seedSession(t, db, "sess-303")
	for i, id := range []string{"sess-300", "sess-301", "sess-302"} {
		require.NoError(t, docs.Upsert(model.DrawingDocument{
			SessionID: id, FilePath: "path", Revision: 1, OperationCount: 4,
			UpdatedAt: saved.Add(time.Duration(i) * time.Minute),
		}))
	}

	// A submitted drawing stays listed: it is still one the artist may want
	// to carry on with.
	setStatus(t, repo, "sess-301", "completed")
	// A discarded one does not — its drawing has been deleted with it.
	setStatus(t, repo, "sess-302", "discarded")
	require.NoError(t, docs.Delete("sess-302"))

	resumable, err := repo.ListResumable(10)
	require.NoError(t, err)

	require.Len(t, resumable, 2, "sess-303 has nothing drawn on it and sess-302 was discarded")
	// Most recently saved first.
	assert.Equal(t, "sess-301", resumable[0].ID)
	assert.Equal(t, "completed", resumable[0].Status)
	assert.Equal(t, "sess-300", resumable[1].ID)
	assert.Equal(t, "in_progress", resumable[1].Status)
	assert.Equal(t, "Simple Face - Lines", resumable[1].ReferenceTitle)
	assert.Equal(t, 4, resumable[1].OperationCount)
	assert.False(t, resumable[1].LastSavedAt.IsZero())
}

func setStatus(t *testing.T, repo *SessionRepository, id string, status string) {
	t.Helper()
	session, err := repo.Get(id)
	require.NoError(t, err)
	now := time.Now()
	session.Status = status
	session.EndedAt = &now
	require.NoError(t, repo.Update(session))
}
