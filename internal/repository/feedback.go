package repository

import (
	"database/sql"
	"fmt"

	"github.com/michael-freling/anime-craft/internal/model"
)

type FeedbackRepository struct {
	db *DB
}

func NewFeedbackRepository(db *DB) *FeedbackRepository {
	return &FeedbackRepository{db: db}
}

func (r *FeedbackRepository) Create(feedback model.Feedback) error {
	_, err := r.db.Exec(
		`INSERT INTO feedback (id, session_id, overall_score, proportions_score, line_quality_score,
			color_accuracy_score, summary, details, strengths, improvements, created_at)
		VALUES (?, ?, 0, 0, 0, 0, '', '', '[]', '[]', ?)`,
		feedback.ID, feedback.SessionID, feedback.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert feedback: %w", err)
	}
	return nil
}

func (r *FeedbackRepository) GetBySessionID(sessionID string) (model.Feedback, error) {
	var f model.Feedback
	err := r.db.QueryRow(
		`SELECT id, session_id, created_at
		FROM feedback WHERE session_id = ?`,
		sessionID,
	).Scan(&f.ID, &f.SessionID, &f.CreatedAt)
	if err == sql.ErrNoRows {
		return model.Feedback{}, fmt.Errorf("feedback not found for session: %s", sessionID)
	}
	if err != nil {
		return model.Feedback{}, fmt.Errorf("get feedback: %w", err)
	}

	return f, nil
}
