package bff

import "context"

// ImageComparer generates comparison heatmaps between a reference and drawing.
// The implementation lives in the Python inference service (CompareImages RPC).
type ImageComparer interface {
	CompareImages(ctx context.Context, referenceLineArt []byte, drawingPNG []byte) ([]byte, error)
}
