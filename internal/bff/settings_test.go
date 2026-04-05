package bff

import (
	"testing"

	"github.com/michael-freling/anime-craft/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSettingsService_GetSettings(t *testing.T) {
	svc := NewSettingsService()

	settings, err := svc.GetSettings()
	require.NoError(t, err)
	assert.Equal(t, "", settings.AIAPIKey)
	assert.Equal(t, "", settings.AIProvider)
	assert.Equal(t, 0, settings.BrushDefaultSize)
	assert.Equal(t, "", settings.Theme)
}

func TestSettingsService_UpdateSettings(t *testing.T) {
	svc := NewSettingsService()

	input := model.Settings{
		AIAPIKey:         "test-api-key",
		AIProvider:       "openai",
		BrushDefaultSize: 5,
		Theme:            "dark",
	}

	updated, err := svc.UpdateSettings(input)
	require.NoError(t, err)
	assert.Equal(t, "test-api-key", updated.AIAPIKey)
	assert.Equal(t, "openai", updated.AIProvider)
	assert.Equal(t, 5, updated.BrushDefaultSize)
	assert.Equal(t, "dark", updated.Theme)
}

func TestSettingsService_UpdateSettings_EmptyValues(t *testing.T) {
	svc := NewSettingsService()

	input := model.Settings{}

	updated, err := svc.UpdateSettings(input)
	require.NoError(t, err)
	assert.Equal(t, "", updated.AIAPIKey)
	assert.Equal(t, "", updated.AIProvider)
	assert.Equal(t, 0, updated.BrushDefaultSize)
	assert.Equal(t, "", updated.Theme)
}
