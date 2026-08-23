import React from "react";
import type { Layer, Tool } from "../../hooks/useDrawingCanvas";

interface DrawingCanvasProps {
  surfaceRef: React.RefObject<HTMLDivElement>;
  registerLayerCanvas: (layerId: string) => (el: HTMLCanvasElement | null) => void;
  layers: Layer[];
  tool: Tool;
}

function DrawingCanvas({
  surfaceRef,
  registerLayerCanvas,
  layers,
  tool,
}: DrawingCanvasProps) {
  return (
    <div
      ref={surfaceRef}
      className="canvas-container"
      data-testid="drawing-canvas"
      style={{ cursor: tool === "eraser" ? "cell" : "crosshair" }}
    >
      {layers.map((layer, index) => (
        <canvas
          key={layer.id}
          ref={registerLayerCanvas(layer.id)}
          className="drawing-canvas-layer"
          data-testid={`layer-canvas-${layer.id}`}
          style={{
            zIndex: index,
            visibility: layer.visible ? "visible" : "hidden",
          }}
        />
      ))}
    </div>
  );
}

export default DrawingCanvas;
