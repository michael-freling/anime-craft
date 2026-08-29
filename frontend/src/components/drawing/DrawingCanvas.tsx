import React from "react";
import type { DocumentSize, Layer, Tool } from "../../drawing/document";

interface DrawingCanvasProps {
  surfaceRef: React.RefObject<HTMLDivElement>;
  pageRef: React.RefObject<HTMLDivElement>;
  registerLayerCanvas: (layerId: string) => (el: HTMLCanvasElement | null) => void;
  layers: Layer[];
  tool: Tool;
  documentSize: DocumentSize;
}

/**
 * The drawing is a fixed-size page centred in whatever room the surface has,
 * rather than stretching to fill the window. A page keeps stroke coordinates
 * meaningful, so a saved drawing reopens looking the same at any window size.
 */
function DrawingCanvas({
  surfaceRef,
  pageRef,
  registerLayerCanvas,
  layers,
  tool,
  documentSize,
}: DrawingCanvasProps) {
  return (
    <div
      ref={surfaceRef}
      className="canvas-container"
      data-testid="drawing-canvas"
      style={{ cursor: tool === "eraser" ? "cell" : "crosshair" }}
    >
      <div
        ref={pageRef}
        className="canvas-page"
        data-testid="drawing-page"
        style={{ aspectRatio: `${documentSize.width} / ${documentSize.height}` }}
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
    </div>
  );
}

export default DrawingCanvas;
