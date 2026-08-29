package drawdoc

import (
	"image"
	"image/color"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func smallSize() Size { return Size{Width: 40, Height: 40} }

func TestRenderLayer_DrawsAStroke(t *testing.T) {
	doc := Materialize([]Operation{
		{Type: OpAddStroke, Stroke: &Stroke{
			ID: "s1", LayerID: "layer-1", Tool: ToolBrush, Color: "#ff0000", Size: 6,
			Points: []float64{5, 20, 35, 20},
		}},
	}, 0)

	img := RenderLayer(doc, "layer-1", smallSize())

	_, _, _, onLine := img.At(20, 20).RGBA()
	assert.Equal(t, uint32(0xffff), onLine, "the stroke should be opaque along its centre")
	r, g, b, _ := img.At(20, 20).RGBA()
	assert.Equal(t, [3]uint32{0xffff, 0, 0}, [3]uint32{r, g, b}, "the stroke should keep its colour")

	_, _, _, offLine := img.At(20, 35).RGBA()
	assert.Equal(t, uint32(0), offLine, "pixels away from the stroke stay transparent")
}

func TestRenderLayer_ASingleTapDrawsADot(t *testing.T) {
	doc := Materialize([]Operation{
		{Type: OpAddStroke, Stroke: &Stroke{
			ID: "s1", LayerID: "layer-1", Tool: ToolBrush, Color: "#000000", Size: 8,
			Points: []float64{20, 20},
		}},
	}, 0)

	img := RenderLayer(doc, "layer-1", smallSize())

	_, _, _, a := img.At(20, 20).RGBA()
	assert.Equal(t, uint32(0xffff), a)
}

func TestRenderLayer_EraserClearsPixels(t *testing.T) {
	doc := Materialize([]Operation{
		{Type: OpAddStroke, Stroke: &Stroke{
			ID: "s1", LayerID: "layer-1", Tool: ToolBrush, Color: "#000000", Size: 8,
			Points: []float64{5, 20, 35, 20},
		}},
		{Type: OpAddStroke, Stroke: &Stroke{
			ID: "s2", LayerID: "layer-1", Tool: ToolEraser, Size: 10,
			Points: []float64{20, 10, 20, 30},
		}},
	}, 1)

	img := RenderLayer(doc, "layer-1", smallSize())

	_, _, _, erased := img.At(20, 20).RGBA()
	assert.Equal(t, uint32(0), erased, "the eraser should clear where it crossed the stroke")

	_, _, _, kept := img.At(7, 20).RGBA()
	assert.Equal(t, uint32(0xffff), kept, "the rest of the stroke should survive")
}

// Strokes are unioned, not accumulated, so a stroke that doubles back over
// itself does not come out darker than one that does not.
func TestRenderLayer_OverlappingSegmentsDoNotDarken(t *testing.T) {
	doubled := RenderLayer(Materialize([]Operation{
		{Type: OpAddStroke, Stroke: &Stroke{
			ID: "s1", LayerID: "layer-1", Tool: ToolBrush, Color: "#808080", Size: 4,
			Points: []float64{5, 20, 35, 20, 5, 20},
		}},
	}, 0), "layer-1", smallSize())

	single := RenderLayer(Materialize([]Operation{
		{Type: OpAddStroke, Stroke: &Stroke{
			ID: "s1", LayerID: "layer-1", Tool: ToolBrush, Color: "#808080", Size: 4,
			Points: []float64{5, 20, 35, 20},
		}},
	}, 0), "layer-1", smallSize())

	assert.Equal(t, single.At(20, 20), doubled.At(20, 20))
}

func TestRenderMerged_HonoursLayerOrderAndVisibility(t *testing.T) {
	hidden := false
	ops := []Operation{
		{Type: OpAddStroke, Stroke: &Stroke{ID: "s1", LayerID: "layer-1", Tool: ToolBrush, Color: "#ff0000", Size: 20, Points: []float64{20, 20}}},
		{Type: OpAddLayer, Layer: &Layer{ID: "layer-2", Name: "Layer 2", Visible: true}},
		{Type: OpAddStroke, Stroke: &Stroke{ID: "s2", LayerID: "layer-2", Tool: ToolBrush, Color: "#0000ff", Size: 20, Points: []float64{20, 20}}},
	}
	doc := Materialize(ops, 2)

	merged := RenderMerged(doc, smallSize(), RenderLayers(doc, smallSize()))

	r, g, b, a := merged.At(20, 20).RGBA()
	assert.Equal(t, [4]uint32{0, 0, 0xffff, 0xffff}, [4]uint32{r, g, b, a}, "the upper layer should paint over the lower one")

	// Untouched pixels are the white the drawing surface shows.
	r, g, b, a = merged.At(2, 2).RGBA()
	assert.Equal(t, [4]uint32{0xffff, 0xffff, 0xffff, 0xffff}, [4]uint32{r, g, b, a})

	// Hiding the upper layer reveals the lower one again.
	hiddenDoc := Materialize(append(ops, Operation{Type: OpSetLayerVisible, LayerID: "layer-2", Visible: &hidden}), 3)
	merged = RenderMerged(hiddenDoc, smallSize(), RenderLayers(hiddenDoc, smallSize()))
	r, g, b, _ = merged.At(20, 20).RGBA()
	assert.Equal(t, [3]uint32{0xffff, 0, 0}, [3]uint32{r, g, b})
}

func TestThumbnail_FitsWithinTheLimit(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 1024, 768))
	for i := 0; i < len(src.Pix); i += 4 {
		src.Pix[i], src.Pix[i+1], src.Pix[i+2], src.Pix[i+3] = 0x20, 0x40, 0x60, 0xff
	}

	thumb := Thumbnail(src, 256)

	assert.Equal(t, 256, thumb.Bounds().Dx())
	assert.Equal(t, 192, thumb.Bounds().Dy())
	assert.Equal(t, color.RGBA{R: 0x20, G: 0x40, B: 0x60, A: 0xff}, thumb.RGBAAt(10, 10))
}

func TestThumbnail_LeavesSmallImagesAlone(t *testing.T) {
	thumb := Thumbnail(image.NewRGBA(image.Rect(0, 0, 100, 50)), 256)

	assert.Equal(t, 100, thumb.Bounds().Dx())
	assert.Equal(t, 50, thumb.Bounds().Dy())
}

func TestParseHexColor(t *testing.T) {
	require.Equal(t, color.RGBA{R: 0xff, G: 0x44, B: 0x33, A: 0xff}, parseHexColor("#ff4433"))
	require.Equal(t, color.RGBA{R: 0xff, G: 0xff, B: 0xff, A: 0xff}, parseHexColor("#fff"))
	// An unusable colour still draws, in black, rather than vanishing.
	require.Equal(t, color.RGBA{A: 0xff}, parseHexColor("rebeccapurple"))
	require.Equal(t, color.RGBA{A: 0xff}, parseHexColor(""))
}
