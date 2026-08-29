package repository

import (
	"database/sql"
	"fmt"

	"github.com/michael-freling/anime-craft/gateway/internal/model"
)

type SessionRepository struct {
	db *DB
}

func NewSessionRepository(db *DB) *SessionRepository {
	return &SessionRepository{db: db}
}

func (r *SessionRepository) Create(session model.Session) error {
	_, err := r.db.Exec(
		"INSERT INTO sessions (id, reference_image_id, exercise_mode, status, started_at) VALUES (?, ?, ?, ?, ?)",
		session.ID, session.ReferenceImageID, session.ExerciseMode, session.Status, session.StartedAt,
	)
	if err != nil {
		return fmt.Errorf("insert session: %w", err)
	}
	return nil
}

func (r *SessionRepository) Get(id string) (model.Session, error) {
	var s model.Session
	err := r.db.QueryRow(
		"SELECT id, reference_image_id, exercise_mode, status, started_at, ended_at, duration_seconds FROM sessions WHERE id = ?",
		id,
	).Scan(&s.ID, &s.ReferenceImageID, &s.ExerciseMode, &s.Status, &s.StartedAt, &s.EndedAt, &s.DurationSeconds)
	if err == sql.ErrNoRows {
		return model.Session{}, fmt.Errorf("session not found: %s", id)
	}
	if err != nil {
		return model.Session{}, fmt.Errorf("get session: %w", err)
	}
	return s, nil
}

func (r *SessionRepository) Update(session model.Session) error {
	_, err := r.db.Exec(
		"UPDATE sessions SET status = ?, ended_at = ?, duration_seconds = ? WHERE id = ?",
		session.Status, session.EndedAt, session.DurationSeconds, session.ID,
	)
	if err != nil {
		return fmt.Errorf("update session: %w", err)
	}
	return nil
}

func (r *SessionRepository) List(limit, offset int) ([]model.Session, error) {
	rows, err := r.db.Query(
		"SELECT id, reference_image_id, exercise_mode, status, started_at, ended_at, duration_seconds FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?",
		limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var sessions []model.Session
	for rows.Next() {
		var s model.Session
		if err := rows.Scan(&s.ID, &s.ReferenceImageID, &s.ExerciseMode, &s.Status, &s.StartedAt, &s.EndedAt, &s.DurationSeconds); err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		sessions = append(sessions, s)
	}
	return sessions, rows.Err()
}

// ListResumable returns the sessions the home screen offers to pick back up,
// most recently saved first.
//
// Submitting a drawing completes its session, so listing only unfinished ones
// would drop a drawing off the home screen at the very moment the artist
// finished it — leaving no way back to work they had just spent a session on.
// Finished sessions are listed too; what makes a session listable is having a
// saved drawing, which is why this joins rather than outer-joins on it.
// Discarded sessions have had their drawing deleted, so they fall out here.
func (r *SessionRepository) ListResumable(limit int) ([]model.ResumableSession, error) {
	rows, err := r.db.Query(
		`SELECT s.id, s.reference_image_id, COALESCE(ri.title, ''), s.exercise_mode, s.status,
		        s.started_at, d.updated_at, d.operation_count
		 FROM sessions s
		 JOIN drawing_documents d ON d.session_id = s.id
		 LEFT JOIN reference_images ri ON ri.id = s.reference_image_id
		 WHERE s.status IN ('in_progress', 'completed')
		 ORDER BY d.updated_at DESC
		 LIMIT ?`,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("list resumable sessions: %w", err)
	}
	defer func() { _ = rows.Close() }()

	sessions := []model.ResumableSession{}
	for rows.Next() {
		var s model.ResumableSession
		if err := rows.Scan(&s.ID, &s.ReferenceImageID, &s.ReferenceTitle, &s.ExerciseMode, &s.Status, &s.StartedAt, &s.LastSavedAt, &s.OperationCount); err != nil {
			return nil, fmt.Errorf("scan resumable session: %w", err)
		}
		sessions = append(sessions, s)
	}
	return sessions, rows.Err()
}

// SetContinuedBy records that a session's drawing was taken on by another
// session, so the chain can be followed to whichever one now holds it.
func (r *SessionRepository) SetContinuedBy(sessionID string, nextSessionID string) error {
	_, err := r.db.Exec(
		"UPDATE sessions SET continued_by_session_id = ? WHERE id = ?",
		nextSessionID, sessionID,
	)
	if err != nil {
		return fmt.Errorf("record session continuation: %w", err)
	}
	return nil
}

// ContinuedBy returns the session that took this one's drawing on, or an
// empty string when it still holds its own.
func (r *SessionRepository) ContinuedBy(sessionID string) (string, error) {
	var next sql.NullString
	err := r.db.QueryRow(
		"SELECT continued_by_session_id FROM sessions WHERE id = ?", sessionID,
	).Scan(&next)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("session not found: %s", sessionID)
	}
	if err != nil {
		return "", fmt.Errorf("get session continuation: %w", err)
	}
	return next.String, nil
}

// PreviousInChain returns the session that handed its drawing to this one, or
// an empty string when this is where the drawing started.
func (r *SessionRepository) PreviousInChain(sessionID string) (string, error) {
	var previous string
	err := r.db.QueryRow(
		"SELECT id FROM sessions WHERE continued_by_session_id = ?", sessionID,
	).Scan(&previous)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("get previous session in chain: %w", err)
	}
	return previous, nil
}
