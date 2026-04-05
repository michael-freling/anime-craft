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
	"github.com/michael-freling/anime-craft/gateway/internal/model"
	"github.com/michael-freling/anime-craft/gateway/internal/repository"
)

type DrawingService struct {
	repo    *repository.DrawingRepository
	dataDir string
}

func NewDrawingService(repo *repository.DrawingRepository, dataDir string) *DrawingService {
	return &DrawingService{repo: repo, dataDir: dataDir}
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
