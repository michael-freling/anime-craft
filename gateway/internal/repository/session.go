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
