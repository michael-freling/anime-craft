package bff

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProgressService_GetProgressSummary(t *testing.T) {
	svc := NewProgressService()

	summary, err := svc.GetProgressSummary()
	require.NoError(t, err)
	assert.Equal(t, 0, summary.TotalSessions)
	assert.Equal(t, 0, summary.CompletedSessions)
	assert.Equal(t, float64(0), summary.AverageScore)
	assert.Equal(t, 0, summary.BestScore)
	assert.Equal(t, 0, summary.CurrentStreak)
	assert.Nil(t, summary.RecentScores)
}

func TestProgressService_GetAchievements(t *testing.T) {
	svc := NewProgressService()

	achievements, err := svc.GetAchievements()
	require.NoError(t, err)
	assert.Nil(t, achievements)
}
