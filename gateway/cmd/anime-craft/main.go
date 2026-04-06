package main

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/adrg/xdg"
	"github.com/michael-freling/anime-craft/frontend"
	"github.com/michael-freling/anime-craft/gateway/internal/ai"
	"github.com/michael-freling/anime-craft/gateway/internal/bff"
	"github.com/michael-freling/anime-craft/gateway/internal/inference"
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

	// Optionally connect to the Python inference service if configured.
	// If INFERENCE_SERVICE_ADDR is set, the gRPC client is used for both
	// line art extraction and feedback generation. The local ONNX extractor
	// remains as fallback for line art.
	var feedbackGenerator bff.FeedbackGenerator
	var inferenceClient *inference.Client
	if addr := os.Getenv("INFERENCE_SERVICE_ADDR"); addr != "" {
		ctx := context.Background()
		client, err := inference.New(ctx, addr)
		if err != nil {
			log.Printf("Warning: could not connect to inference service at %s: %v", addr, err)
		} else {
			// Wait for the service to be ready with a generous timeout.
			// Model loading can take a while; don't block app startup forever.
			if err := client.WaitReady(ctx, 120*time.Second); err != nil {
				log.Printf("Warning: inference service at %s not ready: %v (continuing without it)", addr, err)
				_ = client.Close()
			} else {
				inferenceClient = client
				feedbackGenerator = client
				// If we have the inference client, also use it for line art
				// extraction (overrides local ONNX).
				lineArtExtractor = client
				log.Printf("Inference service connected at %s", addr)
			}
		}
	}

	app := application.New(application.Options{
		Name:        "anime-craft",
		Description: "Anime drawing practice app with AI feedback",
		Services: []application.Service{
			application.NewService(bff.NewSessionService(sessionRepo)),
			application.NewService(bff.NewDrawingService(drawingRepo, dataDir)),
			application.NewService(bff.NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, aiClient, dataDir, lineArtExtractor, feedbackGenerator)),
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

	// Clean up inference client on shutdown.
	if inferenceClient != nil {
		_ = inferenceClient.Close()
	}

	if err != nil {
		log.Fatal(err)
	}
}
