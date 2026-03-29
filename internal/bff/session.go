package bff

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/michael-freling/anime-craft/internal/model"
	"github.com/michael-freling/anime-craft/internal/repository"
)

type SessionService struct {
	repo *repository.SessionRepository
}

func NewSessionService(repo *repository.SessionRepository) *SessionService {
	return &SessionService{repo: repo}
}

func (s *SessionService) StartSession(mode string, referenceID string) (model.Session, error) {
	switch mode {
	case "line_work", "coloring", "full_drawing":
	default:
		return model.Session{}, fmt.Errorf("invalid exercise mode: %s", mode)
	}

	session := model.Session{
		ID:               uuid.New().String(),
		ReferenceImageID: referenceID,
		ExerciseMode:     mode,
		Status:           "in_progress",
		StartedAt:        time.Now(),
	}
	if err := s.repo.Create(session); err != nil {
		return model.Session{}, fmt.Errorf("create session: %w", err)
	}
	return session, nil
}

func (s *SessionService) EndSession(sessionID string) (model.Session, error) {
	session, err := s.repo.Get(sessionID)
	if err != nil {
		return model.Session{}, err
	}
	if session.Status != "in_progress" {
		return model.Session{}, fmt.Errorf("session is not in progress: %s", session.Status)
	}

	now := time.Now()
	duration := int(now.Sub(session.StartedAt).Seconds())
	session.Status = "completed"
	session.EndedAt = &now
	session.DurationSeconds = &duration

	if err := s.repo.Update(session); err != nil {
		return model.Session{}, fmt.Errorf("update session: %w", err)
	}
	return session, nil
}

func (s *SessionService) GetSession(sessionID string) (model.Session, error) {
	return s.repo.Get(sessionID)
}

func (s *SessionService) ListSessions(limit int, offset int) ([]model.Session, error) {
	return s.repo.List(limit, offset)
}
