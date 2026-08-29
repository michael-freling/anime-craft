package bff

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/michael-freling/anime-craft/gateway/internal/drawdoc"
	"github.com/michael-freling/anime-craft/gateway/internal/model"
	"github.com/michael-freling/anime-craft/gateway/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type drawingFixture struct {
	svc         *DrawingService
	sessionSvc  *SessionService
	dataDir     string
	sessionID   string
	referenceID string
}

func newDrawingFixture(t *testing.T) drawingFixture {
	t.Helper()
	db := testDB(t)
	dataDir := t.TempDir()

	refRepo := repository.NewReferenceRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	svc := NewDrawingService(
		repository.NewDrawingRepository(db),
		repository.NewDrawingDocumentRepository(db),
		sessionRepo,
		refRepo,
		dataDir,
	)

	require.NoError(t, os.MkdirAll(filepath.Join(dataDir, "references"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dataDir, "references", "ref-900.png"), []byte("reference-image-bytes"), 0o644))
	require.NoError(t, refRepo.Create(model.ReferenceImage{
		ID: "ref-900", Title: "Simple Face", FilePath: "references/ref-900.png",
		ExerciseMode: "line_work", Difficulty: "beginner", CreatedAt: time.Now(),
	}))
	require.NoError(t, sessionRepo.Create(model.Session{
		ID: "sess-900", ReferenceImageID: "ref-900", ExerciseMode: "line_work",
		Status: "in_progress", StartedAt: time.Now(),
	}))

	return drawingFixture{
		svc:         svc,
		sessionSvc:  NewSessionService(sessionRepo),
		dataDir:     dataDir,
		sessionID:   "sess-900",
		referenceID: "ref-900",
	}
}

// newEmptyDrawingFixture stands in for a machine that has never seen the
// drawing being imported: its own data directory and database.
func newEmptyDrawingFixture(t *testing.T) drawingFixture {
	t.Helper()
	db := testDB(t)
	dataDir := t.TempDir()
	sessionRepo := repository.NewSessionRepository(db)
	return drawingFixture{
		svc: NewDrawingService(
			repository.NewDrawingRepository(db),
			repository.NewDrawingDocumentRepository(db),
			sessionRepo,
			repository.NewReferenceRepository(db),
			dataDir,
		),
		sessionSvc: NewSessionService(sessionRepo),
		dataDir:    dataDir,
	}
}

func saveRequest(fromIndex, cursor int, ops ...map[string]any) string {
	request := map[string]any{
		"fromIndex":     fromIndex,
		"operations":    ops,
		"cursor":        cursor,
		"activeLayerId": "layer-1",
		"tool":          map[string]any{"tool": "brush", "brushSize": 2, "brushColor": "#000000"},
		"document":      map[string]any{"width": 1024, "height": 768},
	}
	data, _ := json.Marshal(request)
	return string(data)
}

func strokeOp(id string, points ...float64) map[string]any {
	return map[string]any{
		"type": "add_stroke",
		"stroke": map[string]any{
			"id": id, "layerId": "layer-1", "tool": "brush",
			"color": "#000000", "size": 4, "points": points,
		},
	}
}

func TestDrawingService_LoadWithoutAnySave(t *testing.T) {
	f := newDrawingFixture(t)

	scene, err := f.svc.LoadDrawingDocument(f.sessionID)

	require.NoError(t, err)
	assert.Empty(t, scene, "a session that has never been drawn on has nothing to restore")
}

func TestDrawingService_SaveThenLoad(t *testing.T) {
	f := newDrawingFixture(t)

	result, err := f.svc.SaveDrawingOperations(f.sessionID, saveRequest(0, 0, strokeOp("s1", 10, 10, 100, 100)))
	require.NoError(t, err)
	assert.Equal(t, 1, result.OperationCount)
	assert.Equal(t, 0, result.Cursor)
	assert.False(t, result.SavedAt.IsZero())

	sceneJSON, err := f.svc.LoadDrawingDocument(f.sessionID)
	require.NoError(t, err)

	var scene drawdoc.Scene
	require.NoError(t, json.Unmarshal([]byte(sceneJSON), &scene))
	require.Len(t, scene.Operations, 1)
	assert.Equal(t, "s1", scene.Operations[0].Stroke.ID)
	require.NotNil(t, scene.Tool)
	assert.Equal(t, "#000000", scene.Tool.BrushColor)
}

