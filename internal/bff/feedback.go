package bff

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/michael-freling/anime-craft/internal/ai"
	"github.com/michael-freling/anime-craft/internal/model"
	"github.com/michael-freling/anime-craft/internal/repository"
)

type FeedbackService struct {
	repo        *repository.FeedbackRepository
	sessionRepo *repository.SessionRepository
	drawingRepo *repository.DrawingRepository
	refRepo     *repository.ReferenceRepository
	aiClient    ai.FeedbackClient
	dataDir     string
}

func NewFeedbackService(
	repo *repository.FeedbackRepository,
	sessionRepo *repository.SessionRepository,
	drawingRepo *repository.DrawingRepository,
	refRepo *repository.ReferenceRepository,
	aiClient ai.FeedbackClient,
	dataDir string,
) *FeedbackService {
	return &FeedbackService{
		repo:        repo,
		sessionRepo: sessionRepo,
		drawingRepo: drawingRepo,
		refRepo:     refRepo,
		aiClient:    aiClient,
		dataDir:     dataDir,
	}
}

func (s *FeedbackService) RequestFeedback(sessionID string) (model.Feedback, error) {
	// Check if feedback already exists for this session
	existing, err := s.repo.GetBySessionID(sessionID)
	if err == nil {
		return existing, nil
	}

	session, err := s.sessionRepo.Get(sessionID)
	if err != nil {
		slog.Error("failed to get session", "method", "RequestFeedback", "sessionID", sessionID, "error", err)
		return model.Feedback{}, fmt.Errorf("get session: %w", err)
	}

	drawing, err := s.drawingRepo.GetBySessionID(sessionID)
	if err != nil {
		slog.Error("failed to get drawing", "method", "RequestFeedback", "sessionID", sessionID, "error", err)
		return model.Feedback{}, fmt.Errorf("get drawing: %w", err)
	}

	refImage, err := s.refRepo.Get(session.ReferenceImageID)
	if err != nil {
		slog.Error("failed to get reference image", "method", "RequestFeedback", "sessionID", sessionID, "referenceImageID", session.ReferenceImageID, "error", err)
		return model.Feedback{}, fmt.Errorf("get reference image: %w", err)
	}

	drawingData, err := os.ReadFile(drawing.FilePath)
	if err != nil {
		slog.Error("failed to read drawing file", "method", "RequestFeedback", "sessionID", sessionID, "filePath", drawing.FilePath, "error", err)
		return model.Feedback{}, fmt.Errorf("read drawing file: %w", err)
	}

	refData, err := os.ReadFile(refImage.FilePath)
	if err != nil {
		slog.Error("failed to read reference image file", "method", "RequestFeedback", "sessionID", sessionID, "filePath", refImage.FilePath, "error", err)
		return model.Feedback{}, fmt.Errorf("read reference image file: %w", err)
	}

	resp, err := s.aiClient.AnalyzeDrawing(context.Background(), ai.AnalysisRequest{
		ReferenceImage: refData,
		UserDrawing:    drawingData,
		ExerciseMode:   session.ExerciseMode,
	})
	if err != nil {
		slog.Error("failed to analyze drawing", "method", "RequestFeedback", "sessionID", sessionID, "exerciseMode", session.ExerciseMode, "error", err)
		return model.Feedback{}, fmt.Errorf("analyze drawing: %w", err)
	}

	feedback := model.Feedback{
		ID:           uuid.New().String(),
		SessionID:    sessionID,
		OverallScore: resp.OverallScore,
		Summary:      resp.Summary,
		Details:      resp.Details,
		Strengths:    resp.Strengths,
		Improvements: resp.Improvements,
		CreatedAt:    time.Now(),
	}

	if resp.ProportionsScore > 0 {
		score := resp.ProportionsScore
		feedback.ProportionsScore = &score
	}
	if resp.LineQualityScore > 0 {
		score := resp.LineQualityScore
		feedback.LineQualityScore = &score
	}
	if resp.ColorAccuracyScore > 0 {
		score := resp.ColorAccuracyScore
		feedback.ColorAccuracyScore = &score
	}

	if err := s.repo.Create(feedback); err != nil {
		slog.Error("failed to store feedback", "method", "RequestFeedback", "sessionID", sessionID, "error", err)
		return model.Feedback{}, fmt.Errorf("store feedback: %w", err)
	}

	return feedback, nil
}

func (s *FeedbackService) GetFeedback(sessionID string) (model.Feedback, error) {
	feedback, err := s.repo.GetBySessionID(sessionID)
	if err != nil {
		slog.Error("failed to get feedback", "method", "GetFeedback", "sessionID", sessionID, "error", err)
		return model.Feedback{}, err
	}
	return feedback, nil
}
