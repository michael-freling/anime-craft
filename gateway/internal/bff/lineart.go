package bff

// LineArtExtractor extracts line art from an image.
// The implementation lives in the Python inference service (ExtractLineArt RPC).
type LineArtExtractor interface {
	Extract(pngData []byte) ([]byte, error)
}
