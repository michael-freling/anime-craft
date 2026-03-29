package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/michael-freling/anime-craft/internal/model"
)

type FeedbackRepository struct {
	db *DB
}

func NewFeedbackRepository(db *DB) *FeedbackRepository {
	return &FeedbackRepository{db: db}
}

func intPtrToValue(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

func intToPtr(v int) *int {
	if v == 0 {
		return nil
	}
	return &v
}

func (r *FeedbackRepository) Create(feedback model.Feedback) error {
	strengths, err := json.Marshal(feedback.Strengths)
	if err != nil {
		return fmt.Errorf("marshal strengths: %w", err)
	}
	improvements, err := json.Marshal(feedback.Improvements)
	if err != nil {
		return fmt.Errorf("marshal improvements: %w", err)
	}

	_, err = r.db.Exec(
		`INSERT INTO feedback (id, session_id, overall_score, proportions_score, line_quality_score,
			color_accuracy_score, summary, details, strengths, improvements, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		feedback.ID, feedback.SessionID, feedback.OverallScore,
		intPtrToValue(feedback.ProportionsScore),
		intPtrToValue(feedback.LineQualityScore),
		intPtrToValue(feedback.ColorAccuracyScore),
		feedback.Summary, feedback.Details,
		string(strengths), string(improvements), feedback.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert feedback: %w", err)
	}
	return nil
}

func (r *FeedbackRepository) GetBySessionID(sessionID string) (model.Feedback, error) {
	var f model.Feedback
	var strengthsJSON, improvementsJSON string
	var proportions, lineQuality, colorAccuracy int
	err := r.db.QueryRow(
		`SELECT id, session_id, overall_score, proportions_score, line_quality_score,
			color_accuracy_score, summary, details, strengths, improvements, created_at
		FROM feedback WHERE session_id = ?`,
		sessionID,
	).Scan(&f.ID, &f.SessionID, &f.OverallScore,
		&proportions, &lineQuality, &colorAccuracy,
		&f.Summary, &f.Details,
		&strengthsJSON, &improvementsJSON, &f.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return model.Feedback{}, fmt.Errorf("feedback not found for session: %s", sessionID)
	}
	if err != nil {
		return model.Feedback{}, fmt.Errorf("get feedback: %w", err)
	}

	f.ProportionsScore = intToPtr(proportions)
	f.LineQualityScore = intToPtr(lineQuality)
	f.ColorAccuracyScore = intToPtr(colorAccuracy)

	if err := json.Unmarshal([]byte(strengthsJSON), &f.Strengths); err != nil {
		return model.Feedback{}, fmt.Errorf("unmarshal strengths: %w", err)
	}
	if err := json.Unmarshal([]byte(improvementsJSON), &f.Improvements); err != nil {
		return model.Feedback{}, fmt.Errorf("unmarshal improvements: %w", err)
	}

	return f, nil
}
