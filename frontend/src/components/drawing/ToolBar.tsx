import type { DrawingState, Tool } from "../../hooks/useDrawingCanvas";

interface ToolBarProps {
  state: DrawingState;
  onSetTool: (tool: Tool) => void;
  onSetBrushSize: (size: number) => void;
  onSetBrushColor: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
}

const BRUSH_SIZES = [
  { label: "Small", value: 2 },
  { label: "Medium", value: 5 },
  { label: "Large", value: 10 },
];

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
        </button>
        <button
          className={`toolbar-btn ${state.tool === "eraser" ? "active" : ""}`}
          onClick={() => onSetTool("eraser")}
          title="Eraser (E)"
          data-testid="tool-eraser"
        >
          Eraser
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
          title="Undo (Ctrl+Z)"
          data-testid="btn-undo"
        >
          Undo
        </button>
        <button
          className="toolbar-btn"
          onClick={onRedo}
          disabled={!state.canRedo}
          title="Redo (Ctrl+Shift+Z)"
          data-testid="btn-redo"
        >
          Redo
        </button>
      </div>
    </div>
  );
}

export default ToolBar;
