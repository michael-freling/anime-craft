package bff

import (
	"context"

	pb "github.com/michael-freling/anime-craft/gateway/internal/inference/pb"
)

// FeedbackGenerator generates structured drawing feedback via the inference
// service (VLM). Implementations must be safe for concurrent use.
type FeedbackGenerator interface {
	GenerateFeedback(ctx context.Context, referenceLineArt []byte, drawingPNG []byte, exerciseMode string) (*pb.FeedbackResult, error)
}
