package repository

import (
	"testing"
	"time"

	"github.com/michael-freling/anime-craft/gateway/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFeedbackRepository_CreateAndGetBySessionID(t *testing.T) {
	db := testDB(t)
	repo := NewFeedbackRepository(db)

	// Insert a session using seeded reference image (ref-001 from seed data)
	_, err := db.Exec(
		"INSERT INTO sessions (id, reference_image_id, exercise_mode, status, started_at) VALUES (?, ?, ?, ?, ?)",
		"sess-001", "ref-001", "line_work", "completed", time.Now(),
	)
	require.NoError(t, err)

	propScore := 68
	lineScore := 75
	feedback := model.Feedback{
		ID:               "fb-001",
		SessionID:        "sess-001",
		OverallScore:     72,
		ProportionsScore: &propScore,
		LineQualityScore: &lineScore,
		Summary:          "Good effort!",
		Details:          "Your line work is solid.",
		Strengths:        []string{"Good lines", "Nice composition"},
		Improvements:     []string{"Work on proportions"},
		CreatedAt:        time.Now().Truncate(time.Second),
	}

	err = repo.Create(feedback)
	require.NoError(t, err)

	got, err := repo.GetBySessionID("sess-001")
	require.NoError(t, err)
	assert.Equal(t, feedback.ID, got.ID)
	assert.Equal(t, feedback.SessionID, got.SessionID)
	assert.Equal(t, feedback.OverallScore, got.OverallScore)
	assert.Equal(t, *feedback.ProportionsScore, *got.ProportionsScore)
	assert.Equal(t, *feedback.LineQualityScore, *got.LineQualityScore)
	assert.Equal(t, feedback.Summary, got.Summary)
	assert.Equal(t, feedback.Details, got.Details)
	assert.Equal(t, feedback.Strengths, got.Strengths)
	assert.Equal(t, feedback.Improvements, got.Improvements)
}

func TestFeedbackRepository_GetBySessionID_NotFound(t *testing.T) {
	db := testDB(t)
	repo := NewFeedbackRepository(db)

	_, err := repo.GetBySessionID("nonexistent")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "feedback not found")
}
