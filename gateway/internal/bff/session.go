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
	// feedbackRepo is only read from, to tell the home screen what a drawing
	// last scored. It may be nil.
	feedbackRepo *repository.FeedbackRepository
}

func NewSessionService(repo *repository.SessionRepository, feedbackRepo *repository.FeedbackRepository) *SessionService {
	return &SessionService{repo: repo, feedbackRepo: feedbackRepo}
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

// ListResumableSessions returns the saved drawings the home screen offers to
// pick back up, finished sessions included: a submitted drawing is still one
// the artist may want to carry on with.
func (s *SessionService) ListResumableSessions(limit int) ([]model.ResumableSession, error) {
	if limit <= 0 {
		limit = 10
	}
	sessions, err := s.repo.ListResumable(limit)
	if err != nil {
		slog.Error("failed to list resumable sessions", "method", "ListResumableSessions", "limit", limit, "error", err)
		return nil, err
	}
	for i := range sessions {
		s.attachDrawingHistory(&sessions[i])
	}
	return sessions, nil
}

// attachDrawingHistory walks back over the attempts made on a drawing, so the
// home screen can say when the drawing was started and what it last scored.
//
// A drawing carried on with moves into a new session, so both answers usually
// belong to an earlier link in the chain than the session being listed. Left
// unwalked, a drawing would appear to have been started on the day it was last
// picked up, and the result worth reading before picking it up again would be
// out of reach.
func (s *SessionService) attachDrawingHistory(session *model.ResumableSession) {
	// A chain is a handful of attempts; the bound is only there so a cycle
	// cannot spin.
	const maxChain = 50
	for id, steps := session.ID, 0; steps < maxChain; steps++ {
		if s.feedbackRepo != nil {
			if feedback, err := s.feedbackRepo.GetBySessionID(id); err == nil && (feedback.OverallScore > 0 || feedback.Summary != "") {
				if session.LastResultSessionID == "" {
					session.LastResultSessionID = id
					session.LastScore = feedback.OverallScore
				}
				session.ResultCount++
			}
		}

		previous, found, err := s.repo.PreviousInChain(id)
		if err != nil {
			slog.Error("failed to walk back the drawing's attempts", "method", "ListResumableSessions", "sessionID", id, "error", err)
			return
		}
		if !found {
			return
		}
		// Walking strictly backwards, so the last one reached is the first
		// attempt, and its start is when the drawing was started.
		session.DrawingStartedAt = previous.StartedAt
		id = previous.ID
	}
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
