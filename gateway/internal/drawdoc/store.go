package drawdoc

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// Autosave has to survive being called after every stroke, so the hot path
// never touches the OpenRaster file. It appends the new operations to a
// journal and rewrites a small state file — two writes measured in bytes,
// whatever the size of the drawing.
//
// The OpenRaster file is a checkpoint written on a much slower cadence (see
// Checkpoint in the drawing service). The journal is the authority whenever
// both exist: it is always at least as new as the checkpoint.
const (
	journalFileName = "journal.ndjson"
	stateFileName   = "state.json"
	// DocumentFileName is the OpenRaster checkpoint inside a session's folder.
	DocumentFileName = "document.ora"
)

// ErrNotFound reports that a session has never been saved.
var ErrNotFound = errors.New("drawing document not found")

// State is the journal's header: everything about a saved drawing except the
// operations themselves.
type State struct {
	Version        int            `json:"version"`
	Document       Size           `json:"document"`
	ActiveLayerID  string         `json:"activeLayerId"`
	Tool           *ToolState     `json:"tool,omitempty"`
	Reference      *ReferenceInfo `json:"reference,omitempty"`
	Cursor         int            `json:"cursor"`
	OperationCount int            `json:"operationCount"`
	Revision       int            `json:"revision"`
	UpdatedAt      time.Time      `json:"updatedAt"`
	// CheckpointRevision and CheckpointedAt say when the OpenRaster file was
	// last rewritten, so the service can tell how stale the checkpoint is.
	CheckpointRevision int       `json:"checkpointRevision"`
	CheckpointedAt     time.Time `json:"checkpointedAt"`
}

// Store is the on-disk home of every session's drawing, one directory each.
type Store struct {
	root string
}

func NewStore(root string) *Store { return &Store{root: root} }

// Dir is the folder holding one session's journal and checkpoint.
func (s *Store) Dir(sessionID string) string { return filepath.Join(s.root, sessionID) }

// DocumentPath is where a session's OpenRaster checkpoint lives.
func (s *Store) DocumentPath(sessionID string) string {
	return filepath.Join(s.Dir(sessionID), DocumentFileName)
}

// AppendRequest is one autosave: the operations the editor has that the store
// does not, plus the editor state that goes with them.
type AppendRequest struct {
	// FromIndex is the log index the operations start at. Equal to the stored
	// count for a plain append; lower when the artist undid and drew again,
	// which replaces the operations from there on.
	FromIndex     int         `json:"fromIndex"`
	Operations    []Operation `json:"operations"`
	Cursor        int         `json:"cursor"`
	ActiveLayerID string      `json:"activeLayerId"`
	Tool          *ToolState  `json:"tool,omitempty"`
	Document      Size        `json:"document"`
}

// Append writes an autosave and returns the new state.
func (s *Store) Append(sessionID string, req AppendRequest) (State, error) {
	dir := s.Dir(sessionID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return State{}, fmt.Errorf("create session directory: %w", err)
	}

	state, err := s.readState(sessionID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return State{}, err
	}

	if req.FromIndex < 0 || req.FromIndex > state.OperationCount {
		return State{}, fmt.Errorf("operations start at %d but the log holds %d: a save is missing", req.FromIndex, state.OperationCount)
	}

	journalPath := filepath.Join(dir, journalFileName)
	if req.FromIndex < state.OperationCount {
		// The artist undid and drew something new, so the tail of the log is
		// gone. Rewrite rather than append.
		kept, err := readJournal(journalPath)
		if err != nil {
			return State{}, err
		}
		if err := writeJournal(journalPath, append(kept[:req.FromIndex:req.FromIndex], req.Operations...)); err != nil {
			return State{}, err
		}
	} else if len(req.Operations) > 0 {
		if err := appendJournal(journalPath, req.Operations); err != nil {
			return State{}, err
		}
	}

	state.Version = SceneVersion
	state.OperationCount = req.FromIndex + len(req.Operations)
	state.Cursor = clampCursor(req.Cursor, state.OperationCount)
	state.Revision++
	state.UpdatedAt = time.Now()
	if req.Document.valid() {
		state.Document = req.Document
	} else if !state.Document.valid() {
		state.Document = DefaultSize
	}
	if req.ActiveLayerID != "" {
		state.ActiveLayerID = req.ActiveLayerID
	}
	if req.Tool != nil {
		state.Tool = req.Tool
	}

	if err := s.writeState(sessionID, state); err != nil {
		return State{}, err
	}
	return state, nil
}

// MarkCheckpointed records the revision the OpenRaster file now reflects.
func (s *Store) MarkCheckpointed(sessionID string, revision int) error {
	state, err := s.readState(sessionID)
	if err != nil {
		return err
	}
	state.CheckpointRevision = revision
	state.CheckpointedAt = time.Now()
	return s.writeState(sessionID, state)
}

// State returns a session's journal header without reading its operations.
func (s *Store) State(sessionID string) (State, error) { return s.readState(sessionID) }

