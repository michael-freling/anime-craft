package bff

import (
	"encoding/base64"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/michael-freling/anime-craft/gateway/internal/drawdoc"
	"github.com/michael-freling/anime-craft/gateway/internal/model"
	"github.com/michael-freling/anime-craft/gateway/internal/repository"
)

type DrawingService struct {
	repo         *repository.DrawingRepository
	documentRepo *repository.DrawingDocumentRepository
	sessionRepo  *repository.SessionRepository
	refRepo      *repository.ReferenceRepository
	dataDir      string
	// store holds the autosaved, resumable form of each drawing: a journal of
	// vector operations checkpointed into an OpenRaster file. repo holds the
	// flattened PNG a finished session is graded from.
	store *drawdoc.Store
}

func NewDrawingService(
	repo *repository.DrawingRepository,
	documentRepo *repository.DrawingDocumentRepository,
	sessionRepo *repository.SessionRepository,
	refRepo *repository.ReferenceRepository,
	dataDir string,
) *DrawingService {
	return &DrawingService{
		repo:         repo,
		documentRepo: documentRepo,
		sessionRepo:  sessionRepo,
		refRepo:      refRepo,
		dataDir:      dataDir,
		store:        drawdoc.NewStore(filepath.Join(dataDir, "drawings")),
	}
}

func (s *DrawingService) SaveDrawing(sessionID string, imageDataBase64 string) (model.Drawing, error) {
	// Strip data URI prefix if present (e.g. "data:image/png;base64,")
	if idx := strings.Index(imageDataBase64, ","); idx >= 0 && strings.Contains(imageDataBase64[:idx], "base64") {
		imageDataBase64 = imageDataBase64[idx+1:]
	}

	data, err := base64.StdEncoding.DecodeString(imageDataBase64)
	if err != nil {
		slog.Error("failed to decode base64 image data", "method", "SaveDrawing", "sessionID", sessionID, "error", err)
		return model.Drawing{}, fmt.Errorf("decode base64: %w", err)
	}

	drawingsDir := filepath.Join(s.dataDir, "drawings")
	if err := os.MkdirAll(drawingsDir, 0o755); err != nil {
		slog.Error("failed to create drawings directory", "method", "SaveDrawing", "sessionID", sessionID, "directory", drawingsDir, "error", err)
		return model.Drawing{}, fmt.Errorf("create drawings directory: %w", err)
	}

	filePath := filepath.Join(drawingsDir, sessionID+".png")
	if err := os.WriteFile(filePath, data, 0o644); err != nil {
		slog.Error("failed to write drawing file", "method", "SaveDrawing", "sessionID", sessionID, "filePath", filePath, "error", err)
		return model.Drawing{}, fmt.Errorf("write drawing file: %w", err)
	}

	drawing := model.Drawing{
		ID:        uuid.New().String(),
		SessionID: sessionID,
		FilePath:  filePath,
		CreatedAt: time.Now(),
	}
	if err := s.repo.Create(drawing); err != nil {
		slog.Error("failed to create drawing record", "method", "SaveDrawing", "sessionID", sessionID, "filePath", filePath, "error", err)
		return model.Drawing{}, fmt.Errorf("create drawing record: %w", err)
	}

	// Submitting is the moment the drawing is finished, so bring the portable
	// file level with the journal. A failure here does not lose work.
	if _, err := s.FlushDrawingDocument(sessionID); err != nil {
		slog.Error("failed to flush drawing document on submit", "method", "SaveDrawing", "sessionID", sessionID, "error", err)
	}
	return drawing, nil
}

func (s *DrawingService) GetDrawing(sessionID string) (model.Drawing, error) {
	drawing, err := s.repo.GetBySessionID(sessionID)
	if err != nil {
		slog.Error("failed to get drawing", "method", "GetDrawing", "sessionID", sessionID, "error", err)
		return model.Drawing{}, err
	}
	return drawing, nil
}

// GetDrawingImageData returns the base64-encoded image data for a drawing.
func (s *DrawingService) GetDrawingImageData(sessionID string) (string, error) {
	drawing, err := s.repo.GetBySessionID(sessionID)
	if err != nil {
		return "", fmt.Errorf("get drawing: %w", err)
	}

	data, err := os.ReadFile(drawing.FilePath)
	if err != nil {
		return "", fmt.Errorf("read drawing file: %w", err)
	}

	encoded := base64.StdEncoding.EncodeToString(data)
	return fmt.Sprintf("data:image/png;base64,%s", encoded), nil
}
