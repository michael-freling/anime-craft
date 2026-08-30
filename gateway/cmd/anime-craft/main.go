package main

import (
	"context"
	"log"
	"os"
	"path/filepath"

	"github.com/adrg/xdg"
	"github.com/michael-freling/anime-craft/frontend"
	"github.com/michael-freling/anime-craft/gateway/internal/bff"
	"github.com/michael-freling/anime-craft/gateway/internal/inference"
	"github.com/michael-freling/anime-craft/gateway/internal/repository"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// defaultInferenceServiceAddr matches the inference service's own default listen
// address (see inference/src/animecraft_inference/config.py), so a locally
// running service is used without any environment setup. Set
// INFERENCE_SERVICE_ADDR to point at a different host or port.
const defaultInferenceServiceAddr = "localhost:50051"

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
	drawingDocRepo := repository.NewDrawingDocumentRepository(db)
	feedbackRepo := repository.NewFeedbackRepository(db)

	// Always create the inference client — gRPC handles reconnection
	// automatically, so the service doesn't need to be ready at startup. If it
	// goes down mid-session, gRPC will reconnect on the next request.
	var lineArtExtractor bff.LineArtExtractor
	var feedbackGenerator bff.FeedbackGenerator
	var imageComparer bff.ImageComparer
	var inferenceClient *inference.Client
	addr := os.Getenv("INFERENCE_SERVICE_ADDR")
	if addr == "" {
		addr = defaultInferenceServiceAddr
	}
	log.Printf("Inference service address: %s", addr)
	client, err := inference.New(context.Background(), addr)
	if err != nil {
		log.Printf("Warning: could not create inference client for %s: %v", addr, err)
	} else {
		inferenceClient = client
		lineArtExtractor = client
		feedbackGenerator = client
		imageComparer = client
		log.Printf("Inference client created for %s (will connect on first request)", addr)
	}

	logService := bff.NewLogService(dataDir)
	referenceWindow := bff.NewReferenceWindowService(&referenceWindows{}, refRepo)

	app := application.New(application.Options{
		Name:        "anime-craft",
		Description: "Anime drawing practice app with AI feedback",
		Services: []application.Service{
			application.NewService(bff.NewSessionService(sessionRepo, feedbackRepo)),
			application.NewService(bff.NewDrawingService(drawingRepo, drawingDocRepo, sessionRepo, refRepo, dataDir)),
			application.NewService(bff.NewFeedbackService(feedbackRepo, sessionRepo, drawingRepo, refRepo, dataDir, lineArtExtractor, feedbackGenerator, imageComparer)),
			application.NewService(bff.NewProgressService()),
			application.NewService(bff.NewReferenceService(refRepo, dataDir)),
			application.NewService(bff.NewSettingsService()),
			application.NewService(referenceWindow),
			application.NewService(logService),
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
