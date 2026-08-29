package bff

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/michael-freling/anime-craft/gateway/internal/drawdoc"
	"github.com/michael-freling/anime-craft/gateway/internal/model"
)

// Saving happens continuously while the artist draws, so it is split in two.
// Every autosave appends the new vector operations to a journal — a few
// hundred bytes, whatever the size of the drawing. The OpenRaster file, which
// costs a render and a zip, is rewritten on a much slower cadence: after this
// many revisions, after this much time, or whenever the editor asks for a
// flush (leaving the page, submitting, exporting).
const (
	checkpointEveryRevisions = 25
	checkpointEvery          = 2 * time.Minute
)

// LoadDrawingDocument returns the saved scene for a session as JSON, or an
// empty string when the session has never been saved. The editor rebuilds
// layers, strokes and its undo history from it.
func (s *DrawingService) LoadDrawingDocument(sessionID string) (string, error) {
	scene, err := s.store.Load(sessionID)
	if errors.Is(err, drawdoc.ErrNotFound) {
		return "", nil
	}
	if err != nil {
		slog.Error("failed to load drawing document", "method", "LoadDrawingDocument", "sessionID", sessionID, "error", err)
		return "", fmt.Errorf("load drawing document: %w", err)
	}

	data, err := json.Marshal(scene)
	if err != nil {
		return "", fmt.Errorf("encode scene: %w", err)
	}
	return string(data), nil
}

// SaveDrawingOperations records an autosave: the operations the editor has
// that the journal does not, plus where its undo cursor now sits.
//
// The request travels as JSON rather than as typed parameters because an
// operation is a tagged union — a stroke, a layer add, a reorder — and one
// string keeps that shape out of the generated bindings.
func (s *DrawingService) SaveDrawingOperations(sessionID string, requestJSON string) (model.DrawingSaveResult, error) {
	var req drawdoc.AppendRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		slog.Error("failed to decode save request", "method", "SaveDrawingOperations", "sessionID", sessionID, "error", err)
		return model.DrawingSaveResult{}, fmt.Errorf("decode save request: %w", err)
	}

	state, err := s.store.Append(sessionID, req)
	if err != nil {
		slog.Error("failed to save drawing operations", "method", "SaveDrawingOperations", "sessionID", sessionID, "error", err)
		return model.DrawingSaveResult{}, fmt.Errorf("save drawing operations: %w", err)
	}

	result := model.DrawingSaveResult{
		Revision:       state.Revision,
		OperationCount: state.OperationCount,
		Cursor:         state.Cursor,
		SavedAt:        state.UpdatedAt,
	}

	if s.checkpointDue(state) {
		if _, err := s.checkpoint(sessionID); err != nil {
			// The journal already holds the work, so a failed checkpoint
			// costs interoperability, not the drawing.
			slog.Error("failed to checkpoint drawing", "method", "SaveDrawingOperations", "sessionID", sessionID, "error", err)
		} else {
			result.Checkpointed = true
		}
	}

	s.recordDocument(sessionID, state)
	return result, nil
}

// FlushDrawingDocument forces the OpenRaster file up to date. The editor calls
// it when the artist leaves the page or submits, so the portable file is never
// left behind the journal at the moments that matter.
func (s *DrawingService) FlushDrawingDocument(sessionID string) (model.DrawingSaveResult, error) {
	state, err := s.checkpoint(sessionID)
	if errors.Is(err, drawdoc.ErrNotFound) {
		return model.DrawingSaveResult{}, nil
	}
	if err != nil {
		slog.Error("failed to flush drawing document", "method", "FlushDrawingDocument", "sessionID", sessionID, "error", err)
		return model.DrawingSaveResult{}, err
	}
	s.recordDocument(sessionID, state)
	return model.DrawingSaveResult{
		Revision:       state.Revision,
		OperationCount: state.OperationCount,
		Cursor:         state.Cursor,
		SavedAt:        state.UpdatedAt,
		Checkpointed:   true,
	}, nil
}

// ExportDrawingFile writes the session's drawing to a path of the artist's
// choosing and returns where it landed.
func (s *DrawingService) ExportDrawingFile(sessionID string, destPath string) (string, error) {
	if destPath == "" {
		return "", fmt.Errorf("no destination path given")
	}
	if !strings.EqualFold(filepath.Ext(destPath), ".ora") {
		destPath += ".ora"
	}

	if _, err := s.checkpoint(sessionID); err != nil {
		slog.Error("failed to checkpoint before export", "method", "ExportDrawingFile", "sessionID", sessionID, "error", err)
		return "", fmt.Errorf("checkpoint drawing: %w", err)
	}

	data, err := os.ReadFile(s.store.DocumentPath(sessionID))
	if err != nil {
		return "", fmt.Errorf("read drawing file: %w", err)
	}
	if err := os.WriteFile(destPath, data, 0o644); err != nil {
		return "", fmt.Errorf("write drawing file: %w", err)
	}
	return destPath, nil
}

