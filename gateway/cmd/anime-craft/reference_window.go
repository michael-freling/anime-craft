package main

import (
	"log/slog"
	"net/url"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// ReferenceWindowClosedEvent tells the editor the reference window has gone,
// so it can put the reference back in the main window. Closing that window
// from its own title bar has to reach the editor somehow, and it is the only
// state change the editor cannot see for itself.
const ReferenceWindowClosedEvent = "reference-window:closed"

// referenceWindows is the toolkit half of bff.ReferenceWindows. It lives here
// rather than under internal/ so that everything there stays buildable and
// testable without a windowing toolkit.
type referenceWindows struct {
	mu     sync.Mutex
	window *application.WebviewWindow
}

// Open shows the reference in its own window, or raises the one already up.
//
// The window loads the same frontend with a query string rather than a path,
// because the asset server serves files and answers anything it does not
// recognise with a 404 — a client-side route would never reach the app. The
// query is left alone, so "/" is served and the app reads what to show from it.
func (r *referenceWindows) Open(referenceID string, title string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.window != nil {
		r.window.Focus()
		return nil
	}

	target := "/?window=reference&referenceId=" + url.QueryEscape(referenceID)
	window := application.Get().Window.NewWithOptions(application.WebviewWindowOptions{
		Name:  "reference",
		Title: title,
		Width: 520, Height: 720,
		MinWidth: 240, MinHeight: 240,
		// A reference is for looking at while drawing in another window, so it
		// is no use behind that one.
		AlwaysOnTop:      true,
		URL:              target,
		BackgroundColour: application.NewRGB(27, 38, 54),
	})

	window.OnWindowEvent(events.Common.WindowClosing, func(*application.WindowEvent) {
		r.forget()
		application.Get().Event.Emit(ReferenceWindowClosedEvent)
	})

	r.window = window
	slog.Info("opened the reference in its own window", "referenceID", referenceID, "title", title)
	return nil
}

// Close takes the window down. Closing one that is not open is not an error:
// it is the state the caller asked for.
func (r *referenceWindows) Close() error {
	r.mu.Lock()
	window := r.window
	r.window = nil
	r.mu.Unlock()

	if window == nil {
		return nil
	}
	// Close raises WindowClosing, so the handler above announces this too and
	// the editor does not need telling twice.
	window.Close()
	return nil
}

func (r *referenceWindows) IsOpen() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.window != nil
}

func (r *referenceWindows) forget() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.window = nil
}
