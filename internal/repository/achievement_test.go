package repository

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewAchievementRepository(t *testing.T) {
	repo := NewAchievementRepository()
	assert.NotNil(t, repo)
}
