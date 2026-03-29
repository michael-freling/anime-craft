import React from "react";

interface DrawingCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  tool: "brush" | "eraser";
}

function DrawingCanvas({ canvasRef, tool }: DrawingCanvasProps) {
  return (
    <div className="canvas-container">
      <canvas
        ref={canvasRef}
        className="drawing-canvas"
        data-testid="drawing-canvas"
        style={{ cursor: tool === "eraser" ? "cell" : "crosshair" }}
      />
    </div>
  );
}

export default DrawingCanvas;
