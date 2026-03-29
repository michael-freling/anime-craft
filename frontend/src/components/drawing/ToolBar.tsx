interface DrawingState {
  tool: "brush" | "eraser";
  brushSize: number;
  brushColor: string;
  canUndo: boolean;
  canRedo: boolean;
}

interface ToolBarProps {
  state: DrawingState;
  onSetTool: (tool: "brush" | "eraser") => void;
  onSetBrushSize: (size: number) => void;
  onSetBrushColor: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
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
  onClear,
}: ToolBarProps) {
  return (
    <div className="toolbar" data-testid="toolbar">
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${state.tool === "brush" ? "active" : ""}`}
          onClick={() => onSetTool("brush")}
          data-testid="tool-brush"
        >
          Brush
        </button>
        <button
          className={`toolbar-btn ${state.tool === "eraser" ? "active" : ""}`}
          onClick={() => onSetTool("eraser")}
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
          data-testid="btn-undo"
        >
          Undo
        </button>
        <button
          className="toolbar-btn"
          onClick={onRedo}
          disabled={!state.canRedo}
          data-testid="btn-redo"
        >
          Redo
        </button>
      </div>

      <div className="toolbar-group">
        <button
          className="toolbar-btn toolbar-btn-danger"
          onClick={onClear}
          data-testid="btn-clear"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export default ToolBar;