// ImportDrawingFile opens a saved .ora as a fresh session, restoring the
// reference image travelling inside it so the artist can carry on drawing on
// a machine that has never seen the original session.
func (s *DrawingService) ImportDrawingFile(srcPath string) (model.Session, error) {
	file, err := drawdoc.OpenORA(srcPath)
	if err != nil {
		slog.Error("failed to open drawing file", "method", "ImportDrawingFile", "path", srcPath, "error", err)
		return model.Session{}, err
	}

	referenceID, err := s.restoreReference(file)
	if err != nil {
		slog.Error("failed to restore reference image", "method", "ImportDrawingFile", "path", srcPath, "error", err)
		return model.Session{}, err
	}

	mode := ""
	if file.Scene.Session != nil {
		mode = file.Scene.Session.ExerciseMode
	}
	session, err := s.startSessionFromScene(file.Scene, referenceID, mode)
	if err != nil {
		slog.Error("failed to start a session from the drawing file", "method", "ImportDrawingFile", "path", srcPath, "error", err)
		return model.Session{}, err
	}
	return session, nil
}

// ResumeDrawing hands back the session to open in order to carry on with a
// saved drawing.
//
// A drawing belongs to one artwork, not to one session. An unfinished session
// is simply itself. A finished one cannot be reopened — it has been graded,
// and its drawing and feedback are recorded against it — so carrying on opens
// a new session, and the saved drawing *moves* into it rather than being
// copied. One artwork therefore stays one entry and one file: the operation
// log grows across attempts and carries their whole history, with a marker
// where each was submitted, while every submitted attempt keeps its own score
// and feedback.
//
// Asking to carry on from an attempt whose drawing has already moved follows
// the chain to whichever session now holds it, so an older feedback page still
// opens the live drawing rather than failing or forking it.
func (s *DrawingService) ResumeDrawing(sessionID string) (model.Session, error) {
	session, err := s.currentHolder(sessionID)
	if err != nil {
		slog.Error("failed to find the session holding the drawing", "method", "ResumeDrawing", "sessionID", sessionID, "error", err)
		return model.Session{}, err
	}
	if session.Status == "in_progress" {
		return session, nil
	}

	scene, err := s.store.Load(session.ID)
	if err != nil {
		slog.Error("failed to load the saved drawing", "method", "ResumeDrawing", "sessionID", session.ID, "error", err)
		return model.Session{}, fmt.Errorf("load saved drawing: %w", err)
	}

	// Mark where this attempt ended before the log grows past it, so the
	// history in the file keeps the boundaries between attempts.
	submittedAt := time.Now()
	scene.Operations = append(scene.Operations[:scene.Cursor+1:scene.Cursor+1], drawdoc.Operation{
		Type:        drawdoc.OpMarkSubmitted,
		SessionID:   session.ID,
		SubmittedAt: &submittedAt,
	})
	scene.Cursor = len(scene.Operations) - 1

	next, err := s.startSessionFromScene(scene, session.ReferenceImageID, session.ExerciseMode)
	if err != nil {
		slog.Error("failed to start a session from the saved drawing", "method", "ResumeDrawing", "sessionID", session.ID, "error", err)
		return model.Session{}, err
	}

	// The drawing has moved, so the attempt it came from no longer holds one.
	// Done only once the new session is safely on disk, and only to the index
	// and the files — the session, its score and its feedback all stay.
	if err := s.handOverDrawing(session.ID, next.ID); err != nil {
		slog.Error("failed to hand the drawing over", "method", "ResumeDrawing", "sessionID", session.ID, "nextSessionID", next.ID, "error", err)
	}
	return next, nil
}

// currentHolder follows the continuation chain to the session that now holds
// the drawing. The visited set means a chain that somehow loops fails loudly
// rather than spinning.
func (s *DrawingService) currentHolder(sessionID string) (model.Session, error) {
	visited := map[string]bool{}
	for {
		session, err := s.sessionRepo.Get(sessionID)
		if err != nil {
			return model.Session{}, err
		}
		if visited[sessionID] {
			return model.Session{}, fmt.Errorf("session continuation loops at %s", sessionID)
		}
		visited[sessionID] = true

		next, err := s.sessionRepo.ContinuedBy(sessionID)
		if err != nil {
			return model.Session{}, err
		}
		if next == "" {
			return session, nil
		}
		sessionID = next
	}
}