func TestDrawingService_SaveRejectsAGapInTheLog(t *testing.T) {
	f := newDrawingFixture(t)
	_, err := f.svc.SaveDrawingOperations(f.sessionID, saveRequest(0, 0, strokeOp("s1", 1, 1, 2, 2)))
	require.NoError(t, err)

	_, err = f.svc.SaveDrawingOperations(f.sessionID, saveRequest(4, 4, strokeOp("s2", 3, 3, 4, 4)))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "a save is missing")
}

func TestDrawingService_SaveRejectsMalformedRequests(t *testing.T) {
	f := newDrawingFixture(t)

	_, err := f.svc.SaveDrawingOperations(f.sessionID, "{not json")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "decode save request")
}

// Autosave stays cheap. The first save writes the OpenRaster file so a
// portable copy exists from the outset; after that the hot path only appends
// to the journal, and the file waits for a flush or the next checkpoint.
func TestDrawingService_AutosaveOnlyCheckpointsOccasionally(t *testing.T) {
	f := newDrawingFixture(t)

	first, err := f.svc.SaveDrawingOperations(f.sessionID, saveRequest(0, 0, strokeOp("s1", 10, 10, 20, 20)))
	require.NoError(t, err)
	assert.True(t, first.Checkpointed)

	oraPath := filepath.Join(f.dataDir, "drawings", f.sessionID, "document.ora")
	info, err := os.Stat(oraPath)
	require.NoError(t, err)
	assert.Positive(t, info.Size())

	for i := 0; i < 5; i++ {
		next, err := f.svc.SaveDrawingOperations(f.sessionID, saveRequest(1+i, 1+i, strokeOp("s", float64(i), 1, 2, 2)))
		require.NoError(t, err)
		assert.False(t, next.Checkpointed, "later autosaves should only touch the journal")
	}

	// A flush brings the file level with the journal on demand.
	flushed, err := f.svc.FlushDrawingDocument(f.sessionID)
	require.NoError(t, err)
	assert.True(t, flushed.Checkpointed)
	assert.Equal(t, 6, flushed.OperationCount)
}

func TestDrawingService_FlushEmbedsTheReferenceImage(t *testing.T) {
	f := newDrawingFixture(t)
	_, err := f.svc.SaveDrawingOperations(f.sessionID, saveRequest(0, 0, strokeOp("s1", 10, 10, 200, 200)))
	require.NoError(t, err)

	_, err = f.svc.FlushDrawingDocument(f.sessionID)
	require.NoError(t, err)

	file, err := drawdoc.OpenORA(filepath.Join(f.dataDir, "drawings", f.sessionID, "document.ora"))
	require.NoError(t, err)
	require.NotNil(t, file.Reference)
	assert.Equal(t, []byte("reference-image-bytes"), file.Reference.Data)
	require.NotNil(t, file.Scene.Reference)
	assert.Equal(t, "ref-900", file.Scene.Reference.ID)
	assert.Equal(t, "Simple Face", file.Scene.Reference.Title)
	assert.NotEmpty(t, file.Scene.Reference.SHA256)
	require.NotNil(t, file.Scene.Session)
	assert.Equal(t, "line_work", file.Scene.Session.ExerciseMode)
}

func TestDrawingService_FlushWithNothingSaved(t *testing.T) {
	f := newDrawingFixture(t)

	result, err := f.svc.FlushDrawingDocument(f.sessionID)

	require.NoError(t, err)
	assert.Zero(t, result.Revision)
}

func TestDrawingService_ExportWritesWhereAsked(t *testing.T) {
	f := newDrawingFixture(t)
	_, err := f.svc.SaveDrawingOperations(f.sessionID, saveRequest(0, 0, strokeOp("s1", 10, 10, 200, 200)))
	require.NoError(t, err)

	// The extension is added when the artist leaves it off.
	dest := filepath.Join(t.TempDir(), "practice")
	written, err := f.svc.ExportDrawingFile(f.sessionID, dest)
	require.NoError(t, err)
	assert.Equal(t, dest+".ora", written)

	scene, err := drawdoc.ReadORA(written)
	require.NoError(t, err)
	assert.Len(t, scene.Operations, 1)
}

