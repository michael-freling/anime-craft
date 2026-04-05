package bff

// LineArtExtractor extracts line art from an image.
// The implementation lives in internal/lineart and wraps ONNX Runtime.
type LineArtExtractor interface {
	Extract(pngData []byte) ([]byte, error)
}
