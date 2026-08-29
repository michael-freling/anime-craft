package drawdoc

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"image"
	"image/png"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// Drawings are saved as OpenRaster (.ora) — the interchange format Krita,
// MyPaint, GIMP and Drawpile all read. It is a ZIP holding one PNG per layer,
// a stack.xml describing the stack, a flattened mergedimage.png and a
// thumbnail, so a saved practice drawing opens in a real art program with its
// layers intact.
//
// The spec lets a file carry extra members that other readers ignore, which is
// where the part OpenRaster has no notion of goes: animecraft/scene.json holds
// the vector operation log, the undo cursor and the session metadata, and
// animecraft/reference.* embeds the reference image the drawing was practised
// from. That combination is what lets a file resume as an editable session
// rather than a flattened picture.
const (
	oraMimeType    = "image/openraster"
	oraVersion     = "0.0.3"
	sceneEntry     = "animecraft/scene.json"
	referenceDir   = "animecraft/"
	mergedEntry    = "mergedimage.png"
	thumbnailEntry = "Thumbnails/thumbnail.png"
	thumbnailMax   = 256
)

// ErrNotOpenRaster reports a file that is not an OpenRaster archive.
var ErrNotOpenRaster = errors.New("not an OpenRaster file")

// ErrNoScene reports a valid OpenRaster file that carries no vector data —
// a drawing exported by another program. Its pixels are readable but it
// cannot be resumed as an editable session.
var ErrNoScene = errors.New("OpenRaster file has no Anime Craft drawing data")

// EmbeddedFile is a byte payload stored inside the container under its own
// name, used for the reference image.
type EmbeddedFile struct {
	Name string
	Data []byte
}

type oraImage struct {
	XMLName xml.Name `xml:"image"`
	Version string   `xml:"version,attr"`
	Width   int      `xml:"w,attr"`
	Height  int      `xml:"h,attr"`
	XRes    int      `xml:"xres,attr,omitempty"`
	YRes    int      `xml:"yres,attr,omitempty"`
	Stack   oraStack `xml:"stack"`
}

type oraStack struct {
	Layers []oraLayer `xml:"layer"`
}

type oraLayer struct {
	Name        string `xml:"name,attr"`
	Src         string `xml:"src,attr"`
	X           int    `xml:"x,attr"`
	Y           int    `xml:"y,attr"`
	Opacity     string `xml:"opacity,attr"`
	Visibility  string `xml:"visibility,attr"`
	CompositeOp string `xml:"composite-op,attr"`
}