func (s *DrawingService) handOverDrawing(fromSessionID string, toSessionID string) error {
	if err := s.sessionRepo.SetContinuedBy(fromSessionID, toSessionID); err != nil {
		return err
	}
	return s.DeleteDrawingDocument(fromSessionID)
}

// startSessionFromScene opens a fresh session already holding a drawing, used
// both by importing a file and by carrying on from a finished session.
func (s *DrawingService) startSessionFromScene(scene *drawdoc.Scene, referenceID string, mode string) (model.Session, error) {
	if mode == "" {
		mode = "line_work"
	}
	session := model.Session{
		ID:               uuid.New().String(),
		ReferenceImageID: referenceID,
		ExerciseMode:     mode,
		Status:           "in_progress",
		StartedAt:        time.Now(),
	}
	if err := s.sessionRepo.Create(session); err != nil {
		return model.Session{}, fmt.Errorf("create session for the drawing: %w", err)
	}

	// The scene points at whichever reference it was drawn from; re-point it
	// at the one this machine has, which an import may have just re-created.
	if scene.Reference == nil {
		scene.Reference = &drawdoc.ReferenceInfo{}
	}
	scene.Reference.ID = referenceID

	// The drawing is what this session starts from, not what it did: undo
	// belongs to the artist working now, and must not reach into an attempt
	// that has already been submitted.
	scene.Seed()

	state, err := s.store.Import(session.ID, scene)
	if err != nil {
		return model.Session{}, fmt.Errorf("seed the drawing: %w", err)
	}
	if _, err := s.checkpoint(session.ID); err != nil {
		slog.Error("failed to checkpoint the seeded drawing", "sessionID", session.ID, "error", err)
	}
	s.recordDocument(session.ID, state)
	return session, nil
}

