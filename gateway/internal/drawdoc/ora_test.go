package drawdoc

import (
	"archive/zip"
	"encoding/xml"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func sampleScene() *Scene {
	scene := NewScene()
	scene.Document = Size{Width: 64, Height: 48}
	scene.Tool = &ToolState{Tool: ToolBrush, BrushSize: 5, BrushColor: "#2196f3"}
	scene.ActiveLayerID = "layer-2"
	scene.Reference = &ReferenceInfo{ID: "ref-001", Title: "Simple Face", Difficulty: "beginner"}
	scene.Operations = []Operation{
		stroke("s1", "layer-1", 5, 5, 55, 40),
		addLayer("layer-2", "Layer 2"),
		stroke("s2", "layer-2", 10, 40, 50, 10),
		stroke("s3", "layer-2", 12, 12, 20, 20),
	}
	// The last stroke was undone: it stays in the file as the redo stack.
	scene.Cursor = 2
	return scene
}

func writeSample(t *testing.T, reference *EmbeddedFile) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "document.ora")
	require.NoError(t, WriteORA(path, sampleScene(), reference))
	return path
}

func entries(t *testing.T, path string) map[string][]byte {
	t.Helper()
	reader, err := zip.OpenReader(path)
	require.NoError(t, err)
	defer func() { _ = reader.Close() }()

	found := map[string][]byte{}
	for _, file := range reader.File {
		f, err := file.Open()
		require.NoError(t, err)
		data, err := io.ReadAll(f)
		require.NoError(t, err)
		_ = f.Close()
		found[file.Name] = data
	}
	return found
}

// The spec requires an uncompressed "mimetype" first so the format can be
// sniffed from the archive's opening bytes.
func TestWriteORA_MimetypeIsFirstAndStored(t *testing.T) {
	path := writeSample(t, nil)

	reader, err := zip.OpenReader(path)
	require.NoError(t, err)
	defer func() { _ = reader.Close() }()

	require.NotEmpty(t, reader.File)
	assert.Equal(t, "mimetype", reader.File[0].Name)
	assert.Equal(t, uint16(zip.Store), reader.File[0].Method)

	raw, err := os.ReadFile(path)
	require.NoError(t, err)
	assert.Contains(t, string(raw[:60]), "image/openraster")
}

func TestWriteORA_HasTheEntriesOtherAppsExpect(t *testing.T) {
	found := entries(t, writeSample(t, nil))

	for _, name := range []string{"mimetype", "stack.xml", "mergedimage.png", "Thumbnails/thumbnail.png", "data/000.png", "data/001.png", sceneEntry} {
		assert.Contains(t, found, name)
	}
}

// OpenRaster lists the topmost layer first; the document keeps them bottom
// first, the order they are painted in.
func TestWriteORA_StackListsTopLayerFirst(t *testing.T) {
	found := entries(t, writeSample(t, nil))

	var image oraImage
	require.NoError(t, xml.Unmarshal(found["stack.xml"], &image))

	assert.Equal(t, 64, image.Width)
	assert.Equal(t, 48, image.Height)
	require.Len(t, image.Stack.Layers, 2)
	assert.Equal(t, "Layer 2", image.Stack.Layers[0].Name)
	assert.Equal(t, "data/001.png", image.Stack.Layers[0].Src)
	assert.Equal(t, "Layer 1", image.Stack.Layers[1].Name)
	assert.Equal(t, "visible", image.Stack.Layers[1].Visibility)
	assert.Equal(t, "svg:src-over", image.Stack.Layers[1].CompositeOp)
}

func TestWriteORA_HidesLayersTheArtistTurnedOff(t *testing.T) {
	scene := sampleScene()
	hidden := false
	scene.Operations = append(scene.Operations[:scene.Cursor+1],
		Operation{Type: OpSetLayerVisible, LayerID: "layer-2", Visible: &hidden})
	scene.Cursor = len(scene.Operations) - 1

	path := filepath.Join(t.TempDir(), "document.ora")
	require.NoError(t, WriteORA(path, scene, nil))

	var image oraImage
	require.NoError(t, xml.Unmarshal(entries(t, path)["stack.xml"], &image))
	assert.Equal(t, "hidden", image.Stack.Layers[0].Visibility)
}

// The point of the format: what comes back out is the drawing that went in,
// vectors and undo position included.
func TestORA_RoundTripsTheScene(t *testing.T) {
	restored, err := ReadORA(writeSample(t, nil))
	require.NoError(t, err)

	assert.Equal(t, SceneVersion, restored.Version)
	assert.Equal(t, Size{Width: 64, Height: 48}, restored.Document)
	assert.Equal(t, "layer-2", restored.ActiveLayerID)
	assert.Equal(t, 2, restored.Cursor)
	require.Len(t, restored.Operations, 4, "the undone stroke should still be there to redo")

	doc := restored.Materialize()
	assert.Equal(t, []string{"layer-1", "layer-2"}, layerIDs(doc))
	assert.Len(t, doc.Strokes["layer-1"], 1)
	require.Len(t, doc.Strokes["layer-2"], 1)
	assert.Equal(t, []float64{10, 40, 50, 10}, doc.Strokes["layer-2"][0].Points)
	require.NotNil(t, restored.Tool)
	assert.Equal(t, "#2196f3", restored.Tool.BrushColor)
}

// A saved drawing carries its reference image, so it can be picked up on a
// machine that has never seen the original session.
func TestORA_CarriesTheReferenceImage(t *testing.T) {
	reference := &EmbeddedFile{Name: "reference.png", Data: []byte("pretend-png-bytes")}
	path := writeSample(t, reference)

	assert.Contains(t, entries(t, path), "animecraft/reference.png")

	file, err := OpenORA(path)
	require.NoError(t, err)
	require.NotNil(t, file.Reference)
	assert.Equal(t, "reference.png", file.Reference.Name)
	assert.Equal(t, []byte("pretend-png-bytes"), file.Reference.Data)
	require.NotNil(t, file.Scene.Reference)
	assert.Equal(t, "ref-001", file.Scene.Reference.ID)
	assert.Equal(t, "animecraft/reference.png", file.Scene.Reference.Src)
}

func TestOpenORA_RejectsFilesThatAreNotOpenRaster(t *testing.T) {
	path := filepath.Join(t.TempDir(), "notes.txt")
	require.NoError(t, os.WriteFile(path, []byte("not a zip"), 0o644))

	_, err := OpenORA(path)
	assert.ErrorIs(t, err, ErrNotOpenRaster)
}

// A drawing exported by Krita or MyPaint is a valid OpenRaster file with no
// vector data, so it cannot be resumed as an editable session.
func TestOpenORA_ReportsAForeignOpenRasterFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "foreign.ora")
	file, err := os.Create(path)
	require.NoError(t, err)
	writer := zip.NewWriter(file)
	mimetype, err := writer.CreateHeader(&zip.FileHeader{Name: "mimetype", Method: zip.Store})
	require.NoError(t, err)
	_, err = mimetype.Write([]byte(oraMimeType))
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	require.NoError(t, file.Close())

	_, err = OpenORA(path)
	assert.ErrorIs(t, err, ErrNoScene)
}