// WriteORA renders the scene and writes it as an OpenRaster file, replacing
// whatever was at the path before.
func WriteORA(destPath string, scene *Scene, reference *EmbeddedFile) error {
	scene.normalise()
	if reference != nil && scene.Reference != nil {
		scene.Reference.Src = referenceDir + reference.Name
	}

	doc := scene.Materialize()
	size := scene.Document
	layerImages := RenderLayers(doc, size)
	merged := RenderMerged(doc, size, layerImages)

	var buf bytes.Buffer
	writer := zip.NewWriter(&buf)

	// The spec requires mimetype first and stored uncompressed, so the type
	// can be sniffed from the archive's first bytes.
	mimetype, err := writer.CreateHeader(&zip.FileHeader{Name: "mimetype", Method: zip.Store})
	if err != nil {
		return fmt.Errorf("create mimetype entry: %w", err)
	}
	if _, err := mimetype.Write([]byte(oraMimeType)); err != nil {
		return fmt.Errorf("write mimetype: %w", err)
	}

	stack := oraImage{
		Version: oraVersion,
		Width:   size.Width,
		Height:  size.Height,
		XRes:    72,
		YRes:    72,
	}
	// OpenRaster lists the topmost layer first; the document keeps them
	// bottom first, the order they are painted in.
	for i := len(doc.Layers) - 1; i >= 0; i-- {
		layer := doc.Layers[i]
		src := fmt.Sprintf("data/%03d.png", i)
		visibility := "visible"
		if !layer.Visible {
			visibility = "hidden"
		}
		stack.Stack.Layers = append(stack.Stack.Layers, oraLayer{
			Name:        layer.Name,
			Src:         src,
			Opacity:     "1.0",
			Visibility:  visibility,
			CompositeOp: "svg:src-over",
		})
		if err := writePNGEntry(writer, src, layerImages[layer.ID]); err != nil {
			return err
		}
	}

	stackXML, err := xml.MarshalIndent(stack, "", "  ")
	if err != nil {
		return fmt.Errorf("encode stack.xml: %w", err)
	}
	if err := writeEntry(writer, "stack.xml", append([]byte(xml.Header), stackXML...)); err != nil {
		return err
	}

	if err := writePNGEntry(writer, mergedEntry, merged); err != nil {
		return err
	}
	if err := writePNGEntry(writer, thumbnailEntry, Thumbnail(merged, thumbnailMax)); err != nil {
		return err
	}

	sceneJSON, err := json.Marshal(scene)
	if err != nil {
		return fmt.Errorf("encode scene: %w", err)
	}
	if err := writeEntry(writer, sceneEntry, sceneJSON); err != nil {
		return err
	}

	if reference != nil {
		if err := writeEntry(writer, referenceDir+reference.Name, reference.Data); err != nil {
			return err
		}
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf("finish OpenRaster archive: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return fmt.Errorf("create drawing directory: %w", err)
	}
	return writeFileAtomic(destPath, buf.Bytes())
}

// ORAFile is what a saved drawing yields when opened: the editable scene plus
// the reference image travelling with it.
type ORAFile struct {
	Scene     *Scene
	Reference *EmbeddedFile
}

// OpenORA reads a saved drawing, including the embedded reference image.
func OpenORA(srcPath string) (*ORAFile, error) {
	reader, err := zip.OpenReader(srcPath)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrNotOpenRaster, srcPath)
	}
	defer func() { _ = reader.Close() }()

	entries := map[string]*zip.File{}
	for _, file := range reader.File {
		entries[file.Name] = file
	}

	mimetype, err := readEntry(entries["mimetype"])
	if err != nil || strings.TrimSpace(string(mimetype)) != oraMimeType {
		return nil, ErrNotOpenRaster
	}

	sceneData, err := readEntry(entries[sceneEntry])
	if err != nil {
		return nil, ErrNoScene
	}
	scene, err := decodeScene(sceneData)
	if err != nil {
		return nil, err
	}

	result := &ORAFile{Scene: scene}
	if scene.Reference != nil && scene.Reference.Src != "" {
		if data, err := readEntry(entries[scene.Reference.Src]); err == nil {
			result.Reference = &EmbeddedFile{Name: path.Base(scene.Reference.Src), Data: data}
		}
	}
	return result, nil
}

// ReadORA returns just the editable scene from a saved drawing.
func ReadORA(srcPath string) (*Scene, error) {
	file, err := OpenORA(srcPath)
	if err != nil {
		return nil, err
	}
	return file.Scene, nil
}

func readEntry(file *zip.File) ([]byte, error) {
	if file == nil {
		return nil, os.ErrNotExist
	}
	reader, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", file.Name, err)
	}
	defer func() { _ = reader.Close() }()
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", file.Name, err)
	}
	return data, nil
}

func writeEntry(writer *zip.Writer, name string, data []byte) error {
	entry, err := writer.Create(name)
	if err != nil {
		return fmt.Errorf("create %s entry: %w", name, err)
	}
	if _, err := entry.Write(data); err != nil {
		return fmt.Errorf("write %s: %w", name, err)
	}
	return nil
}

func writePNGEntry(writer *zip.Writer, name string, img image.Image) error {
	if img == nil {
		return nil
	}
	// PNG already deflates its own data, so storing it avoids a second,
	// pointless compression pass over every layer.
	entry, err := writer.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Store})
	if err != nil {
		return fmt.Errorf("create %s entry: %w", name, err)
	}
	encoder := png.Encoder{CompressionLevel: png.DefaultCompression}
	if err := encoder.Encode(entry, img); err != nil {
		return fmt.Errorf("encode %s: %w", name, err)
	}
	return nil
}