// GetDrawingThumbnail returns a small preview of a session's saved drawing as
// a data URI, so the home screen can show what each saved drawing is rather
// than a list of reference titles the artist has to tell apart from memory.
// It returns an empty string when there is no preview yet, which the caller
// shows as a placeholder rather than an error.
func (s *DrawingService) GetDrawingThumbnail(sessionID string) (string, error) {
	data, err := drawdoc.ReadThumbnail(s.store.DocumentPath(sessionID))
	if err != nil {
		slog.Debug("no drawing thumbnail available", "method", "GetDrawingThumbnail", "sessionID", sessionID, "error", err)
		return "", nil
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(data), nil
}

// DeleteDrawingDocument throws away a session's saved drawing, used when the
// artist discards a session rather than submitting it.
func (s *DrawingService) DeleteDrawingDocument(sessionID string) error {
	if err := s.store.Delete(sessionID); err != nil {
		slog.Error("failed to delete drawing document", "method", "DeleteDrawingDocument", "sessionID", sessionID, "error", err)
		return err
	}
	if s.documentRepo != nil {
		if err := s.documentRepo.Delete(sessionID); err != nil {
			slog.Error("failed to delete drawing document record", "method", "DeleteDrawingDocument", "sessionID", sessionID, "error", err)
			return err
		}
	}
	return nil
}

// checkpoint rewrites the session's OpenRaster file from the journal.
func (s *DrawingService) checkpoint(sessionID string) (drawdoc.State, error) {
	scene, err := s.store.Load(sessionID)
	if err != nil {
		return drawdoc.State{}, err
	}

	state, err := s.store.State(sessionID)
	if err != nil && !errors.Is(err, drawdoc.ErrNotFound) {
		return drawdoc.State{}, err
	}

	reference := s.embedReference(sessionID, scene)
	scene.Session = s.sessionInfo(sessionID)
	scene.SavedAt = time.Now()

	if err := drawdoc.WriteORA(s.store.DocumentPath(sessionID), scene, reference); err != nil {
		return drawdoc.State{}, fmt.Errorf("write OpenRaster file: %w", err)
	}
	if err := s.store.MarkCheckpointed(sessionID, state.Revision); err != nil {
		return drawdoc.State{}, err
	}
	state.CheckpointRevision = state.Revision
	state.CheckpointedAt = time.Now()
	return state, nil
}

func (s *DrawingService) checkpointDue(state drawdoc.State) bool {
	if state.Revision-state.CheckpointRevision >= checkpointEveryRevisions {
		return true
	}
	return time.Since(state.CheckpointedAt) >= checkpointEvery
}

func (s *DrawingService) sessionInfo(sessionID string) *drawdoc.SessionInfo {
	if s.sessionRepo == nil {
		return nil
	}
	session, err := s.sessionRepo.Get(sessionID)
	if err != nil {
		return nil
	}
	return &drawdoc.SessionInfo{
		ID:           session.ID,
		ExerciseMode: session.ExerciseMode,
		StartedAt:    session.StartedAt,
	}
}

// embedReference reads the session's reference image so the checkpoint can
// carry a copy. A missing reference is not worth failing a save over: the
// drawing is still saved, just without the picture it was traced from.
func (s *DrawingService) embedReference(sessionID string, scene *drawdoc.Scene) *drawdoc.EmbeddedFile {
	if s.sessionRepo == nil || s.refRepo == nil {
		return nil
	}
	session, err := s.sessionRepo.Get(sessionID)
	if err != nil {
		return nil
	}
	ref, err := s.refRepo.Get(session.ReferenceImageID)
	if err != nil {
		return nil
	}
	data, err := os.ReadFile(filepath.Join(s.dataDir, ref.FilePath))
	if err != nil {
		slog.Warn("reference image could not be embedded", "sessionID", sessionID, "referenceID", ref.ID, "error", err)
		return nil
	}

	digest := sha256.Sum256(data)
	ext := filepath.Ext(ref.FilePath)
	if ext == "" {
		ext = ".png"
	}
	scene.Reference = &drawdoc.ReferenceInfo{
		ID:         ref.ID,
		Title:      ref.Title,
		Difficulty: ref.Difficulty,
		SHA256:     hex.EncodeToString(digest[:]),
	}
	return &drawdoc.EmbeddedFile{Name: "reference" + ext, Data: data}
}

// restoreReference finds or re-creates the reference image an imported file
// was drawn from. Keeping the original id means re-importing the same file
// twice reuses the picture instead of piling up copies.
func (s *DrawingService) restoreReference(file *drawdoc.ORAFile) (string, error) {
	info := file.Scene.Reference
	if info != nil && info.ID != "" {
		if _, err := s.refRepo.Get(info.ID); err == nil {
			return info.ID, nil
		}
	}
	if file.Reference == nil {
		return "", fmt.Errorf("drawing file has no reference image and none matches on this machine")
	}

	id := uuid.New().String()
	if info != nil && info.ID != "" {
		id = info.ID
	}
	ext := filepath.Ext(file.Reference.Name)
	if ext == "" {
		ext = ".png"
	}
	relPath := filepath.Join("references", id+ext)
	absPath := filepath.Join(s.dataDir, relPath)
	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		return "", fmt.Errorf("create references directory: %w", err)
	}
	if err := os.WriteFile(absPath, file.Reference.Data, 0o644); err != nil {
		return "", fmt.Errorf("write reference image: %w", err)
	}

	title := "Imported reference"
	difficulty := "beginner"
	mode := "line_work"
	if info != nil {
		if info.Title != "" {
			title = info.Title
		}
		if info.Difficulty != "" {
			difficulty = info.Difficulty
		}
	}
	if file.Scene.Session != nil && file.Scene.Session.ExerciseMode != "" {
		mode = file.Scene.Session.ExerciseMode
	}

	ref := model.ReferenceImage{
		ID:           id,
		Title:        title,
		FilePath:     relPath,
		ExerciseMode: mode,
		Difficulty:   difficulty,
		CreatedAt:    time.Now(),
	}
	if err := s.refRepo.Create(ref); err != nil {
		_ = os.Remove(absPath)
		return "", fmt.Errorf("create reference record: %w", err)
	}
	return id, nil
}

// recordDocument keeps the database index in step with the files on disk. It
// only feeds the resume list, so a failure is logged rather than surfaced.
func (s *DrawingService) recordDocument(sessionID string, state drawdoc.State) {
	if s.documentRepo == nil {
		return
	}
	err := s.documentRepo.Upsert(model.DrawingDocument{
		SessionID:      sessionID,
		FilePath:       s.store.DocumentPath(sessionID),
		Revision:       state.Revision,
		OperationCount: state.OperationCount,
		UpdatedAt:      state.UpdatedAt,
	})
	if err != nil {
		slog.Error("failed to record drawing document", "sessionID", sessionID, "error", err)
	}
}
