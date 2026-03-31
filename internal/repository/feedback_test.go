package repository

import (
	"testing"
	"time"

	"github.com/michael-freling/anime-craft/internal/model"
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

func TestFeedbackRepository_Create_DuplicateSessionID(t *testing.T) {
	db := testDB(t)
	repo := NewFeedbackRepository(db)

	// Insert a session
	_, err := db.Exec(
		"INSERT INTO sessions (id, reference_image_id, exercise_mode, status, started_at) VALUES (?, ?, ?, ?, ?)",
		"sess-dup-fb", "ref-001", "line_work", "completed", time.Now(),
	)
	require.NoError(t, err)

	feedback := model.Feedback{
		ID:           "fb-dup-1",
		SessionID:    "sess-dup-fb",
		OverallScore: 72,
		Summary:      "Good",
		Details:      "Details",
		Strengths:    []string{"Good"},
		Improvements: []string{"Better"},
		CreatedAt:    time.Now().Truncate(time.Second),
	}

	err = repo.Create(feedback)
	require.NoError(t, err)

	// Creating another feedback for the same session should fail (UNIQUE constraint)
	feedback2 := model.Feedback{
		ID:           "fb-dup-2",
		SessionID:    "sess-dup-fb",
		OverallScore: 80,
		Summary:      "Great",
		Details:      "Details 2",
		Strengths:    []string{"Great"},
		Improvements: []string{"Keep going"},
		CreatedAt:    time.Now().Truncate(time.Second),
	}
	err = repo.Create(feedback2)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "insert feedback")
}

func TestFeedbackRepository_Create_WithAllScores(t *testing.T) {
	db := testDB(t)
	repo := NewFeedbackRepository(db)

	// Insert a session
	_, err := db.Exec(
		"INSERT INTO sessions (id, reference_image_id, exercise_mode, status, started_at) VALUES (?, ?, ?, ?, ?)",
		"sess-all-scores", "ref-001", "line_work", "completed", time.Now(),
	)
	require.NoError(t, err)

	propScore := 85
	lineScore := 90
	colorScore := 78
	feedback := model.Feedback{
		ID:                 "fb-all-scores",
		SessionID:          "sess-all-scores",
		OverallScore:       84,
		ProportionsScore:   &propScore,
		LineQualityScore:   &lineScore,
		ColorAccuracyScore: &colorScore,
		Summary:            "Excellent",
		Details:            "Great detail",
		Strengths:          []string{"Lines", "Colors"},
		Improvements:       []string{"Proportions"},
		CreatedAt:          time.Now().Truncate(time.Second),
	}

	err = repo.Create(feedback)
	require.NoError(t, err)

	got, err := repo.GetBySessionID("sess-all-scores")
	require.NoError(t, err)
	assert.Equal(t, 84, got.OverallScore)
	require.NotNil(t, got.ProportionsScore)
	assert.Equal(t, 85, *got.ProportionsScore)
	require.NotNil(t, got.LineQualityScore)
	assert.Equal(t, 90, *got.LineQualityScore)
	require.NotNil(t, got.ColorAccuracyScore)
	assert.Equal(t, 78, *got.ColorAccuracyScore)
}

func TestFeedbackRepository_Create_NilScores(t *testing.T) {
	db := testDB(t)
	repo := NewFeedbackRepository(db)

	// Insert a session
	_, err := db.Exec(
		"INSERT INTO sessions (id, reference_image_id, exercise_mode, status, started_at) VALUES (?, ?, ?, ?, ?)",
		"sess-nil-scores", "ref-001", "line_work", "completed", time.Now(),
	)
	require.NoError(t, err)

	feedback := model.Feedback{
		ID:           "fb-nil-scores",
		SessionID:    "sess-nil-scores",
		OverallScore: 50,
		Summary:      "OK",
		Details:      "Basic",
		Strengths:    []string{},
		Improvements: []string{},
		CreatedAt:    time.Now().Truncate(time.Second),
	}

	err = repo.Create(feedback)
	require.NoError(t, err)

	got, err := repo.GetBySessionID("sess-nil-scores")
	require.NoError(t, err)
	assert.Equal(t, 50, got.OverallScore)
	assert.Nil(t, got.ProportionsScore)
	assert.Nil(t, got.LineQualityScore)
	assert.Nil(t, got.ColorAccuracyScore)
}

func TestFeedbackRepository_GetBySessionID_DBClosed(t *testing.T) {
	db := testDB(t)
	repo := NewFeedbackRepository(db)

	require.NoError(t, db.Close())

	_, err := repo.GetBySessionID("any-session")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "get feedback")
}