// The whole point of the format: a file taken to another machine comes back
// as an editable session, reference image and all.
func TestDrawingService_ImportRestoresASessionFromAFile(t *testing.T) {
	source := newDrawingFixture(t)
	_, err := source.svc.SaveDrawingOperations(source.sessionID, saveRequest(0, 1,
		strokeOp("s1", 10, 10, 200, 200),
		strokeOp("s2", 20, 300, 400, 40),
	))
	require.NoError(t, err)
	exported := filepath.Join(t.TempDir(), "practice.ora")
	_, err = source.svc.ExportDrawingFile(source.sessionID, exported)
	require.NoError(t, err)

	// A different machine: its own data directory and its own database, with
	// no idea about the session or reference the file came from.
	target := newEmptyDrawingFixture(t)

	session, err := target.svc.ImportDrawingFile(exported)
	require.NoError(t, err)
	assert.Equal(t, "in_progress", session.Status)
	assert.Equal(t, "line_work", session.ExerciseMode)
	assert.NotEqual(t, source.sessionID, session.ID)

	ref, err := target.svc.refRepo.Get(session.ReferenceImageID)
	require.NoError(t, err)
	assert.Equal(t, "Simple Face", ref.Title)
	restored, err := os.ReadFile(filepath.Join(target.dataDir, ref.FilePath))
	require.NoError(t, err)
	assert.Equal(t, []byte("reference-image-bytes"), restored)

	sceneJSON, err := target.svc.LoadDrawingDocument(session.ID)
	require.NoError(t, err)
	var scene drawdoc.Scene
	require.NoError(t, json.Unmarshal([]byte(sceneJSON), &scene))
	assert.Len(t, scene.Operations, 2)
	assert.Equal(t, 1, scene.Cursor)

	// The imported session keeps autosaving from where the file left off.
	_, err = target.svc.SaveDrawingOperations(session.ID, saveRequest(2, 2, strokeOp("s3", 1, 1, 2, 2)))
	require.NoError(t, err)
}

func TestDrawingService_ImportReusesAReferenceAlreadyOnThisMachine(t *testing.T) {
	f := newDrawingFixture(t)
	_, err := f.svc.SaveDrawingOperations(f.sessionID, saveRequest(0, 0, strokeOp("s1", 10, 10, 200, 200)))
	require.NoError(t, err)
	exported := filepath.Join(t.TempDir(), "practice.ora")
	_, err = f.svc.ExportDrawingFile(f.sessionID, exported)
	require.NoError(t, err)

	before, err := f.svc.refRepo.List("line_work")
	require.NoError(t, err)

	session, err := f.svc.ImportDrawingFile(exported)
	require.NoError(t, err)

	assert.Equal(t, "ref-900", session.ReferenceImageID)
	after, err := f.svc.refRepo.List("line_work")
	require.NoError(t, err)
	assert.Len(t, after, len(before), "importing should not pile up copies of the reference")
}

func TestDrawingService_ImportRejectsAFileThatIsNotADrawing(t *testing.T) {
	f := newDrawingFixture(t)
	path := filepath.Join(t.TempDir(), "notes.txt")
	require.NoError(t, os.WriteFile(path, []byte("hello"), 0o644))

	_, err := f.svc.ImportDrawingFile(path)

	assert.ErrorIs(t, err, drawdoc.ErrNotOpenRaster)
}

func TestDrawingService_DiscardDeletesTheSavedDrawing(t *testing.T) {
	f := newDrawingFixture(t)
	_, err := f.svc.SaveDrawingOperations(f.sessionID, saveRequest(0, 0, strokeOp("s1", 10, 10, 20, 20)))
	require.NoError(t, err)

	require.NoError(t, f.svc.DeleteDrawingDocument(f.sessionID))

	scene, err := f.svc.LoadDrawingDocument(f.sessionID)
	require.NoError(t, err)
	assert.Empty(t, scene)
	_, err = os.Stat(filepath.Join(f.dataDir, "drawings", f.sessionID))
	assert.True(t, os.IsNotExist(err))
}

// The home screen offers saved drawings by reading the index autosave keeps
// up to date. A session with nothing drawn on it is not worth offering.
func TestSessionService_ListResumableSessions(t *testing.T) {
	f := newDrawingFixture(t)

	resumable, err := f.sessionSvc.ListResumableSessions(10)
	require.NoError(t, err)
	assert.Empty(t, resumable, "a session with nothing drawn on it has nothing to resume")

	_, err = f.svc.SaveDrawingOperations(f.sessionID, saveRequest(0, 0, strokeOp("s1", 1, 1, 2, 2)))
	require.NoError(t, err)

	resumable, err = f.sessionSvc.ListResumableSessions(10)
	require.NoError(t, err)
	require.Len(t, resumable, 1)
	assert.Equal(t, f.sessionID, resumable[0].ID)
	assert.Equal(t, "Simple Face", resumable[0].ReferenceTitle)
	assert.Equal(t, "in_progress", resumable[0].Status)
	assert.Equal(t, 1, resumable[0].OperationCount)
	assert.False(t, resumable[0].LastSavedAt.IsZero())

	// Discarding takes the session off the list.
	require.NoError(t, f.sessionSvc.DiscardSession(f.sessionID))
	require.NoError(t, f.svc.DeleteDrawingDocument(f.sessionID))
	resumable, err = f.sessionSvc.ListResumableSessions(10)
	require.NoError(t, err)
	assert.Empty(t, resumable)
}

