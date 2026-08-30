import type { ReactNode } from "react";
import type { DrawingState, Tool } from "../../hooks/useDrawingCanvas";

interface ToolBarProps {
  state: DrawingState;
  onSetTool: (tool: Tool) => void;
  onSetBrushSize: (size: number) => void;
  onSetBrushColor: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Anything that belongs on this row but is not a drawing tool, pushed to
   * the far end — it costs no space of its own, which is the point. */
  trailing?: ReactNode;
}

const BRUSH_SIZES = [
  { label: "Small", value: 2 },
  { label: "Medium", value: 5 },
  { label: "Large", value: 10 },
];

// Shown on the buttons themselves — a shortcut nobody can see is a shortcut
// nobody learns. Mac keyboards get the symbols they actually have.
const isMac =
  typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);
const UNDO_KEY = isMac ? "\u2318Z" : "Ctrl+Z";
const REDO_KEY = isMac ? "\u21e7\u2318Z" : "Ctrl+Shift+Z";

const COLOR_PALETTE = [
  { label: "Black", value: "#000000" },
  { label: "Red", value: "#f44336" },
  { label: "Blue", value: "#2196f3" },
  { label: "Green", value: "#4caf50" },
  { label: "Orange", value: "#ff9800" },
  { label: "Purple", value: "#9c27b0" },
];

function ToolBar({
  state,
  onSetTool,
  onSetBrushSize,
  onSetBrushColor,
  onUndo,
  onRedo,
  trailing,
}: ToolBarProps) {
  return (
    <div className="toolbar" data-testid="toolbar">
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${state.tool === "brush" ? "active" : ""}`}
          onClick={() => onSetTool("brush")}
          title="Brush (B)"
          data-testid="tool-brush"
        >
          Brush
          <kbd className="toolbar-key">B</kbd>
        </button>
        <button
          className={`toolbar-btn ${state.tool === "eraser" ? "active" : ""}`}
          onClick={() => onSetTool("eraser")}
          title="Eraser (E)"
          data-testid="tool-eraser"
        >
          Eraser
          <kbd className="toolbar-key">E</kbd>
        </button>
      </div>

      <div className="toolbar-group">
        {BRUSH_SIZES.map((size) => (
          <button
            key={size.value}
            className={`toolbar-btn ${state.brushSize === size.value ? "active" : ""}`}
            onClick={() => onSetBrushSize(size.value)}
            data-testid={`brush-size-${size.label.toLowerCase()}`}
          >
            {size.label}
          </button>
        ))}
      </div>

      <div className="toolbar-group">
        {COLOR_PALETTE.map((color) => (
          <button
            key={color.value}
            className={`toolbar-color ${state.brushColor === color.value ? "active" : ""}`}
            style={{ backgroundColor: color.value }}
            onClick={() => onSetBrushColor(color.value)}
            aria-label={color.label}
            data-testid={`color-${color.label.toLowerCase()}`}
          />
        ))}
      </div>

      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={onUndo}
          disabled={!state.canUndo}
          title={`Undo (${UNDO_KEY})`}
          data-testid="btn-undo"
        >
          Undo
          <kbd className="toolbar-key">{UNDO_KEY}</kbd>
        </button>
        <button
          className="toolbar-btn"
          onClick={onRedo}
          disabled={!state.canRedo}
          title={`Redo (${REDO_KEY})`}
          data-testid="btn-redo"
        >
          Redo
          <kbd className="toolbar-key">{REDO_KEY}</kbd>
        </button>
      </div>

      {trailing && <div className="toolbar-trailing">{trailing}</div>}
    </div>
  );
}

export default ToolBar;
