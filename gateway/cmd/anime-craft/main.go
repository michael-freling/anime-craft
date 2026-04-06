package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/adrg/xdg"
	"github.com/michael-freling/anime-craft/frontend"
	"github.com/michael-freling/anime-craft/gateway/internal/ai"
	"github.com/michael-freling/anime-craft/gateway/internal/bff"
	"github.com/michael-freling/anime-craft/gateway/internal/repository"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func main() {
	dataDir := filepath.Join(xdg.DataHome, "anime-craft")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatal(err)
	}
	dbPath := filepath.Join(dataDir, "anime-craft.db")
	db, err := repository.NewDB(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	if err := db.RunMigrations(); err != nil {
		log.Fatal(err)
	}

	refRepo := repository.NewReferenceRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	drawingRepo := repository.NewDrawingRepository(db)
	feedbackRepo := repository.NewFeedbackRepository(db)

	aiClient := ai.NewMockFeedbackClient()
	lineArtExtractor := initLineArtExtractor()

	app := application.New(application.Options{
		Name:        "anime-craft",
		Description: "Anime drawing practice app with AI feedback",
		Services: []application.Service{
			application.NewService(bff.NewSessionService(sessionRepo)),
			application.NewService(bff.NewDrawingService(drawingRepo, dataDir)),
			application.NewService(bff.NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, aiClient, dataDir, lineArtExtractor)),
			application.NewService(bff.NewProgressService()),
			application.NewService(bff.NewReferenceService(refRepo, dataDir)),
			application.NewService(bff.NewSettingsService()),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(frontend.Assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title: "Anime Craft",
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
	})

	err = app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
