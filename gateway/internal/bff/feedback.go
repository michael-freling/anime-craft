package bff

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/michael-freling/anime-craft/gateway/internal/ai"
	"github.com/michael-freling/anime-craft/gateway/internal/model"
	"github.com/michael-freling/anime-craft/gateway/internal/repository"
)

type FeedbackService struct {
	repo              *repository.FeedbackRepository
	sessionRepo       *repository.SessionRepository
	drawingRepo       *repository.DrawingRepository
	refRepo           *repository.ReferenceRepository
	aiClient          ai.FeedbackClient
	dataDir           string
	lineArtExtractor  LineArtExtractor  // may be nil if not configured
	feedbackGenerator FeedbackGenerator // may be nil if inference service not available
}

func NewFeedbackService(
	repo *repository.FeedbackRepository,
	sessionRepo *repository.SessionRepository,
	drawingRepo *repository.DrawingRepository,
	refRepo *repository.ReferenceRepository,
	aiClient ai.FeedbackClient,
	dataDir string,
	lineArtExtractor LineArtExtractor,
	feedbackGenerator FeedbackGenerator,
) *FeedbackService {
	return &FeedbackService{
		repo:              repo,
		sessionRepo:       sessionRepo,
		drawingRepo:       drawingRepo,
		refRepo:           refRepo,
		aiClient:          aiClient,
		dataDir:           dataDir,
		lineArtExtractor:  lineArtExtractor,
		feedbackGenerator: feedbackGenerator,
	}
}

func (s *FeedbackService) RequestFeedback(sessionID string) (model.Feedback, error) {
	// Check if feedback already exists for this session and has actual content.
	// Feedback with no scores and no summary is treated as incomplete (e.g. from
	// an older version of the code) and will be regenerated.
	existing, err := s.repo.GetBySessionID(sessionID)
	hasContent := err == nil && (existing.OverallScore > 0 || existing.Summary != "")
	if hasContent {
		// ReferenceLineArt is transient (not in DB), so re-populate it.
		s.populateLineArtForSession(&existing, sessionID)
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

	// Try the inference service (feedbackGenerator) first if available.
	// Fall back to the legacy AI client otherwise.
	var feedback model.Feedback
	if s.feedbackGenerator != nil {
		// Extract line art from the reference image for the inference service.
		var refLineArt []byte
		if s.lineArtExtractor != nil {
			refLineArt, err = s.lineArtExtractor.Extract(refData)
			if err != nil {
				slog.Warn("line art extraction failed for feedback generator, using raw ref image",
					"sessionID", sessionID, "error", err)
				refLineArt = refData
			}
		} else {
			refLineArt = refData
		}

		result, genErr := s.feedbackGenerator.GenerateFeedback(
			context.Background(), refLineArt, drawingData, session.ExerciseMode,
		)
		if genErr != nil {
			slog.Warn("inference feedback generator failed, falling back to AI client",
				"sessionID", sessionID, "error", genErr)
		} else {
			feedback = model.Feedback{
				ID:           uuid.New().String(),
				SessionID:    sessionID,
				OverallScore: int(result.GetOverallScore()),
				Summary:      result.GetSummary(),
				Details:      result.GetDetails(),
				Strengths:    result.GetStrengths(),
				Improvements: result.GetImprovements(),
				CreatedAt:    time.Now(),
			}
			if score := int(result.GetProportionsScore()); score > 0 {
				feedback.ProportionsScore = &score
			}
			if score := int(result.GetLineQualityScore()); score > 0 {
				feedback.LineQualityScore = &score
			}
			if score := int(result.GetAccuracyScore()); score > 0 {
				feedback.AccuracyScore = &score
			}
		}
	}

	// Fall back to the legacy AI client if feedbackGenerator was nil or failed.
	if feedback.ID == "" {
		resp, err := s.aiClient.AnalyzeDrawing(context.Background(), ai.AnalysisRequest{
			ReferenceImage: refData,
			UserDrawing:    drawingData,
			ExerciseMode:   session.ExerciseMode,
		})
		if err != nil {
			slog.Error("failed to analyze drawing", "method", "RequestFeedback", "sessionID", sessionID, "exerciseMode", session.ExerciseMode, "error", err)
			return model.Feedback{}, fmt.Errorf("analyze drawing: %w", err)
		}

		feedback = model.Feedback{
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
	}

	// If incomplete feedback exists from a prior run, update it; otherwise create new.
	if existing.ID != "" {
		feedback.ID = existing.ID
		if err := s.repo.Update(feedback); err != nil {
			slog.Error("failed to update feedback", "method", "RequestFeedback", "sessionID", sessionID, "error", err)
			return model.Feedback{}, fmt.Errorf("update feedback: %w", err)
		}
	} else if err := s.repo.Create(feedback); err != nil {
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

	refData, err := os.ReadFile(refImage.FilePath)
	if err != nil {
		slog.Error("failed to read reference image for line art", "sessionID", sessionID, "path", refImage.FilePath, "error", err)
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
