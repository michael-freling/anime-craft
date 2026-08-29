package drawdoc

import (
	"image"
	"image/color"
	"math"
	"strconv"
	"strings"
)

// Rendering a stroke analytically — coverage from the distance to the
// polyline — reproduces what a canvas draws with round caps and joins,
// without a path stroker or an outside rasteriser. Coverage is accumulated
// into one mask per stroke and composited once, so a stroke that doubles back
// over itself does not darken where it overlaps.

// RenderLayer draws one layer's strokes onto a transparent image.
func RenderLayer(doc Document, layerID string, size Size) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, size.Width, size.Height))
	for _, stroke := range doc.Strokes[layerID] {
		drawStroke(img, stroke)
	}
	return img
}

// RenderLayers draws every layer in the document, keyed by layer id.
func RenderLayers(doc Document, size Size) map[string]*image.RGBA {
	images := make(map[string]*image.RGBA, len(doc.Layers))
	for _, layer := range doc.Layers {
		images[layer.ID] = RenderLayer(doc, layer.ID, size)
	}
	return images
}

// RenderMerged flattens the visible layers onto white, the way the drawing
// looks in the editor. Layers come bottom first, so later ones paint over.
func RenderMerged(doc Document, size Size, layers map[string]*image.RGBA) *image.RGBA {
	merged := image.NewRGBA(image.Rect(0, 0, size.Width, size.Height))
	fill(merged, color.RGBA{R: 0xff, G: 0xff, B: 0xff, A: 0xff})
	for _, layer := range doc.Layers {
		if !layer.Visible {
			continue
		}
		src, ok := layers[layer.ID]
		if !ok {
			continue
		}
		over(merged, src)
	}
	return merged
}

// Thumbnail box-filters an image down to fit a square of max pixels.
// OpenRaster caps thumbnails at 256x256.
func Thumbnail(src *image.RGBA, max int) *image.RGBA {
	bounds := src.Bounds()
	srcW, srcH := bounds.Dx(), bounds.Dy()
	if srcW == 0 || srcH == 0 {
		return image.NewRGBA(image.Rect(0, 0, 1, 1))
	}

	scale := math.Min(float64(max)/float64(srcW), float64(max)/float64(srcH))
	if scale > 1 {
		scale = 1
	}
	dstW := int(math.Max(1, math.Round(float64(srcW)*scale)))
	dstH := int(math.Max(1, math.Round(float64(srcH)*scale)))

	dst := image.NewRGBA(image.Rect(0, 0, dstW, dstH))
	for y := 0; y < dstH; y++ {
		y0, y1 := y*srcH/dstH, (y+1)*srcH/dstH
		if y1 <= y0 {
			y1 = y0 + 1
		}
		for x := 0; x < dstW; x++ {
			x0, x1 := x*srcW/dstW, (x+1)*srcW/dstW
			if x1 <= x0 {
				x1 = x0 + 1
			}
			var r, g, b, a, n int
			for sy := y0; sy < y1; sy++ {
				for sx := x0; sx < x1; sx++ {
					i := src.PixOffset(bounds.Min.X+sx, bounds.Min.Y+sy)
					r += int(src.Pix[i])
					g += int(src.Pix[i+1])
					b += int(src.Pix[i+2])
					a += int(src.Pix[i+3])
					n++
				}
			}
			i := dst.PixOffset(x, y)
			dst.Pix[i] = uint8(r / n)
			dst.Pix[i+1] = uint8(g / n)
			dst.Pix[i+2] = uint8(b / n)
			dst.Pix[i+3] = uint8(a / n)
		}
	}
	return dst
}

func fill(img *image.RGBA, c color.RGBA) {
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i] = c.R
		img.Pix[i+1] = c.G
		img.Pix[i+2] = c.B
		img.Pix[i+3] = c.A
	}
}

// over composites src onto dst, both premultiplied and the same size.
func over(dst, src *image.RGBA) {
	for i := 0; i < len(dst.Pix) && i < len(src.Pix); i += 4 {
		sa := int(src.Pix[i+3])
		if sa == 0 {
			continue
		}
		inv := 255 - sa
		for c := 0; c < 4; c++ {
			dst.Pix[i+c] = uint8(int(src.Pix[i+c]) + int(dst.Pix[i+c])*inv/255)
		}
	}
}

// mask is stroke coverage over a rectangle of the image, 0 to 1 per pixel.
type mask struct {
	x0, y0, w, h int
	a            []float64
}

func drawStroke(img *image.RGBA, stroke Stroke) {
	points := stroke.Points
	if len(points) < 2 {
		return
	}
	half := stroke.Size / 2
	if half < 0.5 {
		half = 0.5
	}

	m := newMask(img.Bounds(), points, half)
	if m == nil {
		return
	}

	// A tap with no drag is a single point: a dot, not a missing stroke.
	if len(points) == 2 {
		m.accumulate(points[0], points[1], points[0], points[1], half)
	}
	for i := 0; i+3 < len(points); i += 2 {
		m.accumulate(points[i], points[i+1], points[i+2], points[i+3], half)
	}

	if stroke.Tool == ToolEraser {
		m.erase(img)
		return
	}
	m.paint(img, parseHexColor(stroke.Color))
}

