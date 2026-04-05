package bff

import (
	"encoding/base64"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/michael-freling/anime-craft/internal/model"
	"github.com/michael-freling/anime-craft/internal/repository"
)

type FeedbackService struct {
	repo             *repository.FeedbackRepository
	sessionRepo      *repository.SessionRepository
	drawingRepo      *repository.DrawingRepository
	refRepo          *repository.ReferenceRepository
	dataDir          string
	lineArtExtractor LineArtExtractor // may be nil if not configured
}

func NewFeedbackService(
	repo *repository.FeedbackRepository,
	sessionRepo *repository.SessionRepository,
	drawingRepo *repository.DrawingRepository,
	refRepo *repository.ReferenceRepository,
	dataDir string,
	lineArtExtractor LineArtExtractor,
) *FeedbackService {
	return &FeedbackService{
		repo:             repo,
		sessionRepo:      sessionRepo,
		drawingRepo:      drawingRepo,
		refRepo:          refRepo,
		dataDir:          dataDir,
		lineArtExtractor: lineArtExtractor,
	}
}

func (s *FeedbackService) RequestFeedback(sessionID string) (model.Feedback, error) {
	// Check if feedback already exists for this session
	existing, err := s.repo.GetBySessionID(sessionID)
	if err == nil {
		// ReferenceLineArt is transient (not in DB), so re-populate it.
		s.populateLineArtForSession(&existing, sessionID)
		return existing, nil
	}

	session, err := s.sessionRepo.Get(sessionID)
	if err != nil {
		slog.Error("failed to get session", "method", "RequestFeedback", "sessionID", sessionID, "error", err)
		return model.Feedback{}, fmt.Errorf("get session: %w", err)
	}

	refImage, err := s.refRepo.Get(session.ReferenceImageID)
	if err != nil {
		slog.Error("failed to get reference image", "method", "RequestFeedback", "sessionID", sessionID, "referenceImageID", session.ReferenceImageID, "error", err)
		return model.Feedback{}, fmt.Errorf("get reference image: %w", err)
	}

	refData, err := os.ReadFile(filepath.Join(s.dataDir, refImage.FilePath))
	if err != nil {
		slog.Error("failed to read reference image file", "method", "RequestFeedback", "sessionID", sessionID, "filePath", filepath.Join(s.dataDir, refImage.FilePath), "error", err)
		return model.Feedback{}, fmt.Errorf("read reference image file: %w", err)
	}

	feedback := model.Feedback{
		ID:        uuid.New().String(),
		SessionID: sessionID,
		CreatedAt: time.Now(),
	}

	if err := s.repo.Create(feedback); err != nil {
		// Handle race condition: another concurrent call may have inserted feedback
		// for this session between our existence check and this insert.
		existing, getErr := s.repo.GetBySessionID(sessionID)
		if getErr == nil {
			s.populateLineArt(&existing, refData)
			return existing, nil
		}
		slog.Error("failed to store feedback", "method", "RequestFeedback", "sessionID", sessionID, "error", err)
		return model.Feedback{}, fmt.Errorf("store feedback: %w", err)
	}

	s.populateLineArt(&feedback, refData)

	return feedback, nil
}

func (s *FeedbackService) GetFeedback(sessionID string) (model.Feedback, error) {
	feedback, err := s.repo.GetBySessionID(sessionID)
	if err != nil {
		slog.Error("failed to get feedback", "method", "GetFeedback", "sessionID", sessionID, "error", err)
		return model.Feedback{}, err
	}

	s.populateLineArtForSession(&feedback, sessionID)

	return feedback, nil
}

// populateLineArtForSession loads the reference image for the session and
// extracts line art. Errors are logged but don't fail the request.
func (s *FeedbackService) populateLineArtForSession(feedback *model.Feedback, sessionID string) {
	if s.lineArtExtractor == nil {
		slog.Warn("line art extractor not available, skipping line art", "sessionID", sessionID)
		return
	}

	session, err := s.sessionRepo.Get(sessionID)
	if err != nil {
		slog.Error("failed to get session for line art", "sessionID", sessionID, "error", err)
		return
	}

	refImage, err := s.refRepo.Get(session.ReferenceImageID)
	if err != nil {
		slog.Error("failed to get reference image for line art", "sessionID", sessionID, "error", err)
		return
	}

	refPath := filepath.Join(s.dataDir, refImage.FilePath)
	refData, err := os.ReadFile(refPath)
	if err != nil {
		slog.Error("failed to read reference image for line art", "sessionID", sessionID, "path", refPath, "error", err)
		return
	}

	s.populateLineArt(feedback, refData)
}

// populateLineArt extracts line art from the reference image data and sets
// the ReferenceLineArt field on the feedback. If the extractor is nil or
// extraction fails, the field is left empty and the error is logged.
func (s *FeedbackService) populateLineArt(feedback *model.Feedback, refData []byte) {
	if s.lineArtExtractor == nil {
		return
	}
	lineArtBytes, err := s.lineArtExtractor.Extract(refData)
	if err != nil {
		slog.Error("failed to extract line art", "method", "populateLineArt", "sessionID", feedback.SessionID, "error", err)
		return
	}
	feedback.ReferenceLineArt = "data:image/png;base64," + base64.StdEncoding.EncodeToString(lineArtBytes)
}
