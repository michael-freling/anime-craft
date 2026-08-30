package drawdoc

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func stroke(id, layerID string, points ...float64) Operation {
	return Operation{Type: OpAddStroke, Stroke: &Stroke{
		ID: id, LayerID: layerID, Tool: ToolBrush, Color: "#000000", Size: 2, Points: points,
	}}
}

func addLayer(id, name string) Operation {
	return Operation{Type: OpAddLayer, Layer: &Layer{ID: id, Name: name, Visible: true}}
}

func TestMaterialize_StartsWithOneLayer(t *testing.T) {
	doc := Materialize(nil, -1)

	require.Len(t, doc.Layers, 1)
	assert.Equal(t, "layer-1", doc.Layers[0].ID)
	assert.True(t, doc.Layers[0].Visible)
	assert.Empty(t, doc.Strokes)
}

func TestMaterialize_AppliesOperationsInOrder(t *testing.T) {
	ops := []Operation{
		stroke("s1", "layer-1", 0, 0, 10, 10),
		addLayer("layer-2", "Layer 2"),
		stroke("s2", "layer-2", 5, 5, 20, 20),
	}

	doc := Materialize(ops, len(ops)-1)

	assert.Equal(t, []string{"layer-1", "layer-2"}, layerIDs(doc))
	assert.Len(t, doc.Strokes["layer-1"], 1)
	assert.Equal(t, "s2", doc.Strokes["layer-2"][0].ID)
}

// The cursor is what makes undo survive a restart: everything past it is the
// redo stack, kept in the file but left out of the drawing.
func TestMaterialize_StopsAtCursor(t *testing.T) {
	ops := []Operation{
		stroke("s1", "layer-1", 0, 0, 1, 1),
		stroke("s2", "layer-1", 2, 2, 3, 3),
		stroke("s3", "layer-1", 4, 4, 5, 5),
	}

	doc := Materialize(ops, 0)

	require.Len(t, doc.Strokes["layer-1"], 1)
	assert.Equal(t, "s1", doc.Strokes["layer-1"][0].ID)

	assert.Len(t, Materialize(ops, -1).Strokes["layer-1"], 0)
	assert.Len(t, Materialize(ops, 2).Strokes["layer-1"], 3)
}

func TestMaterialize_RemovingALayerDropsItsStrokes(t *testing.T) {
	ops := []Operation{
		addLayer("layer-2", "Layer 2"),
		stroke("s1", "layer-2", 0, 0, 1, 1),
		{Type: OpRemoveLayer, LayerID: "layer-2"},
	}

	doc := Materialize(ops, 2)

	assert.Equal(t, []string{"layer-1"}, layerIDs(doc))
	assert.Empty(t, doc.Strokes["layer-2"])

	// Undoing the removal brings the layer back with its artwork, because the
	// log still holds the strokes that made it.
	restored := Materialize(ops, 1)
	assert.Equal(t, []string{"layer-1", "layer-2"}, layerIDs(restored))
	assert.Len(t, restored.Strokes["layer-2"], 1)
}

func TestMaterialize_KeepsTheLastLayer(t *testing.T) {
	doc := Materialize([]Operation{{Type: OpRemoveLayer, LayerID: "layer-1"}}, 0)

	assert.Equal(t, []string{"layer-1"}, layerIDs(doc))
}

func TestMaterialize_ReordersAndHidesLayers(t *testing.T) {
	hidden := false
	toIndex := 0
	ops := []Operation{
		addLayer("layer-2", "Layer 2"),
		{Type: OpMoveLayer, LayerID: "layer-2", ToIndex: &toIndex},
		{Type: OpSetLayerVisible, LayerID: "layer-1", Visible: &hidden},
	}

	doc := Materialize(ops, 2)

	assert.Equal(t, []string{"layer-2", "layer-1"}, layerIDs(doc))
	assert.False(t, doc.Layers[1].Visible)
}

func TestMaterialize_IgnoresOperationsForMissingLayers(t *testing.T) {
	toIndex := 5
	ops := []Operation{
		stroke("s1", "layer-9", 0, 0, 1, 1),
		{Type: OpRemoveLayer, LayerID: "layer-9"},
		{Type: OpMoveLayer, LayerID: "layer-1", ToIndex: &toIndex},
	}

	doc := Materialize(ops, 2)

	assert.Equal(t, []string{"layer-1"}, layerIDs(doc))
	assert.Empty(t, doc.Strokes["layer-9"])
}

// A log written by a newer version must survive a round trip through an older
// one, so unrecognised fields are re-emitted rather than dropped.
func TestOperation_PreservesUnknownFields(t *testing.T) {
	source := []byte(`{"type":"add_stroke","stroke":{"id":"s1","layerId":"layer-1","tool":"brush","color":"#000000","size":2,"points":[1,2]},"pressure":[0.5]}`)

	var op Operation
	require.NoError(t, json.Unmarshal(source, &op))
	assert.Equal(t, OpAddStroke, op.Type)

	encoded, err := json.Marshal(op)
	require.NoError(t, err)
	assert.JSONEq(t, string(source), string(encoded))
}

func TestDecodeScene_RejectsNewerVersions(t *testing.T) {
	_, err := decodeScene([]byte(`{"version":99,"operations":[]}`))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "newer than supported")
}

func TestDecodeScene_FillsInDefaults(t *testing.T) {
	scene, err := decodeScene([]byte(`{"operations":[{"type":"add_layer","layer":{"id":"layer-2","name":"Layer 2","visible":true}}],"cursor":99}`))

	require.NoError(t, err)
	assert.Equal(t, SceneVersion, scene.Version)
	assert.Equal(t, DefaultSize, scene.Document)
	assert.Equal(t, "layer-1", scene.ActiveLayerID)
	// A cursor past the end of the log would materialise nothing extra, but
	// clamping keeps the redo flag in the editor honest.
	assert.Equal(t, 0, scene.Cursor)
}

func layerIDs(doc Document) []string {
	ids := make([]string, 0, len(doc.Layers))
	for _, layer := range doc.Layers {
		ids = append(ids, layer.ID)
	}
	return ids
}