// Load reassembles a session's scene. The journal wins when it exists, since
// it is written on every autosave and the checkpoint only now and then; the
// OpenRaster file is the fallback for a drawing that arrived as a file rather
// than through the editor.
func (s *Store) Load(sessionID string) (*Scene, error) {
	state, err := s.readState(sessionID)
	if errors.Is(err, ErrNotFound) {
		scene, oraErr := ReadORA(s.DocumentPath(sessionID))
		if oraErr != nil {
			return nil, ErrNotFound
		}
		return scene, nil
	}
	if err != nil {
		return nil, err
	}

	ops, err := readJournal(filepath.Join(s.Dir(sessionID), journalFileName))
	if err != nil {
		return nil, err
	}
	if len(ops) > state.OperationCount {
		// A crash between the journal append and the state write leaves
		// operations the state does not account for. Trusting the state keeps
		// the drawing consistent with the cursor that was saved with it.
		ops = ops[:state.OperationCount]
	}

	scene := &Scene{
		Version:       SceneVersion,
		Document:      state.Document,
		Reference:     state.Reference,
		Tool:          state.Tool,
		ActiveLayerID: state.ActiveLayerID,
		Cursor:        clampCursor(state.Cursor, len(ops)),
		Operations:    ops,
		Revision:      state.Revision,
		SavedAt:       state.UpdatedAt,
	}
	scene.normalise()
	return scene, nil
}

// Delete removes everything saved for a session.
func (s *Store) Delete(sessionID string) error {
	if err := os.RemoveAll(s.Dir(sessionID)); err != nil {
		return fmt.Errorf("delete session directory: %w", err)
	}
	return nil
}

// Import seeds a session's journal from a scene read out of a file, so an
// imported drawing continues autosaving like any other.
func (s *Store) Import(sessionID string, scene *Scene) (State, error) {
	dir := s.Dir(sessionID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return State{}, fmt.Errorf("create session directory: %w", err)
	}
	if err := writeJournal(filepath.Join(dir, journalFileName), scene.Operations); err != nil {
		return State{}, err
	}
	state := State{
		Version:        SceneVersion,
		Document:       scene.Document,
		ActiveLayerID:  scene.ActiveLayerID,
		Tool:           scene.Tool,
		Reference:      scene.Reference,
		Cursor:         clampCursor(scene.Cursor, len(scene.Operations)),
		OperationCount: len(scene.Operations),
		Revision:       1,
		UpdatedAt:      time.Now(),
	}
	if err := s.writeState(sessionID, state); err != nil {
		return State{}, err
	}
	return state, nil
}

func clampCursor(cursor, count int) int {
	if cursor > count-1 {
		return count - 1
	}
	if cursor < -1 {
		return -1
	}
	return cursor
}

func (s *Store) readState(sessionID string) (State, error) {
	data, err := os.ReadFile(filepath.Join(s.Dir(sessionID), stateFileName))
	if errors.Is(err, os.ErrNotExist) {
		return State{Cursor: -1, Document: DefaultSize}, ErrNotFound
	}
	if err != nil {
		return State{}, fmt.Errorf("read drawing state: %w", err)
	}
	var state State
	if err := json.Unmarshal(data, &state); err != nil {
		return State{}, fmt.Errorf("decode drawing state: %w", err)
	}
	if !state.Document.valid() {
		state.Document = DefaultSize
	}
	return state, nil
}

func (s *Store) writeState(sessionID string, state State) error {
	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("encode drawing state: %w", err)
	}
	return writeFileAtomic(filepath.Join(s.Dir(sessionID), stateFileName), data)
}

func readJournal(path string) ([]Operation, error) {
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("open journal: %w", err)
	}
	defer func() { _ = file.Close() }()

	var ops []Operation
	scanner := bufio.NewScanner(file)
	// A single stroke can carry hundreds of points, well past bufio's default
	// 64KB line limit.
	scanner.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var op Operation
		if err := json.Unmarshal(line, &op); err != nil {
			// A half-written last line is what a crash mid-append looks like.
			// Everything before it is still good, so stop rather than fail.
			break
		}
		ops = append(ops, op)
	}
	if err := scanner.Err(); err != nil && !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("read journal: %w", err)
	}
	return ops, nil
}

func appendJournal(path string, ops []Operation) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("open journal for append: %w", err)
	}
	defer func() { _ = file.Close() }()

	writer := bufio.NewWriter(file)
	if err := encodeOps(writer, ops); err != nil {
		return err
	}
	if err := writer.Flush(); err != nil {
		return fmt.Errorf("flush journal: %w", err)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync journal: %w", err)
	}
	return nil
}

func writeJournal(path string, ops []Operation) error {
	var buf []byte
	writer := &byteWriter{buf: &buf}
	if err := encodeOps(writer, ops); err != nil {
		return err
	}
	return writeFileAtomic(path, buf)
}

func encodeOps(w io.Writer, ops []Operation) error {
	for _, op := range ops {
		line, err := json.Marshal(op)
		if err != nil {
			return fmt.Errorf("encode operation: %w", err)
		}
		if _, err := w.Write(append(line, '\n')); err != nil {
			return fmt.Errorf("write operation: %w", err)
		}
	}
	return nil
}

type byteWriter struct{ buf *[]byte }

func (w *byteWriter) Write(p []byte) (int, error) {
	*w.buf = append(*w.buf, p...)
	return len(p), nil
}

// writeFileAtomic replaces a file in one step, so a crash leaves either the
// old contents or the new ones and never a half-written file.
func writeFileAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".*.tmp")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("write temp file: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("sync temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close temp file: %w", err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("replace file: %w", err)
	}
	return nil
}
