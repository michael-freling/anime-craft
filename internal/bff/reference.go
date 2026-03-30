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
	"github.com/michael-freling/anime-craft/internal/model"
	"github.com/michael-freling/anime-craft/internal/repository"
)

type ReferenceService struct {
	repo    *repository.ReferenceRepository
	dataDir string
}

func NewReferenceService(repo *repository.ReferenceRepository, dataDir string) *ReferenceService {
	return &ReferenceService{repo: repo, dataDir: dataDir}
}

func (s *ReferenceService) ListReferences(mode string) ([]model.ReferenceImage, error) {
	refs, err := s.repo.List(mode)
	if err != nil {
		slog.Error("failed to list references", "method", "ListReferences", "mode", mode, "error", err)
		return nil, err
	}
	return refs, nil
}

func (s *ReferenceService) GetReference(referenceID string) (model.ReferenceImage, error) {
	ref, err := s.repo.Get(referenceID)
	if err != nil {
		slog.Error("failed to get reference", "method", "GetReference", "referenceID", referenceID, "error", err)
		return model.ReferenceImage{}, err
	}
	return ref, nil
}

func (s *ReferenceService) AddReference(title string, difficulty string, imageDataBase64 string) (model.ReferenceImage, error) {
	slog.Info("AddReference called", "title", title, "difficulty", difficulty, "base64Length", len(imageDataBase64))
	// Strip data URI prefix if present (e.g. "data:image/png;base64,")
	if idx := strings.Index(imageDataBase64, ","); idx >= 0 && strings.Contains(imageDataBase64[:idx], "base64") {
		imageDataBase64 = imageDataBase64[idx+1:]
	}

	data, err := base64.StdEncoding.DecodeString(imageDataBase64)
	if err != nil {
		slog.Error("failed to decode base64 image data", "method", "AddReference", "title", title, "difficulty", difficulty, "error", err)
		return model.ReferenceImage{}, fmt.Errorf("decode base64: %w", err)
	}

	id := uuid.New().String()
	relPath := filepath.Join("references", id+".png")
	absPath := filepath.Join(s.dataDir, relPath)

	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		slog.Error("failed to create references directory", "method", "AddReference", "title", title, "directory", filepath.Dir(absPath), "error", err)
		return model.ReferenceImage{}, fmt.Errorf("create references directory: %w", err)
	}

	if err := os.WriteFile(absPath, data, 0o644); err != nil {
		slog.Error("failed to write reference image file", "method", "AddReference", "title", title, "filePath", absPath, "error", err)
		return model.ReferenceImage{}, fmt.Errorf("write reference image file: %w", err)
	}

	ref := model.ReferenceImage{
		ID:           id,
		Title:        title,
		FilePath:     relPath,
		ExerciseMode: "line_work",
		Difficulty:   difficulty,
		Tags:         "",
		CreatedAt:    time.Now(),
	}

	if err := s.repo.Create(ref); err != nil {
		// Clean up the file if DB insert fails
		_ = os.Remove(absPath)
		slog.Error("failed to create reference record", "method", "AddReference", "title", title, "referenceID", id, "error", err)
		return model.ReferenceImage{}, fmt.Errorf("create reference record: %w", err)
	}

	return ref, nil
}

// AddReferenceByFilePath adds a reference by copying an image file from the given path.
// This avoids sending large base64 data through Wails' URL-parameter-based RPC transport.
func (s *ReferenceService) AddReferenceByFilePath(title string, difficulty string, filePath string) (model.ReferenceImage, error) {
	slog.Info("AddReferenceByFilePath called", "title", title, "difficulty", difficulty, "filePath", filePath)

	data, err := os.ReadFile(filePath)
	if err != nil {
		slog.Error("failed to read source file", "method", "AddReferenceByFilePath", "path", filePath, "error", err)
		return model.ReferenceImage{}, fmt.Errorf("read source file: %w", err)
	}

	if len(data) == 0 {
		return model.ReferenceImage{}, fmt.Errorf("file is empty")
	}

	id := uuid.New().String()

	// Determine extension from source file
	ext := filepath.Ext(filePath)
	if ext == "" {
		ext = ".png"
	}

	relPath := filepath.Join("references", id+ext)
	absPath := filepath.Join(s.dataDir, relPath)

	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		slog.Error("failed to create references directory", "method", "AddReferenceByFilePath", "directory", filepath.Dir(absPath), "error", err)
		return model.ReferenceImage{}, fmt.Errorf("create references directory: %w", err)
	}

	if err := os.WriteFile(absPath, data, 0o644); err != nil {
		slog.Error("failed to write reference image file", "method", "AddReferenceByFilePath", "filePath", absPath, "error", err)
		return model.ReferenceImage{}, fmt.Errorf("write reference image file: %w", err)
	}

	ref := model.ReferenceImage{
		ID:           id,
		Title:        title,
		FilePath:     relPath,
		ExerciseMode: "line_work",
		Difficulty:   difficulty,
		Tags:         "",
		CreatedAt:    time.Now(),
	}

	if err := s.repo.Create(ref); err != nil {
		// Clean up the file if DB insert fails
		_ = os.Remove(absPath)
		slog.Error("failed to create reference record", "method", "AddReferenceByFilePath", "title", title, "referenceID", id, "error", err)
		return model.ReferenceImage{}, fmt.Errorf("create reference record: %w", err)
	}

	return ref, nil
}

func (s *ReferenceService) DeleteReference(id string) error {
	ref, err := s.repo.Get(id)
	if err != nil {
		slog.Error("failed to get reference for deletion", "method", "DeleteReference", "referenceID", id, "error", err)
		return fmt.Errorf("get reference for deletion: %w", err)
	}

	absPath := filepath.Join(s.dataDir, ref.FilePath)
	if err := os.Remove(absPath); err != nil && !os.IsNotExist(err) {
		slog.Error("failed to delete reference image file", "method", "DeleteReference", "referenceID", id, "filePath", absPath, "error", err)
		return fmt.Errorf("delete reference image file: %w", err)
	}

	if err := s.repo.Delete(id); err != nil {
		slog.Error("failed to delete reference record", "method", "DeleteReference", "referenceID", id, "error", err)
		return fmt.Errorf("delete reference record: %w", err)
	}

	return nil
}
