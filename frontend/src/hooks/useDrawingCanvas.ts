import { useRef, useState, useEffect, useCallback } from "react";

interface DrawingState {
  tool: "brush" | "eraser";
  brushSize: number;
  brushColor: string;
  canUndo: boolean;
  canRedo: boolean;
}

interface UseDrawingCanvasReturn {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  state: DrawingState;
  setTool: (tool: "brush" | "eraser") => void;
  setBrushSize: (size: number) => void;
  setBrushColor: (color: string) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportPNG: () => string;
  canUndo: boolean;
  canRedo: boolean;
}

export function useDrawingCanvas(): UseDrawingCanvasReturn {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const toolRef = useRef<"brush" | "eraser">("brush");
  const brushSizeRef = useRef(2);
  const brushColorRef = useRef("#000000");

  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef(-1);

  const [state, setState] = useState<DrawingState>({
    tool: "brush",
    brushSize: 2,
    brushColor: "#000000",
    canUndo: false,
    canRedo: false,
  });

  const updateUndoRedo = useCallback(() => {
    setState((prev) => ({
      ...prev,
      canUndo: historyIndexRef.current > 0,
      canRedo: historyIndexRef.current < historyRef.current.length - 1,
    }));
  }, []);

  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current = historyRef.current.slice(
      0,
      historyIndexRef.current + 1
    );
    historyRef.current.push(snapshot);
    historyIndexRef.current = historyRef.current.length - 1;

    // Limit history to 50 entries
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }

    updateUndoRedo();
  }, [updateUndoRedo]);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (width === 0 || height === 0) return;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    historyRef.current = [];
    historyIndexRef.current = -1;
    saveSnapshot();
  }, [saveSnapshot]);

  // ResizeObserver to handle canvas resizing when the container changes size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resizeObserver = new ResizeObserver(() => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width === 0 || height === 0) return;

      // Skip if size hasn't changed
      if (canvas.width === width && canvas.height === height) return;

      // Save current content
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      let imageData: ImageData | null = null;
      if (canvas.width > 0 && canvas.height > 0) {
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }

      // Resize canvas
      canvas.width = width;
      canvas.height = height;

      // Fill white background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      // Restore content
      if (imageData) {
        ctx.putImageData(imageData, 0, 0);
      }
    });

    resizeObserver.observe(parent);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    initCanvas();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPoint = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      isDrawing.current = true;
      lastPoint.current = getPoint(e);
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDrawing.current || !lastPoint.current) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const point = getPoint(e);
      const tool = toolRef.current;
      const size = brushSizeRef.current;

      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(point.x, point.y);
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = brushColorRef.current;
      }

      ctx.stroke();

      // Reset composite operation
      ctx.globalCompositeOperation = "source-over";

      lastPoint.current = point;
    };

    const onPointerUp = () => {
      if (isDrawing.current) {
        isDrawing.current = false;
        lastPoint.current = null;
        saveSnapshot();
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
    };
  }, [initCanvas, saveSnapshot]);

  const setTool = useCallback((tool: "brush" | "eraser") => {
    toolRef.current = tool;
    setState((prev) => ({ ...prev, tool }));
  }, []);

  const setBrushSize = useCallback((size: number) => {
    brushSizeRef.current = size;
    setState((prev) => ({ ...prev, brushSize: size }));
  }, []);

  const setBrushColor = useCallback((color: string) => {
    brushColorRef.current = color;
    setState((prev) => ({ ...prev, brushColor: color }));
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(historyRef.current[historyIndexRef.current], 0, 0);
    updateUndoRedo();
  }, [updateUndoRedo]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(historyRef.current[historyIndexRef.current], 0, 0);
    updateUndoRedo();
  }, [updateUndoRedo]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveSnapshot();
  }, [saveSnapshot]);

  const exportPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    return canvas.toDataURL("image/png");
  }, []);

  return {
    canvasRef,
    state,
    setTool,
    setBrushSize,
    setBrushColor,
    undo,
    redo,
    clear,
    exportPNG,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
  };
}
