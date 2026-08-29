package inference

import (
	"bytes"
	"image"
	"image/png"
	"log/slog"
	"math"

	_ "image/gif"  // so a GIF reference can be shrunk rather than sent whole
	_ "image/jpeg" // likewise a photograph, which is the usual large upload
)

// Neither model looks at a large image. The line art extractor bicubic-resizes
// whatever it is given to 512x512 (see inference/.../lineart/extractor.py), and
// the feedback model's processor is capped at 256*28*28 pixels, around 448x448
// (see .../feedback/generator.py). Sending a photograph at full resolution
// therefore spends bandwidth, memory and time on pixels that are thrown away
// before the model sees them — and it was what pushed a request past the size
// limit in the first place.
//
// Shrinking here rather than raising a ceiling is what actually keeps requests
// small: a limit only decides how large an image has to be before it fails,
// while this decides that none of them are large.
//
// The bound is generous on purpose — twice the larger of the two models' input
// sizes — so it cannot cost quality that either model could have used.
const maxImageEdge = 1024

// shrinkForInference returns the image scaled down so neither edge is longer
// than maxImageEdge, re-encoded as PNG.
//
// Anything it cannot make sense of is returned untouched. A format Go does not
// decode is not a reason to fail a request, and the service accepts whatever
// arrives; the worst case is the large message this used to send every time.
func shrinkForInference(imageData []byte) []byte {
	if len(imageData) == 0 {
		return imageData
	}

	src, _, err := image.Decode(bytes.NewReader(imageData))
	if err != nil {
		slog.Debug("image left as it is for inference: could not decode it", "bytes", len(imageData), "error", err)
		return imageData
	}

	bounds := src.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width <= maxImageEdge && height <= maxImageEdge {
		return imageData
	}

	scale := math.Min(float64(maxImageEdge)/float64(width), float64(maxImageEdge)/float64(height))
	dst := boxDownscale(src, max(1, int(math.Round(float64(width)*scale))), max(1, int(math.Round(float64(height)*scale))))

	var buf bytes.Buffer
	if err := png.Encode(&buf, dst); err != nil {
		slog.Warn("image left as it is for inference: could not re-encode it", "error", err)
		return imageData
	}

	slog.Debug("shrank an image for inference",
		"from", image.Pt(width, height), "to", dst.Bounds().Size(),
		"fromBytes", len(imageData), "toBytes", buf.Len())
	return buf.Bytes()
}

// boxDownscale averages each block of source pixels into one. Averaging rather
// than sampling matters at these ratios: dropping pixels from a photograph
// turns fine detail into noise, which is exactly the detail the line art model
// is looking for.
func boxDownscale(src image.Image, width int, height int) *image.RGBA {
	bounds := src.Bounds()
	srcW, srcH := bounds.Dx(), bounds.Dy()
	dst := image.NewRGBA(image.Rect(0, 0, width, height))

	for y := 0; y < height; y++ {
		y0, y1 := y*srcH/height, (y+1)*srcH/height
		if y1 <= y0 {
			y1 = y0 + 1
		}
		for x := 0; x < width; x++ {
			x0, x1 := x*srcW/width, (x+1)*srcW/width
			if x1 <= x0 {
				x1 = x0 + 1
			}

			var r, g, b, a, n uint64
			for sy := y0; sy < y1; sy++ {
				for sx := x0; sx < x1; sx++ {
					sr, sg, sb, sa := src.At(bounds.Min.X+sx, bounds.Min.Y+sy).RGBA()
					r += uint64(sr)
					g += uint64(sg)
					b += uint64(sb)
					a += uint64(sa)
					n++
				}
			}

			i := dst.PixOffset(x, y)
			// RGBA() gives 16-bit values; PNG here is 8-bit per channel.
			dst.Pix[i] = uint8(r / n >> 8)
			dst.Pix[i+1] = uint8(g / n >> 8)
			dst.Pix[i+2] = uint8(b / n >> 8)
			dst.Pix[i+3] = uint8(a / n >> 8)
		}
	}
	return dst
}
