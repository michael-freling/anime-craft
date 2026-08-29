/**
 * A drawing is an ordered log of operations plus a cursor saying how many of
 * them apply. Undo moves the cursor; everything past it is the redo stack.
 *
 * Keeping the log — rather than a stack of pixel snapshots — is what makes a
 * drawing saveable: the strokes stay vectors, so a session can be put back on
 * screen exactly as it was left, redo included, at any window size. It also
 * costs a fraction of the memory: a stroke is a list of coordinates, not two
 * full-canvas bitmaps.
 *
 * The Go side applies the same rules to the same log (see
 * gateway/internal/drawdoc), so what the editor shows and what a saved file
 * renders to are the same drawing.
 */

export const SCENE_VERSION = 1;

export type Tool = "brush" | "eraser";

/**
 * Strokes are stored in document units, not screen pixels, so a drawing keeps
 * its proportions when the window is resized or reopened on another machine.
 */
export interface DocumentSize {
  width: number;
  height: number;
}

export const DEFAULT_DOCUMENT_SIZE: DocumentSize = { width: 1024, height: 768 };

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
}

/** One press-drag-release. Points are flat [x0, y0, x1, y1, ...]. */
export interface Stroke {
  id: string;
  layerId: string;
  tool: Tool;
  color: string;
  size: number;
  points: number[];
}

export type Operation =
  | { type: "add_stroke"; stroke: Stroke }
  | { type: "add_layer"; layer: Layer }
  | { type: "remove_layer"; layerId: string }
  | { type: "set_layer_visible"; layerId: string; visible: boolean }
  | { type: "move_layer"; layerId: string; toIndex: number };

export interface ToolState {
  tool: Tool;
  brushSize: number;
  brushColor: string;
}

export interface SceneReference {
  id: string;
  title?: string;
  difficulty?: string;
  src?: string;
  sha256?: string;
}

/** The saved form of a drawing, as it travels to and from the Go side. */
export interface Scene {
  version: number;
  document: DocumentSize;
  session?: { id: string; exerciseMode: string; startedAt: string };
  reference?: SceneReference;
  tool?: ToolState;
  activeLayerId: string;
  cursor: number;
  operations: Operation[];
  revision?: number;
  savedAt?: string;
}

export const FIRST_LAYER: Layer = {
  id: "layer-1",
  name: "Layer 1",
  visible: true,
};

export interface DocumentState {
  layers: Layer[];
  strokes: Map<string, Stroke[]>;
  /**
   * Where the selection lands when the log alone decides — after an undo, a
   * redo, or reopening a saved drawing. Adding a layer selects it, deleting
   * one falls back to its neighbour, and a stroke selects the layer it landed
   * on, so undo returns the artist to where they were working.
   */
  activeLayerId: string;
}

/** Applies the first `cursor + 1` operations of the log. */
export function materialize(
  operations: Operation[],
  cursor: number,
): DocumentState {
  const layers: Layer[] = [{ ...FIRST_LAYER }];
  const strokes = new Map<string, Stroke[]>();
  let activeLayerId = FIRST_LAYER.id;

  const indexOf = (id: string) => layers.findIndex((layer) => layer.id === id);
  const end = Math.min(cursor, operations.length - 1);

  for (let i = 0; i <= end; i++) {
    const op = operations[i];
    switch (op.type) {
      case "add_stroke": {
        if (indexOf(op.stroke.layerId) === -1) break;
        const existing = strokes.get(op.stroke.layerId);
        if (existing) {
          existing.push(op.stroke);
        } else {
          strokes.set(op.stroke.layerId, [op.stroke]);
        }
        activeLayerId = op.stroke.layerId;
        break;
      }
      case "add_layer": {
        if (indexOf(op.layer.id) !== -1) break;
        layers.push({ ...op.layer });
        activeLayerId = op.layer.id;
        break;
      }
      case "remove_layer": {
        // The last layer is never removable, so there is always somewhere to
        // paint.
        if (layers.length <= 1) break;
        const index = indexOf(op.layerId);
        if (index === -1) break;
        layers.splice(index, 1);
        strokes.delete(op.layerId);
        if (activeLayerId === op.layerId) {
          activeLayerId = layers[Math.max(0, index - 1)].id;
        }
        break;
      }
      case "set_layer_visible": {
        const index = indexOf(op.layerId);
        if (index === -1) break;
        layers[index] = { ...layers[index], visible: op.visible };
        break;
      }
      case "move_layer": {
        const index = indexOf(op.layerId);
        if (index === -1) break;
        if (op.toIndex < 0 || op.toIndex > layers.length - 1) break;
        const [layer] = layers.splice(index, 1);
        layers.splice(op.toIndex, 0, layer);
        break;
      }
    }
  }

  return { layers, strokes, activeLayerId };
}

/**
 * The next free layer number, taken from the layers that exist right now.
 * Using the highest number rather than the count keeps ids unique when a layer
 * below the top has been deleted, and undoing an add gives the number back
 * instead of letting the numbering drift upward.
 */
export function nextLayerNumber(layers: Layer[]): number {
  return (
    layers.reduce((highest, layer) => {
      const n = Number.parseInt(layer.id.slice("layer-".length), 10);
      return Number.isFinite(n) && n > highest ? n : highest;
    }, 0) + 1
  );
}

/** Rounds coordinates to a tenth of a document unit — far finer than the eye
 *  or the screen can resolve, and roughly half the JSON of raw floats. */
export function quantize(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Guards against a malformed or truncated scene taking the editor down. */
export function parseScene(raw: string): Scene | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const scene = parsed as Partial<Scene>;
  const operations = Array.isArray(scene.operations) ? scene.operations : [];
  const size =
    scene.document && scene.document.width > 0 && scene.document.height > 0
      ? scene.document
      : DEFAULT_DOCUMENT_SIZE;

  return {
    version: scene.version ?? SCENE_VERSION,
    document: { ...size },
    session: scene.session,
    reference: scene.reference,
    tool: scene.tool,
    activeLayerId: scene.activeLayerId || FIRST_LAYER.id,
    cursor: Math.max(-1, Math.min(scene.cursor ?? -1, operations.length - 1)),
    operations,
    revision: scene.revision,
    savedAt: scene.savedAt,
  };
}
