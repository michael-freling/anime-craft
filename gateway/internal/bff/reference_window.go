package bff

import (
	"fmt"
	"log/slog"

	"github.com/michael-freling/anime-craft/gateway/internal/repository"
)

// ReferenceWindows shows a reference image in a window of its own, so the
// drawing can have the whole of the main one.
//
// It is an interface because opening a window means talking to the windowing
// toolkit, and every package under internal/ stays free of that — which is what
// lets them be built and tested on a machine with no display. The
// implementation lives beside main, where the toolkit is already a dependency.
type ReferenceWindows interface {
	Open(referenceID string, title string) error
	Close() error
	IsOpen() bool
}

// ReferenceWindowService is what the editor calls to put the reference image
// in its own window and take it back again.
type ReferenceWindowService struct {
	windows ReferenceWindows
	refRepo *repository.ReferenceRepository
}

func NewReferenceWindowService(windows ReferenceWindows, refRepo *repository.ReferenceRepository) *ReferenceWindowService {
	return &ReferenceWindowService{windows: windows, refRepo: refRepo}
}

// OpenReferenceWindow shows the reference in a window of its own, and brings
// that window to the front if it is already open.
func (s *ReferenceWindowService) OpenReferenceWindow(referenceID string) error {
	if s.windows == nil {
		return fmt.Errorf("this build cannot open a second window")
	}

	// The window is titled after the reference, since it may end up on
	// another screen with nothing else to say what it is.
	title := "Reference"
	if s.refRepo != nil {
		if ref, err := s.refRepo.Get(referenceID); err == nil && ref.Title != "" {
			title = ref.Title
		} else if err != nil {
			slog.Warn("could not read the reference title", "method", "OpenReferenceWindow", "referenceID", referenceID, "error", err)
		}
	}

	if err := s.windows.Open(referenceID, title); err != nil {
		slog.Error("failed to open the reference window", "method", "OpenReferenceWindow", "referenceID", referenceID, "error", err)
		return fmt.Errorf("open reference window: %w", err)
	}
	return nil
}

// CloseReferenceWindow puts the reference back in the main window. Closing one
// that is not open is not an error: it is the state the caller asked for.
func (s *ReferenceWindowService) CloseReferenceWindow() error {
	if s.windows == nil {
		return nil
	}
	if err := s.windows.Close(); err != nil {
		slog.Error("failed to close the reference window", "method", "CloseReferenceWindow", "error", err)
		return fmt.Errorf("close reference window: %w", err)
	}
	return nil
}

// IsReferenceWindowOpen lets the editor lay itself out correctly when a
// session is opened while the window is already up.
func (s *ReferenceWindowService) IsReferenceWindowOpen() bool {
	return s.windows != nil && s.windows.IsOpen()
}
