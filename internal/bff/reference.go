package bff

import (
	"github.com/michael-freling/anime-craft/internal/model"
	"github.com/michael-freling/anime-craft/internal/repository"
)

type ReferenceService struct {
	repo *repository.ReferenceRepository
}

func NewReferenceService(repo *repository.ReferenceRepository) *ReferenceService {
	return &ReferenceService{repo: repo}
}

func (s *ReferenceService) ListReferences(mode string) ([]model.ReferenceImage, error) {
	return s.repo.List(mode)
}

func (s *ReferenceService) GetReference(referenceID string) (model.ReferenceImage, error) {
	return s.repo.Get(referenceID)
}