func newMask(bounds image.Rectangle, points []float64, half float64) *mask {
	minX, minY := math.Inf(1), math.Inf(1)
	maxX, maxY := math.Inf(-1), math.Inf(-1)
	for i := 0; i+1 < len(points); i += 2 {
		minX = math.Min(minX, points[i])
		maxX = math.Max(maxX, points[i])
		minY = math.Min(minY, points[i+1])
		maxY = math.Max(maxY, points[i+1])
	}

	pad := half + 1
	x0 := clampInt(int(math.Floor(minX-pad)), bounds.Min.X, bounds.Max.X)
	y0 := clampInt(int(math.Floor(minY-pad)), bounds.Min.Y, bounds.Max.Y)
	x1 := clampInt(int(math.Ceil(maxX+pad))+1, bounds.Min.X, bounds.Max.X)
	y1 := clampInt(int(math.Ceil(maxY+pad))+1, bounds.Min.Y, bounds.Max.Y)
	if x1 <= x0 || y1 <= y0 {
		return nil
	}
	return &mask{x0: x0, y0: y0, w: x1 - x0, h: y1 - y0, a: make([]float64, (x1-x0)*(y1-y0))}
}

// accumulate unions one segment's coverage into the mask.
func (m *mask) accumulate(ax, ay, bx, by, half float64) {
	pad := half + 1
	x0 := clampInt(int(math.Floor(math.Min(ax, bx)-pad)), m.x0, m.x0+m.w)
	x1 := clampInt(int(math.Ceil(math.Max(ax, bx)+pad))+1, m.x0, m.x0+m.w)
	y0 := clampInt(int(math.Floor(math.Min(ay, by)-pad)), m.y0, m.y0+m.h)
	y1 := clampInt(int(math.Ceil(math.Max(ay, by)+pad))+1, m.y0, m.y0+m.h)

	dx, dy := bx-ax, by-ay
	lengthSquared := dx*dx + dy*dy

	for y := y0; y < y1; y++ {
		row := (y - m.y0) * m.w
		py := float64(y) + 0.5
		for x := x0; x < x1; x++ {
			px := float64(x) + 0.5

			// Distance from the pixel centre to the segment.
			t := 0.0
			if lengthSquared > 0 {
				t = ((px-ax)*dx + (py-ay)*dy) / lengthSquared
				t = math.Max(0, math.Min(1, t))
			}
			ox, oy := px-(ax+t*dx), py-(ay+t*dy)
			distance := math.Sqrt(ox*ox + oy*oy)

			// One pixel of feathering at the edge gives the same soft border
			// a canvas draws.
			coverage := math.Max(0, math.Min(1, half+0.5-distance))
			if coverage == 0 {
				continue
			}
			if i := row + (x - m.x0); coverage > m.a[i] {
				m.a[i] = coverage
			}
		}
	}
}

func (m *mask) paint(img *image.RGBA, c color.RGBA) {
	for y := 0; y < m.h; y++ {
		for x := 0; x < m.w; x++ {
			coverage := m.a[y*m.w+x]
			if coverage == 0 {
				continue
			}
			i := img.PixOffset(m.x0+x, m.y0+y)
			inv := 1 - coverage
			img.Pix[i] = blend(float64(c.R)*coverage, float64(img.Pix[i])*inv)
			img.Pix[i+1] = blend(float64(c.G)*coverage, float64(img.Pix[i+1])*inv)
			img.Pix[i+2] = blend(float64(c.B)*coverage, float64(img.Pix[i+2])*inv)
			img.Pix[i+3] = blend(255*coverage, float64(img.Pix[i+3])*inv)
		}
	}
}

func (m *mask) erase(img *image.RGBA) {
	for y := 0; y < m.h; y++ {
		for x := 0; x < m.w; x++ {
			coverage := m.a[y*m.w+x]
			if coverage == 0 {
				continue
			}
			i := img.PixOffset(m.x0+x, m.y0+y)
			inv := 1 - coverage
			for c := 0; c < 4; c++ {
				img.Pix[i+c] = blend(float64(img.Pix[i+c])*inv, 0)
			}
		}
	}
}

func blend(a, b float64) uint8 {
	v := math.Round(a + b)
	if v < 0 {
		return 0
	}
	if v > 255 {
		return 255
	}
	return uint8(v)
}

func clampInt(v, low, high int) int {
	if v < low {
		return low
	}
	if v > high {
		return high
	}
	return v
}

// parseHexColor understands the "#rrggbb" and "#rgb" forms the editor's
// palette produces, and falls back to black so a typo still draws something.
func parseHexColor(s string) color.RGBA {
	black := color.RGBA{A: 0xff}
	s = strings.TrimPrefix(strings.TrimSpace(s), "#")
	if len(s) == 3 {
		s = string([]byte{s[0], s[0], s[1], s[1], s[2], s[2]})
	}
	if len(s) != 6 {
		return black
	}
	value, err := strconv.ParseUint(s, 16, 32)
	if err != nil {
		return black
	}
	return color.RGBA{R: uint8(value >> 16), G: uint8(value >> 8), B: uint8(value), A: 0xff}
}
