package bff

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/michael-freling/anime-craft/gateway/internal/model"
	"github.com/michael-freling/anime-craft/gateway/internal/repository"
)

// feedbackCall tracks an in-flight feedback generation request so that
// duplicate calls for the same session (e.g. React Strict Mode double-mount)
// share a single inference invocation.
type feedbackCall struct {
	done   chan struct{}
	result model.Feedback
	err    error
}

type FeedbackService struct {
	repo              *repository.FeedbackRepository
	sessionRepo       *repository.SessionRepository
	drawingRepo       *repository.DrawingRepository
	refRepo           *repository.ReferenceRepository
	dataDir           string
	lineArtExtractor  LineArtExtractor  // may be nil if not configured
	feedbackGenerator FeedbackGenerator // may be nil if inference service not available
	imageComparer     ImageComparer     // may be nil if inference service not available
	mu                sync.Mutex
	inflight          map[string]*feedbackCall
}

func NewFeedbackService(
	repo *repository.FeedbackRepository,
	sessionRepo *repository.SessionRepository,
	drawingRepo *repository.DrawingRepository,
	refRepo *repository.ReferenceRepository,
	dataDir string,
	lineArtExtractor LineArtExtractor,
	feedbackGenerator FeedbackGenerator,
	imageComparer ImageComparer,
) *FeedbackService {
	return &FeedbackService{
		repo:              repo,
		sessionRepo:       sessionRepo,
		drawingRepo:       drawingRepo,
		refRepo:           refRepo,
		dataDir:           dataDir,
		lineArtExtractor:  lineArtExtractor,
		feedbackGenerator: feedbackGenerator,
		imageComparer:     imageComparer,
		inflight:          make(map[string]*feedbackCall),
	}
}

func (s *FeedbackService) RequestFeedback(sessionID string) (model.Feedback, error) {
	// Check if feedback already exists for this session and has actual content.
	// Feedback with no scores and no summary is treated as incomplete (e.g. from
	// an older version of the code) and will be regenerated.
	existing, err := s.repo.GetBySessionID(sessionID)
	hasContent := err == nil && (existing.OverallScore > 0 || existing.Summary != "")
	if hasContent {
		slog.Info("returning cached feedback", "method", "RequestFeedback", "sessionID", sessionID, "overallScore", existing.OverallScore, "hasSummary", existing.Summary != "")
		// ReferenceLineArt and ComparisonHeatmap are transient (not in DB),
		// so re-populate them.
		s.populateTransientFieldsForSession(&existing, sessionID)
		return existing, nil
	}

	// Deduplicate in-flight requests for the same session. React Strict Mode
	// can double-mount and fire two requests before the cache is populated.
	s.mu.Lock()
	if call, ok := s.inflight[sessionID]; ok {
		s.mu.Unlock()
		slog.Info("waiting for in-flight feedback request", "method", "RequestFeedback", "sessionID", sessionID)
		<-call.done
		return call.result, call.err
	}
	call := &feedbackCall{done: make(chan struct{})}
	s.inflight[sessionID] = call
	s.mu.Unlock()

	// Perform the actual work. When finished, broadcast the result to any
	// waiters and remove the entry from the in-flight map.
	feedback, err := s.doRequestFeedback(sessionID, existing)
	call.result = feedback
	call.err = err
	close(call.done)

	s.mu.Lock()
	delete(s.inflight, sessionID)
	s.mu.Unlock()

	return feedback, err
}

