package bff

import (
	"encoding/base64"
	"encoding/json"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAddReference_Base64DataExceedsURLLimit(t *testing.T) {
	// Simulate what Wails does: put all args into a URL query parameter.
	// A typical image (100KB) produces ~133KB of base64.
	// After URL-encoding the JSON wrapper, the URL exceeds Go's default header limit.

	// Create realistic base64 data (100KB image)
	imageData := make([]byte, 100*1024) // 100KB
	for i := range imageData {
		imageData[i] = byte(i % 256)
	}
	base64Data := base64.StdEncoding.EncodeToString(imageData)

	// Simulate Wails URL construction
	callArgs := map[string]any{
		"call-id":  "test-id",
		"methodID": 980217922,
		"args":     []string{"title", "beginner", base64Data},
	}
	argsJSON, err := json.Marshal(callArgs)
	assert.NoError(t, err)

	params := url.Values{}
	params.Set("object", "0")
	params.Set("method", "0")
	params.Set("args", string(argsJSON))

	fullURL := "http://localhost:0/wails/runtime?" + params.Encode()

	// Demonstrate the URL is unreasonably large.
	// Go's default MaxHeaderBytes is 1MB (1<<20 = 1048576).
	// Even a 100KB image creates URLs well beyond reasonable HTTP limits.
	t.Logf("Base64 data length: %d bytes", len(base64Data))
	t.Logf("Full URL length: %d bytes", len(fullURL))

	// A 100KB image produces a URL far too long for URL query parameters.
	// HTTP servers typically limit URLs to 8KB-64KB, Go defaults to 1MB for all headers.
	assert.Greater(t, len(fullURL), 8*1024,
		"URL with base64 image data exceeds typical 8KB URL limit - this is why Wails returns 'missing object value'")
	assert.Greater(t, len(base64Data), 50*1024,
		"Even moderate images produce base64 data too large for URL parameters")
}
