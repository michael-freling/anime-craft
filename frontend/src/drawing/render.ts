import type { Stroke } from "./document";

/**
 * Layer canvases are sized in document units, so strokes are drawn with the
 * coordinates they were stored with and the browser scales the result to
 * whatever space the page has. Nothing here needs to know how big the window
 * is.
 */

export function applyStrokeStyle(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
): void {
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (stroke.tool === "eraser") {
    // The eraser cuts a hole in its own layer rather than painting white, so
    // the layers underneath show through.
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color;
  }
}

/** Draws the newest segment of a stroke still under the pointer. */
export function drawSegment(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  applyStrokeStyle(ctx, stroke);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const points = stroke.points;
  if (points.length < 2) return;

  applyStrokeStyle(ctx, stroke);
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  if (points.length === 2) {
    // A tap with no drag: a round cap on a zero-length line is the dot the
    // artist expects, not nothing at all.
    ctx.lineTo(points[0], points[1]);
  }
  for (let i = 2; i + 1 < points.length; i += 2) {
    ctx.lineTo(points[i], points[i + 1]);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
}

/** Repaints a layer from scratch — how undo, redo and reopening a file work. */
export function renderLayer(
  canvas: HTMLCanvasElement,
  strokes: Stroke[] | undefined,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!strokes) return;
  for (const stroke of strokes) {
    drawStroke(ctx, stroke);
  }
}

/**
 * Flattens the visible layers onto white for submission. Layers are
 * transparent so they can stack; the drawing itself lives on a white page.
 */
export function composite(
  canvases: HTMLCanvasElement[],
  width: number,
  height: number,
): string {
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;

  const ctx = output.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  canvases.forEach((canvas) => ctx.drawImage(canvas, 0, 0, width, height));

  return output.toDataURL("image/png");
}
