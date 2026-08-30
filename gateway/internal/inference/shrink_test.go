package inference

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testEdge stands in for whatever the service reports; the point of these is
// the scaling, not the number, which is not this side's to choose.
const testEdge = 512

func gradientImage(width int, height int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{
				R: uint8(x * 255 / max(1, width-1)),
				G: uint8(y * 255 / max(1, height-1)),
				B: 0x40,
				A: 0xff,
			})
		}
	}
	return img
}

// noisyImage stands in for a photograph: content that does not compress away,
// so the sizes in these tests are the ones a real upload produces.
func noisyImage(width int, height int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	seed := uint32(987654321)
	for i := 0; i < len(img.Pix); i++ {
		seed = seed*1664525 + 1013904223
		img.Pix[i] = uint8(seed >> 24)
	}
	return img
}

func encodePNG(t *testing.T, img image.Image) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))
	return buf.Bytes()
}

func decode(t *testing.T, data []byte) image.Image {
	t.Helper()
	img, _, err := image.Decode(bytes.NewReader(data))
	require.NoError(t, err)
	return img
}

func TestShrinkToEdge_BringsALargeImageWithinReach(t *testing.T) {
	original := encodePNG(t, gradientImage(4000, 3000))

	shrunk := shrinkToEdge(original, testEdge)

	bounds := decode(t, shrunk).Bounds()
	assert.Equal(t, testEdge, bounds.Dx())
	// 3000 * 512/4000.
	assert.Equal(t, 384, bounds.Dy(), "the proportions are kept")
	assert.Less(t, len(shrunk), len(original))
}

// The point of the change: the request that was being refused becomes one that
// comfortably fits, without a ceiling deciding how large is too large.
// Noisy content, because a photograph is what gets uploaded and what makes a
// PNG large — a smooth gradient this size compresses to under 100KB.
func TestShrinkToEdge_TurnsAnOversizedRequestIntoASmallOne(t *testing.T) {
	original := encodePNG(t, noisyImage(6000, 4000))
	require.Greater(t, len(original), 4*1024*1024)

	shrunk := shrinkToEdge(original, testEdge)

	// Under the 4MB default that refused it, even though this is the worst
	// case for a PNG: noise does not compress, where a photograph does.
	assert.Less(t, len(shrunk), 4*1024*1024)
	assert.Less(t, len(shrunk), len(original)/2)
	bounds := decode(t, shrunk).Bounds()
	assert.LessOrEqual(t, bounds.Dx(), testEdge)
	assert.LessOrEqual(t, bounds.Dy(), testEdge)
}

func TestShrinkToEdge_LeavesSmallImagesAlone(t *testing.T) {
	original := encodePNG(t, gradientImage(400, 300))

	assert.Equal(t, original, shrinkToEdge(original, testEdge), "byte for byte")
}

func TestShrinkToEdge_LeavesImagesAtTheBoundAlone(t *testing.T) {
	original := encodePNG(t, gradientImage(testEdge, testEdge))

	assert.Equal(t, original, shrinkToEdge(original, testEdge))
}

// Until the service has said what it can use, nothing is scaled: guessing a
// size could throw away detail a model wanted.
func TestShrinkToEdge_LeavesEverythingAloneWithoutASize(t *testing.T) {
	original := encodePNG(t, gradientImage(4000, 3000))

	assert.Equal(t, original, shrinkToEdge(original, 0))
	assert.Equal(t, original, shrinkToEdge(original, -1))
}

// A photograph is the usual large upload, and it does not arrive as a PNG.
func TestShrinkToEdge_HandlesAPhotograph(t *testing.T) {
	var buf bytes.Buffer
	require.NoError(t, jpeg.Encode(&buf, gradientImage(3000, 2000), nil))

	shrunk := shrinkToEdge(buf.Bytes(), testEdge)

	bounds := decode(t, shrunk).Bounds()
	assert.Equal(t, testEdge, bounds.Dx())
	// 2000 * 512/3000 rounds to 341.
	assert.Equal(t, 341, bounds.Dy())
}

// Failing a request over a format Go cannot read would be worse than sending
// it; the service has no size limit to refuse it with.
func TestShrinkToEdge_PassesThroughWhatItCannotRead(t *testing.T) {
	opaque := bytes.Repeat([]byte{0x7F}, 4096)

	assert.Equal(t, opaque, shrinkToEdge(opaque, testEdge))
	assert.Empty(t, shrinkToEdge(nil, testEdge))
}

// Averaging keeps what the line art model is looking for. Sampling every nth
// pixel would turn a fine pattern into noise; the average of black and white
// stays mid-grey.
func TestShrinkToEdge_AveragesRatherThanSamples(t *testing.T) {
	striped := image.NewRGBA(image.Rect(0, 0, 2048, 2048))
	for y := 0; y < 2048; y++ {
		for x := 0; x < 2048; x++ {
			shade := uint8(0)
			if x%2 == 0 {
				shade = 255
			}
			striped.Set(x, y, color.RGBA{R: shade, G: shade, B: shade, A: 0xff})
		}
	}

	shrunk := decode(t, shrinkToEdge(encodePNG(t, striped), testEdge))

	r, g, b, _ := shrunk.At(500, 500).RGBA()
	assert.InDelta(t, 0x7fff, r, 0x1000, "black and white average to grey")
	assert.InDelta(t, 0x7fff, g, 0x1000)
	assert.InDelta(t, 0x7fff, b, 0x1000)
}
