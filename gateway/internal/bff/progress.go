package bff

import "github.com/michael-freling/anime-craft/gateway/internal/model"

type ProgressService struct{}

func NewProgressService() *ProgressService {
	return &ProgressService{}
}

func (s *ProgressService) GetProgressSummary() (model.ProgressSummary, error) {
	return model.ProgressSummary{}, nil
}

func (s *ProgressService) GetAchievements() ([]model.AchievementStatus, error) {
	return nil, nil
}
