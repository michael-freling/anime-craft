// Package drawdoc holds the persistent form of a drawing: an ordered log of
// vector operations, the document state they materialise into, a rasteriser
// for that state, and readers and writers for the OpenRaster files the log is
// checkpointed into.
//
// The log is the source of truth. A drawing is "the first cursor+1 operations,
// applied in order" — the same rule the editor uses for undo, so a saved file
// restores the editor exactly, redo stack included.
package drawdoc

import (
	"encoding/json"
	"fmt"
	"time"
)

// SceneVersion is the schema version written into scene.json. Readers refuse
// anything newer than they understand rather than guessing at unknown fields.
const SceneVersion = 1

type OpType string

const (
	OpAddStroke       OpType = "add_stroke"
	OpAddLayer        OpType = "add_layer"
	OpRemoveLayer     OpType = "remove_layer"
	OpSetLayerVisible OpType = "set_layer_visible"
	OpMoveLayer       OpType = "move_layer"
)

// Size is the document's coordinate space. Strokes are stored in these units,
// so a drawing resumes at the same proportions regardless of window size.
type Size struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

func (s Size) valid() bool { return s.Width > 0 && s.Height > 0 }

type Layer struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Visible bool   `json:"visible"`
}

// Stroke is one press-drag-release of the brush or eraser. Points are a flat
// [x0, y0, x1, y1, ...] array in document units: half the JSON of an array of
// objects, and it is what the canvas wants anyway.
type Stroke struct {
	ID      string    `json:"id"`
	LayerID string    `json:"layerId"`
	Tool    string    `json:"tool"`
	Color   string    `json:"color"`
	Size    float64   `json:"size"`
	Points  []float64 `json:"points"`
}

const (
	ToolBrush  = "brush"
	ToolEraser = "eraser"
)

// Operation is one entry in the log. It is a tagged union flattened into a
// single struct: the fields a given Type does not use stay empty.
type Operation struct {
	Type    OpType  `json:"type"`
	Stroke  *Stroke `json:"stroke,omitempty"`
	Layer   *Layer  `json:"layer,omitempty"`
	LayerID string  `json:"layerId,omitempty"`
	Visible *bool   `json:"visible,omitempty"`
	ToIndex *int    `json:"toIndex,omitempty"`

	// raw keeps the bytes an operation was decoded from so a log written by a
	// newer app version survives a round trip through an older one instead of
	// having its unrecognised fields silently dropped.
	raw json.RawMessage
}

func (o *Operation) UnmarshalJSON(data []byte) error {
	type plain Operation
	var p plain
	if err := json.Unmarshal(data, &p); err != nil {
		return err
	}
	*o = Operation(p)
	o.raw = append(json.RawMessage(nil), data...)
	return nil
}

func (o Operation) MarshalJSON() ([]byte, error) {
	if len(o.raw) > 0 {
		return o.raw, nil
	}
	type plain Operation
	return json.Marshal(plain(o))
}

type ToolState struct {
	Tool       string  `json:"tool"`
	BrushSize  float64 `json:"brushSize"`
	BrushColor string  `json:"brushColor"`
}

// SessionInfo and ReferenceInfo make a saved file stand on its own: enough to
// re-create the practice session it came from, on a machine that has never
// seen this app's database.
type SessionInfo struct {
	ID           string    `json:"id"`
	ExerciseMode string    `json:"exerciseMode"`
	StartedAt    time.Time `json:"startedAt"`
}

type ReferenceInfo struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Difficulty string `json:"difficulty"`
	// Src is the path of the embedded copy inside the container, empty when
	// the reference image could not be read at save time.
	Src    string `json:"src,omitempty"`
	SHA256 string `json:"sha256,omitempty"`
}

// Scene is the whole saved drawing: the operation log plus everything needed
// to put the editor back the way the artist left it.
type Scene struct {
	Version       int            `json:"version"`
	Document      Size           `json:"document"`
	Session       *SessionInfo   `json:"session,omitempty"`
	Reference     *ReferenceInfo `json:"reference,omitempty"`
	Tool          *ToolState     `json:"tool,omitempty"`
	ActiveLayerID string         `json:"activeLayerId,omitempty"`
	// Cursor is the index of the last applied operation; -1 means none.
	// Operations after it are the redo stack, kept so undo survives a restart.
	Cursor     int         `json:"cursor"`
	Operations []Operation `json:"operations"`
	Revision   int         `json:"revision"`
	SavedAt    time.Time   `json:"savedAt"`
}

