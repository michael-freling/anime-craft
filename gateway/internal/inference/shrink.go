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

// Both models resize whatever they are given, so an image larger than they use
// costs bandwidth, memory and time on pixels that are discarded before either
// of them sees it — and that was what pushed a request past gRPC's old size
// limit.
//
// How large that is belongs to the service, not here. It reports the figure in
// its health check (HealthCheckResponse.max_image_edge), derived from the
// models themselves, so reconfiguring or replacing one moves the number with
// it. A constant here would be a guess about somebody else's models, and would
// go on being the same guess after they changed.
//
// Until the service has said, nothing is shrunk: sending an image whole is
// wasteful, but guessing a size could throw away detail a model wanted.

// shrinkToEdge returns the image scaled down so neither edge is longer than
// maxEdge, re-encoded as PNG.
//
// A maxEdge of zero means the service has not said what it can use, and the
// image is returned untouched. So is anything that cannot be decoded: a format
// Go does not read is not a reason to fail a request, and the service accepts
// whatever arrives.
func shrinkToEdge(imageData []byte, maxEdge int) []byte {
	if len(imageData) == 0 || maxEdge <= 0 {
		return imageData
	}

	src, _, err := image.Decode(bytes.NewReader(imageData))
	if err != nil {
		slog.Debug("image left as it is: could not decode it", "bytes", len(imageData), "error", err)
		return imageData
	}

	bounds := src.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width <= maxEdge && height <= maxEdge {
		return imageData
	}

	scale := math.Min(float64(maxEdge)/float64(width), float64(maxEdge)/float64(height))
	dst := boxDownscale(src, max(1, int(math.Round(float64(width)*scale))), max(1, int(math.Round(float64(height)*scale))))

	var buf bytes.Buffer
	if err := png.Encode(&buf, dst); err != nil {
		slog.Warn("image left as it is: could not re-encode it", "error", err)
		return imageData
	}

	slog.Debug("shrank an image to what the service asked for",
		"from", image.Pt(width, height), "to", dst.Bounds().Size(), "maxEdge", maxEdge,
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
