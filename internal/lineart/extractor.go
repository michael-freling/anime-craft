package lineart

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"

	ort "github.com/yalue/onnxruntime_go"
)

// Extractor wraps the ONNX Runtime session for line art extraction.
type Extractor struct {
	modelPath string
}

// NewExtractor loads the ONNX model. modelPath is the path to the .onnx file,
// libraryPath is the path to the ONNX Runtime shared library.
//
// The ONNX Runtime environment is initialized once globally. If it has already
// been initialized, the library path setting is skipped.
func NewExtractor(modelPath string, libraryPath string) (*Extractor, error) {
	if !ort.IsInitialized() {
		ort.SetSharedLibraryPath(libraryPath)
		if err := ort.InitializeEnvironment(); err != nil {
			return nil, fmt.Errorf("initialize ONNX Runtime environment: %w", err)
		}
	}

	return &Extractor{
		modelPath: modelPath,
	}, nil
}

// Extract takes raw PNG bytes and returns grayscale line art PNG bytes.
//
// The input PNG is decoded and its pixels are rearranged into CHW layout
// as a [1, 3, H, W] uint8 tensor. The ONNX model handles all preprocessing
// (resize, normalize) and postprocessing (denormalize, clamp) internally.
// The output is a [1, 1, 512, 512] uint8 grayscale tensor which is encoded
// back to PNG.
func (e *Extractor) Extract(pngData []byte) ([]byte, error) {
	// Decode PNG from bytes.
	img, err := png.Decode(bytes.NewReader(pngData))
	if err != nil {
		return nil, fmt.Errorf("decode PNG: %w", err)
	}

	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()

	// Convert image pixels to [1, 3, H, W] uint8 flat array (CHW layout).
	inputData := make([]uint8, 3*h*w)
	for y := range h {
		for x := range w {
			r, g, b, _ := img.At(bounds.Min.X+x, bounds.Min.Y+y).RGBA()
			inputData[0*h*w+y*w+x] = uint8(r >> 8)
			inputData[1*h*w+y*w+x] = uint8(g >> 8)
			inputData[2*h*w+y*w+x] = uint8(b >> 8)
		}
	}

	// Create input tensor.
	inputShape := ort.NewShape(1, 3, int64(h), int64(w))
	inputTensor, err := ort.NewTensor(inputShape, inputData)
	if err != nil {
		return nil, fmt.Errorf("create input tensor: %w", err)
	}
	defer inputTensor.Destroy()

	// Create output tensor (model outputs [1, 1, 512, 512]).
	outputShape := ort.NewShape(1, 1, 512, 512)
	outputTensor, err := ort.NewEmptyTensor[uint8](outputShape)
	if err != nil {
		return nil, fmt.Errorf("create output tensor: %w", err)
	}
	defer outputTensor.Destroy()

	// Create and run ONNX session.
	session, err := ort.NewAdvancedSession(
		e.modelPath,
		[]string{"input"},
		[]string{"output"},
		[]ort.Value{inputTensor},
		[]ort.Value{outputTensor},
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("create ONNX session: %w", err)
	}
	defer session.Destroy()

	if err := session.Run(); err != nil {
		return nil, fmt.Errorf("run inference: %w", err)
	}

	// Convert output [1, 1, 512, 512] uint8 to grayscale PNG.
	outData := outputTensor.GetData()
	outImg := image.NewGray(image.Rect(0, 0, 512, 512))
	for y := range 512 {
		for x := range 512 {
			outImg.SetGray(x, y, color.Gray{Y: outData[y*512+x]})
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, outImg); err != nil {
		return nil, fmt.Errorf("encode output PNG: %w", err)
	}

	return buf.Bytes(), nil
}

// Close releases ONNX Runtime resources by destroying the global environment.
// After calling Close, no further Extract calls should be made on any Extractor
// instance unless a new Extractor is created (which will re-initialize the
// environment).
func (e *Extractor) Close() {
	_ = ort.DestroyEnvironment()
}
