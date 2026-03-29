package bff

import "github.com/michael-freling/anime-craft/internal/model"

type SettingsService struct{}

func NewSettingsService() *SettingsService {
	return &SettingsService{}
}

func (s *SettingsService) GetSettings() (model.Settings, error) {
	return model.Settings{}, nil
}

func (s *SettingsService) UpdateSettings(settings model.Settings) (model.Settings, error) {
	return settings, nil
}