// Submitting completes the session. Dropping the drawing off the home screen
// at that moment would leave no way back to a session's worth of work, so a
// finished drawing stays listed.
func TestSessionService_ListResumableSessions_KeepsSubmittedDrawings(t *testing.T) {
	f := newDrawingFixture(t)
	_, err := f.svc.SaveDrawingOperations(f.sessionID, saveRequest(0, 0, strokeOp("s1", 10, 10, 200, 200)))
	require.NoError(t, err)

	_, err = f.sessionSvc.EndSession(f.sessionID)
	require.NoError(t, err)

	resumable, err := f.sessionSvc.ListResumableSessions(10)
	require.NoError(t, err)
	require.Len(t, resumable, 1)
	assert.Equal(t, f.sessionID, resumable[0].ID)
	assert.Equal(t, "completed", resumable[0].Status)
}

func TestDrawingService_ResumeDrawing_UnfinishedSessionIsItself(t *testing.T) {
	f := newDrawingFixture(t)
	_, err := f.svc.SaveDrawingOperations(f.sessionID, saveRequest(0, 0, strokeOp("s1", 1, 1, 2, 2)))
	require.NoError(t, err)

	resumed, err := f.svc.ResumeDrawing(f.sessionID)

	require.NoError(t, err)
	assert.Equal(t, f.sessionID, resumed.ID, "an unfinished session is picked up where it was left")
}

// A submitted session has been graded, so carrying on means a new attempt
// holding the same artwork — leaving the graded one and its feedback alone.
func TestDrawingService_ResumeDrawing_ContinuesFromASubmittedDrawing(t *testing.T) {
	f := newDrawingFixture(t)
	_, err := f.svc.SaveDrawingOperations(f.sessionID, saveRequest(0, 1,
		strokeOp("s1", 10, 10, 200, 200),
		strokeOp("s2", 20, 300, 400, 40),
	))
	require.NoError(t, err)
	_, err = f.sessionSvc.EndSession(f.sessionID)
	require.NoError(t, err)

	next, err := f.svc.ResumeDrawing(f.sessionID)
	require.NoError(t, err)

	assert.NotEqual(t, f.sessionID, next.ID)
	assert.Equal(t, "in_progress", next.Status)
	assert.Equal(t, f.referenceID, next.ReferenceImageID, "the same reference is drawn from")
	assert.Equal(t, "line_work", next.ExerciseMode)

	// The new session opens with the drawing already on the canvas.
	sceneJSON, err := f.svc.LoadDrawingDocument(next.ID)
	require.NoError(t, err)
	var scene drawdoc.Scene
	require.NoError(t, json.Unmarshal([]byte(sceneJSON), &scene))
	assert.Len(t, scene.Operations, 2)
	assert.Equal(t, 1, scene.Cursor)

	// The submitted session is untouched and still listed.
	source, err := f.sessionSvc.GetSession(f.sessionID)
	require.NoError(t, err)
	assert.Equal(t, "completed", source.Status)
	resumable, err := f.sessionSvc.ListResumableSessions(10)
	require.NoError(t, err)
	assert.Len(t, resumable, 2)

	// And it carries on autosaving on its own from there.
	_, err = f.svc.SaveDrawingOperations(next.ID, saveRequest(2, 2, strokeOp("s3", 5, 5, 6, 6)))
	require.NoError(t, err)
}

func TestDrawingService_ResumeDrawing_WithoutASavedDrawing(t *testing.T) {
	f := newDrawingFixture(t)
	_, err := f.sessionSvc.EndSession(f.sessionID)
	require.NoError(t, err)

	_, err = f.svc.ResumeDrawing(f.sessionID)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "load saved drawing")
}

func TestSessionService_DiscardIsIdempotent(t *testing.T) {
	f := newDrawingFixture(t)

	require.NoError(t, f.sessionSvc.DiscardSession(f.sessionID))
	require.NoError(t, f.sessionSvc.DiscardSession(f.sessionID))
}