// doRequestFeedback does the real work of generating feedback for a session.
// It is called at most once per session at any given time.
func (s *FeedbackService) doRequestFeedback(sessionID string, existing model.Feedback) (model.Feedback, error) {
	slog.Info("generating new feedback", "method", "RequestFeedback", "sessionID", sessionID)

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

	refData, err := os.ReadFile(filepath.Join(s.dataDir, refImage.FilePath))
	if err != nil {
		slog.Error("failed to read reference image file", "method", "RequestFeedback", "sessionID", sessionID, "filePath", filepath.Join(s.dataDir, refImage.FilePath), "error", err)
		return model.Feedback{}, fmt.Errorf("read reference image file: %w", err)
	}

	if s.feedbackGenerator == nil {
		slog.Error("feedback generator not available", "method", "RequestFeedback", "sessionID", sessionID)
		return model.Feedback{}, fmt.Errorf("feedback service is unavailable — start the inference service, or set INFERENCE_SERVICE_ADDR if it runs elsewhere")
	}

	// Extract line art from the reference image for the inference service.
	var refLineArt []byte
	var lineArtExtracted bool
	if s.lineArtExtractor != nil {
		refLineArt, err = s.lineArtExtractor.Extract(refData)
		if err != nil {
			slog.Warn("line art extraction failed for feedback generator, using raw ref image",
				"sessionID", sessionID, "error", err)
			refLineArt = refData
		} else {
			lineArtExtracted = true
		}
	} else {
		refLineArt = refData
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	result, err := s.feedbackGenerator.GenerateFeedback(
		ctx, refLineArt, drawingData, session.ExerciseMode,
	)
	if err != nil {
		slog.Error("feedback generation failed", "method", "RequestFeedback", "sessionID", sessionID, "error", err)
		return model.Feedback{}, fmt.Errorf("generate feedback: %w", err)
	}

	feedback := model.Feedback{
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
			if lineArtExtracted {
				existing.ReferenceLineArt = "data:image/png;base64," + base64.StdEncoding.EncodeToString(refLineArt)
				s.saveAnalysisImage(sessionID, referenceLineArtFile, refLineArt)
			}
			s.populateHeatmap(&existing, refLineArt, drawingData)
			return existing, nil
		}
		slog.Error("failed to store feedback", "method", "RequestFeedback", "sessionID", sessionID, "error", err)
		return model.Feedback{}, fmt.Errorf("store feedback: %w", err)
	}

	if lineArtExtracted {
		feedback.ReferenceLineArt = "data:image/png;base64," + base64.StdEncoding.EncodeToString(refLineArt)
		s.saveAnalysisImage(sessionID, referenceLineArtFile, refLineArt)
	}
	s.populateHeatmap(&feedback, refLineArt, drawingData)

	slog.Info("feedback ready", "method", "RequestFeedback", "sessionID", sessionID,
		"overallScore", feedback.OverallScore,
		"hasSummary", feedback.Summary != "",
		"hasLineArt", feedback.ReferenceLineArt != "",
		"hasHeatmap", feedback.ComparisonHeatmap != "",
		"hasProportionsScore", feedback.ProportionsScore != nil,
		"hasLineQualityScore", feedback.LineQualityScore != nil,
	)

	return feedback, nil
}

// The scores and the written feedback go to the database, but the two images
// the analysis produces — the reference line art and the comparison heatmap —
// used to be rebuilt by calling the inference service every time a result was
// looked at again. Looking back at an old result is exactly when that service
// is least likely to be running, which left the artist with the numbers and
// none of the pictures.
//
// They are written next to the drawing instead, so a result opens the same way
// however long afterwards, and costs no inference to revisit.
const (
	referenceLineArtFile  = "reference-line-art.png"
	comparisonHeatmapFile = "comparison-heatmap.png"
)

func (s *FeedbackService) analysisDir(sessionID string) string {
	return filepath.Join(s.dataDir, "feedback", sessionID)
}

// saveAnalysisImage keeps a picture the analysis produced. A failure to write
// it costs a revisit an inference call, not the result, so it is logged rather
// than surfaced.
func (s *FeedbackService) saveAnalysisImage(sessionID string, name string, data []byte) {
	if len(data) == 0 {
		return
	}
	dir := s.analysisDir(sessionID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		slog.Error("failed to create analysis directory", "sessionID", sessionID, "directory", dir, "error", err)
		return
	}
	if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
		slog.Error("failed to save analysis image", "sessionID", sessionID, "name", name, "error", err)
	}
}