// DefaultSize is the page every new drawing starts on. Reference images for
// line work are overwhelmingly 4:3, and a fixed page keeps stroke coordinates
// meaningful across window sizes and machines.
var DefaultSize = Size{Width: 1024, Height: 768}

const firstLayerID = "layer-1"

// NewScene returns the scene an untouched session saves: one empty layer and
// no operations.
func NewScene() *Scene {
	return &Scene{
		Version:       SceneVersion,
		Document:      DefaultSize,
		ActiveLayerID: firstLayerID,
		Cursor:        -1,
		Operations:    []Operation{},
	}
}

func (s *Scene) normalise() {
	if s.Version == 0 {
		s.Version = SceneVersion
	}
	if !s.Document.valid() {
		s.Document = DefaultSize
	}
	if s.Operations == nil {
		s.Operations = []Operation{}
	}
	if s.Cursor < -1 {
		s.Cursor = -1
	}
	if s.Cursor > len(s.Operations)-1 {
		s.Cursor = len(s.Operations) - 1
	}
	if s.ActiveLayerID == "" {
		s.ActiveLayerID = firstLayerID
	}
}

// Document is the state an operation log materialises into: the layer stack
// bottom to top, and the strokes on each layer in the order they were painted.
type Document struct {
	Layers  []Layer
	Strokes map[string][]Stroke
}

// Materialize applies the first cursor+1 operations of the log. Operations
// past the cursor are the redo stack and are deliberately left out.
func Materialize(ops []Operation, cursor int) Document {
	doc := Document{
		Layers:  []Layer{{ID: firstLayerID, Name: "Layer 1", Visible: true}},
		Strokes: map[string][]Stroke{},
	}
	if cursor > len(ops)-1 {
		cursor = len(ops) - 1
	}

	for i := 0; i <= cursor; i++ {
		op := ops[i]
		switch op.Type {
		case OpAddStroke:
			if op.Stroke == nil || !doc.hasLayer(op.Stroke.LayerID) {
				continue
			}
			doc.Strokes[op.Stroke.LayerID] = append(doc.Strokes[op.Stroke.LayerID], *op.Stroke)

		case OpAddLayer:
			if op.Layer == nil || doc.hasLayer(op.Layer.ID) {
				continue
			}
			doc.Layers = append(doc.Layers, *op.Layer)

		case OpRemoveLayer:
			// The last layer is never removable, so a drawing always has a
			// surface to paint on.
			if len(doc.Layers) <= 1 {
				continue
			}
			index := doc.indexOf(op.LayerID)
			if index < 0 {
				continue
			}
			doc.Layers = append(doc.Layers[:index:index], doc.Layers[index+1:]...)
			delete(doc.Strokes, op.LayerID)

		case OpSetLayerVisible:
			index := doc.indexOf(op.LayerID)
			if index < 0 || op.Visible == nil {
				continue
			}
			doc.Layers[index].Visible = *op.Visible

		case OpMoveLayer:
			index := doc.indexOf(op.LayerID)
			if index < 0 || op.ToIndex == nil {
				continue
			}
			target := *op.ToIndex
			if target < 0 || target > len(doc.Layers)-1 {
				continue
			}
			layer := doc.Layers[index]
			rest := append(doc.Layers[:index:index], doc.Layers[index+1:]...)
			doc.Layers = append(rest[:target:target], append([]Layer{layer}, rest[target:]...)...)
		}
	}
	return doc
}

func (d Document) hasLayer(id string) bool { return d.indexOf(id) >= 0 }

func (d Document) indexOf(id string) int {
	for i, layer := range d.Layers {
		if layer.ID == id {
			return i
		}
	}
	return -1
}

// Materialize applies the scene's own log up to its own cursor.
func (s *Scene) Materialize() Document { return Materialize(s.Operations, s.Cursor) }

func decodeScene(data []byte) (*Scene, error) {
	var scene Scene
	if err := json.Unmarshal(data, &scene); err != nil {
		return nil, fmt.Errorf("decode scene: %w", err)
	}
	if scene.Version > SceneVersion {
		return nil, fmt.Errorf("scene version %d is newer than supported version %d", scene.Version, SceneVersion)
	}
	scene.normalise()
	return &scene, nil
}
