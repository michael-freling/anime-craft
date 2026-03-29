package repository

import (
	"database/sql"
	"fmt"

	"github.com/michael-freling/anime-craft/internal/model"
)

type DrawingRepository struct {
	db *DB
}

func NewDrawingRepository(db *DB) *DrawingRepository {
	return &DrawingRepository{db: db}
}

func (r *DrawingRepository) Create(drawing model.Drawing) error {
	_, err := r.db.Exec(
		"INSERT INTO drawings (id, session_id, file_path, created_at) VALUES (?, ?, ?, ?)",
		drawing.ID, drawing.SessionID, drawing.FilePath, drawing.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert drawing: %w", err)
	}
	return nil
}

func (r *DrawingRepository) GetBySessionID(sessionID string) (model.Drawing, error) {
	var d model.Drawing
	err := r.db.QueryRow(
		"SELECT id, session_id, file_path, created_at FROM drawings WHERE session_id = ?",
		sessionID,
	).Scan(&d.ID, &d.SessionID, &d.FilePath, &d.CreatedAt)
	if err == sql.ErrNoRows {
		return model.Drawing{}, fmt.Errorf("drawing not found for session: %s", sessionID)
	}
	if err != nil {
		return model.Drawing{}, fmt.Errorf("get drawing: %w", err)
	}
	return d, nil
}