// loadAnalysisImage returns a saved picture as a data URI, or an empty string
// when the result predates them being kept.
func (s *FeedbackService) loadAnalysisImage(sessionID string, name string) string {
	data, err := os.ReadFile(filepath.Join(s.analysisDir(sessionID), name))
	if err != nil {
		return ""
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
}

func (s *FeedbackService) GetFeedback(sessionID string) (model.Feedback, error) {
	feedback, err := s.repo.GetBySessionID(sessionID)
	if err != nil {
		slog.Error("failed to get feedback", "method", "GetFeedback", "sessionID", sessionID, "error", err)
		return model.Feedback{}, err
	}

	s.populateTransientFieldsForSession(&feedback, sessionID)

	return feedback, nil
}

// populateTransientFieldsForSession loads the reference image and drawing
// for the session, then populates the transient fields (line art and heatmap).
// Errors are logged but don't fail the request.
func (s *FeedbackService) populateTransientFieldsForSession(feedback *model.Feedback, sessionID string) {
	feedback.ReferenceLineArt = s.loadAnalysisImage(sessionID, referenceLineArtFile)
	feedback.ComparisonHeatmap = s.loadAnalysisImage(sessionID, comparisonHeatmapFile)
	if feedback.ReferenceLineArt != "" && feedback.ComparisonHeatmap != "" {
		return
	}

	// A result from before the pictures were kept: rebuild them once, and
	// save them so this is the last time.
	session, err := s.sessionRepo.Get(sessionID)
	if err != nil {
		slog.Error("failed to get session for transient fields", "sessionID", sessionID, "error", err)
		return
	}

	refImage, err := s.refRepo.Get(session.ReferenceImageID)
	if err != nil {
		slog.Error("failed to get reference image for transient fields", "sessionID", sessionID, "error", err)
		return
	}

	refData, err := os.ReadFile(filepath.Join(s.dataDir, refImage.FilePath))
	if err != nil {
		slog.Error("failed to read reference image for transient fields", "sessionID", sessionID, "path", filepath.Join(s.dataDir, refImage.FilePath), "error", err)
		return
	}

	// Extract line art once and reuse for both display and heatmap.
	var refLineArt []byte
	if s.lineArtExtractor != nil {
		refLineArt, err = s.lineArtExtractor.Extract(refData)
		if err != nil {
			slog.Warn("line art extraction failed", "sessionID", sessionID, "error", err)
			refLineArt = refData
		} else {
			feedback.ReferenceLineArt = "data:image/png;base64," + base64.StdEncoding.EncodeToString(refLineArt)
			s.saveAnalysisImage(sessionID, referenceLineArtFile, refLineArt)
		}
	} else {
		refLineArt = refData
	}

	if s.imageComparer == nil {
		return
	}

	drawing, err := s.drawingRepo.GetBySessionID(sessionID)
	if err != nil {
		slog.Error("failed to get drawing for heatmap", "sessionID", sessionID, "error", err)
		return
	}

	drawingData, err := os.ReadFile(drawing.FilePath)
	if err != nil {
		slog.Error("failed to read drawing for heatmap", "sessionID", sessionID, "path", drawing.FilePath, "error", err)
		return
	}

	s.populateHeatmap(feedback, refLineArt, drawingData)
}

// populateHeatmap generates an SSIM comparison heatmap from the reference
// line art and drawing, and sets the ComparisonHeatmap field. If the
// comparer is nil or comparison fails, the field is left empty.
func (s *FeedbackService) populateHeatmap(feedback *model.Feedback, refLineArt []byte, drawingData []byte) {
	if s.imageComparer == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	heatmapBytes, err := s.imageComparer.CompareImages(ctx, refLineArt, drawingData)
	if err != nil {
		slog.Error("failed to generate comparison heatmap", "method", "populateHeatmap", "sessionID", feedback.SessionID, "error", err)
		return
	}
	feedback.ComparisonHeatmap = "data:image/png;base64," + base64.StdEncoding.EncodeToString(heatmapBytes)
	s.saveAnalysisImage(feedback.SessionID, comparisonHeatmapFile, heatmapBytes)
}
