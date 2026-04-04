package lineart

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

const (
	// Paths relative to the repository root.
	modelRelPath   = "inference/lineart/anime2sketch.onnx"
	libraryRelPath = "onnxruntime/lib/libonnxruntime.so"
)

// repoRoot walks up from the test file's directory to find the repository root.
func repoRoot(t *testing.T) string {
	t.Helper()

	// The test runs from internal/lineart/, so go up two directories.
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	root := filepath.Join(dir, "..", "..")
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatalf("resolve repo root: %v", err)
	}
	return root
}

// requireFile returns the absolute path if the file exists, otherwise skips
// the test with a descriptive message.
func requireFile(t *testing.T, root, relPath, description string) string {
	t.Helper()
	abs := filepath.Join(root, relPath)
	if _, err := os.Stat(abs); os.IsNotExist(err) {
		t.Skipf("%s not found at %s — skipping integration test", description, abs)
	}
	return abs
}

// createTestPNG generates a simple 100x100 red PNG in memory.
func createTestPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	red := color.RGBA{R: 255, A: 255}
	for y := range 100 {
		for x := range 100 {
			img.Set(x, y, red)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode test PNG: %v", err)
	}
	return buf.Bytes()
}

func TestExtractorExtract(t *testing.T) {
	root := repoRoot(t)

	modelPath := requireFile(t, root, modelRelPath, "ONNX model")
	libraryPath := requireFile(t, root, libraryRelPath, "ONNX Runtime library")

	// Use a synthetic test image so the test has no external file dependency.
	inputPNG := createTestPNG(t)

	// Create the extractor.
	extractor, err := NewExtractor(modelPath, libraryPath)
	if err != nil {
		t.Fatalf("NewExtractor: %v", err)
	}
	defer extractor.Close()

	// Run extraction.
	outputPNG, err := extractor.Extract(inputPNG)
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}

	// Decode the output PNG.
	outImg, err := png.Decode(bytes.NewReader(outputPNG))
	if err != nil {
		t.Fatalf("decode output PNG: %v", err)
	}

	// Verify output dimensions are 512x512.
	bounds := outImg.Bounds()
	if bounds.Dx() != 512 || bounds.Dy() != 512 {
		t.Errorf("expected output 512x512, got %dx%d", bounds.Dx(), bounds.Dy())
	}

	// Verify the output is grayscale. A grayscale PNG decoded by Go's image/png
	// produces an *image.Gray. If re-encoded from an *image.Gray, the decoded
	// color model should be color.GrayModel.
	if outImg.ColorModel() != color.GrayModel {
		t.Errorf("expected grayscale color model, got %T", outImg.ColorModel())
	}

	// Save output to a temp file for visual inspection.
	tmpDir := t.TempDir()
	outPath := filepath.Join(tmpDir, "lineart_output.png")
	if err := os.WriteFile(outPath, outputPNG, 0644); err != nil {
		t.Fatalf("write output PNG: %v", err)
	}
	t.Logf("Output saved to %s", outPath)
}
