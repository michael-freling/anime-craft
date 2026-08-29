package bff

import (
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/michael-freling/anime-craft/gateway/internal/model"
	"github.com/michael-freling/anime-craft/gateway/internal/repository"
)

type SessionService struct {
	repo *repository.SessionRepository
}

func NewSessionService(repo *repository.SessionRepository) *SessionService {
	return &SessionService{repo: repo}
}

func (s *SessionService) StartSession(mode string, referenceID string) (model.Session, error) {
	switch mode {
	case "line_work":
	default:
		slog.Error("invalid exercise mode", "method", "StartSession", "mode", mode, "referenceID", referenceID)
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
		slog.Error("failed to create session", "method", "StartSession", "mode", mode, "referenceID", referenceID, "error", err)
		return model.Session{}, fmt.Errorf("create session: %w", err)
	}
	return session, nil
}

func (s *SessionService) EndSession(sessionID string) (model.Session, error) {
	session, err := s.repo.Get(sessionID)
	if err != nil {
		slog.Error("failed to get session", "method", "EndSession", "sessionID", sessionID, "error", err)
		return model.Session{}, err
	}
	if session.Status != "in_progress" {
		slog.Error("session is not in progress", "method", "EndSession", "sessionID", sessionID, "status", session.Status)
		return model.Session{}, fmt.Errorf("session is not in progress: %s", session.Status)
	}

	now := time.Now()
	duration := int(now.Sub(session.StartedAt).Seconds())
	session.Status = "completed"
	session.EndedAt = &now
	session.DurationSeconds = &duration

	if err := s.repo.Update(session); err != nil {
		slog.Error("failed to update session", "method", "EndSession", "sessionID", sessionID, "error", err)
		return model.Session{}, fmt.Errorf("update session: %w", err)
	}
	return session, nil
}

func (s *SessionService) GetSession(sessionID string) (model.Session, error) {
	session, err := s.repo.Get(sessionID)
	if err != nil {
		slog.Error("failed to get session", "method", "GetSession", "sessionID", sessionID, "error", err)
		return model.Session{}, err
	}
	return session, nil
}

func (s *SessionService) ListSessions(limit int, offset int) ([]model.Session, error) {
	sessions, err := s.repo.List(limit, offset)
	if err != nil {
		slog.Error("failed to list sessions", "method", "ListSessions", "limit", limit, "offset", offset, "error", err)
		return nil, err
	}
	return sessions, nil
}

// ListResumableSessions returns the unfinished sessions the home screen
// offers to pick back up. Autosave means every one of them still has its
// drawing on disk.
func (s *SessionService) ListResumableSessions(limit int) ([]model.ResumableSession, error) {
	if limit <= 0 {
		limit = 10
	}
	sessions, err := s.repo.ListResumable(limit)
	if err != nil {
		slog.Error("failed to list resumable sessions", "method", "ListResumableSessions", "limit", limit, "error", err)
		return nil, err
	}
	return sessions, nil
}

// DiscardSession marks an unfinished session abandoned so it stops showing up
// as resumable.
func (s *SessionService) DiscardSession(sessionID string) error {
	session, err := s.repo.Get(sessionID)
	if err != nil {
		slog.Error("failed to get session", "method", "DiscardSession", "sessionID", sessionID, "error", err)
		return err
	}
	if session.Status != "in_progress" {
		return nil
	}

	now := time.Now()
	duration := int(now.Sub(session.StartedAt).Seconds())
	session.Status = "discarded"
	session.EndedAt = &now
	session.DurationSeconds = &duration

	if err := s.repo.Update(session); err != nil {
		slog.Error("failed to discard session", "method", "DiscardSession", "sessionID", sessionID, "error", err)
		return fmt.Errorf("discard session: %w", err)
	}
	return nil
}
