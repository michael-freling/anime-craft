package drawdoc

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	return NewStore(t.TempDir())
}

func appendOps(t *testing.T, store *Store, sessionID string, from int, cursor int, ops ...Operation) State {
	t.Helper()
	state, err := store.Append(sessionID, AppendRequest{
		FromIndex:     from,
		Operations:    ops,
		Cursor:        cursor,
		ActiveLayerID: "layer-1",
		Document:      DefaultSize,
	})
	require.NoError(t, err)
	return state
}

func TestStore_LoadWithoutSave(t *testing.T) {
	_, err := testStore(t).Load("sess-1")

	assert.ErrorIs(t, err, ErrNotFound)
}

func TestStore_AppendThenLoad(t *testing.T) {
	store := testStore(t)

	appendOps(t, store, "sess-1", 0, 0, stroke("s1", "layer-1", 0, 0, 10, 10))
	state := appendOps(t, store, "sess-1", 1, 1, stroke("s2", "layer-1", 5, 5, 15, 15))

	assert.Equal(t, 2, state.OperationCount)
	assert.Equal(t, 2, state.Revision)

	scene, err := store.Load("sess-1")
	require.NoError(t, err)
	assert.Len(t, scene.Operations, 2)
	assert.Equal(t, 1, scene.Cursor)
	assert.Equal(t, "s2", scene.Operations[1].Stroke.ID)
}

// Autosave is an append in the ordinary case: the journal is only rewritten
// when the artist undoes and then draws something new.
func TestStore_AppendAfterUndoReplacesTheTail(t *testing.T) {
	store := testStore(t)
	appendOps(t, store, "sess-1", 0, 1,
		stroke("s1", "layer-1", 0, 0, 1, 1),
		stroke("s2", "layer-1", 2, 2, 3, 3),
	)

	// Undo dropped s2; the next stroke takes its place in the log.
	state := appendOps(t, store, "sess-1", 1, 1, stroke("s3", "layer-1", 4, 4, 5, 5))

	assert.Equal(t, 2, state.OperationCount)
	scene, err := store.Load("sess-1")
	require.NoError(t, err)
	require.Len(t, scene.Operations, 2)
	assert.Equal(t, "s3", scene.Operations[1].Stroke.ID)
}

// Undo alone changes only the cursor, so the redo stack stays on disk and
// survives a restart.
func TestStore_UndoKeepsTheRedoStack(t *testing.T) {
	store := testStore(t)
	appendOps(t, store, "sess-1", 0, 1,
		stroke("s1", "layer-1", 0, 0, 1, 1),
		stroke("s2", "layer-1", 2, 2, 3, 3),
	)

	appendOps(t, store, "sess-1", 2, 0)

	scene, err := store.Load("sess-1")
	require.NoError(t, err)
	assert.Len(t, scene.Operations, 2)
	assert.Equal(t, 0, scene.Cursor)
	assert.Len(t, scene.Materialize().Strokes["layer-1"], 1)
}

func TestStore_AppendRejectsAGap(t *testing.T) {
	store := testStore(t)
	appendOps(t, store, "sess-1", 0, 0, stroke("s1", "layer-1", 0, 0, 1, 1))

	_, err := store.Append("sess-1", AppendRequest{FromIndex: 5, Cursor: 5})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "a save is missing")
}

// A crash between writing the journal and writing the state file leaves
// operations the state does not account for. The state wins, so the drawing
// stays consistent with the cursor saved alongside it.
func TestStore_LoadIgnoresOperationsPastTheSavedCount(t *testing.T) {
	store := testStore(t)
	appendOps(t, store, "sess-1", 0, 0, stroke("s1", "layer-1", 0, 0, 1, 1))

	journal := filepath.Join(store.Dir("sess-1"), journalFileName)
	extra := []byte(`{"type":"add_stroke","stroke":{"id":"s2","layerId":"layer-1","tool":"brush","color":"#000","size":2,"points":[1,1,2,2]}}` + "\n")
	existing, err := os.ReadFile(journal)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(journal, append(existing, extra...), 0o644))

	scene, err := store.Load("sess-1")
	require.NoError(t, err)
	assert.Len(t, scene.Operations, 1)
}

// A half-written final line is what a crash mid-append looks like; everything
// before it is still good.
func TestStore_LoadRecoversFromATruncatedJournal(t *testing.T) {
	store := testStore(t)
	appendOps(t, store, "sess-1", 0, 1,
		stroke("s1", "layer-1", 0, 0, 1, 1),
		stroke("s2", "layer-1", 2, 2, 3, 3),
	)

	journal := filepath.Join(store.Dir("sess-1"), journalFileName)
	data, err := os.ReadFile(journal)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(journal, data[:len(data)-20], 0o644))

	scene, err := store.Load("sess-1")
	require.NoError(t, err)
	assert.Len(t, scene.Operations, 1)
	assert.Equal(t, 0, scene.Cursor)
}

func TestStore_ImportSeedsTheJournal(t *testing.T) {
	store := testStore(t)
	scene := NewScene()
	scene.Operations = []Operation{stroke("s1", "layer-1", 0, 0, 1, 1)}
	scene.Cursor = 0

	state, err := store.Import("sess-2", scene)
	require.NoError(t, err)
	assert.Equal(t, 1, state.OperationCount)

	// An imported drawing carries on autosaving like any other.
	appendOps(t, store, "sess-2", 1, 1, stroke("s2", "layer-1", 2, 2, 3, 3))
	loaded, err := store.Load("sess-2")
	require.NoError(t, err)
	assert.Len(t, loaded.Operations, 2)
}

func TestStore_Delete(t *testing.T) {
	store := testStore(t)
	appendOps(t, store, "sess-1", 0, 0, stroke("s1", "layer-1", 0, 0, 1, 1))

	require.NoError(t, store.Delete("sess-1"))

	_, err := store.Load("sess-1")
	assert.ErrorIs(t, err, ErrNotFound)
}
