import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Tool = "brush" | "eraser";

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
}

export interface DrawingState {
  tool: Tool;
  brushSize: number;
  brushColor: string;
  canUndo: boolean;
  canRedo: boolean;
  layers: Layer[];
  activeLayerId: string;
}

/** The layer stack and which layer strokes land on. */
interface LayerState {
  layers: Layer[];
  activeLayerId: string;
}

/**
 * Undo covers two kinds of change:
 *   - "stroke": pixels on one layer, recorded before and after the stroke.
 *   - "layers": the shape of the stack itself — adding, deleting, reordering
 *     or hiding a layer. Deleting also keeps the layer's pixels so undo can
 *     bring the layer back with its artwork intact.
 * Selecting a layer is not recorded: it changes nothing about the drawing.
 */
type HistoryEntry =
  | { type: "stroke"; layerId: string; before: ImageData; after: ImageData }
  | {
      type: "layers";
      before: LayerState;
      after: LayerState;
      pixels?: { layerId: string; imageData: ImageData };
    };

interface UseDrawingCanvasReturn {
  surfaceRef: React.RefObject<HTMLDivElement>;
  registerLayerCanvas: (layerId: string) => (el: HTMLCanvasElement | null) => void;
  state: DrawingState;
  setTool: (tool: Tool) => void;
  setBrushSize: (size: number) => void;
  setBrushColor: (color: string) => void;
  undo: () => void;
  redo: () => void;
  addLayer: () => void;
  removeLayer: (layerId: string) => void;
  selectLayer: (layerId: string) => void;
  toggleLayerVisibility: (layerId: string) => void;
  moveLayer: (layerId: string, direction: "up" | "down") => void;
  exportPNG: () => string;
  canUndo: boolean;
  canRedo: boolean;
}

// Stroke entries hold two full-canvas snapshots, so the cap trades undo depth
// against memory.
const MAX_HISTORY = 30;

const FIRST_LAYER: Layer = { id: "layer-1", name: "Layer 1", visible: true };

export function useDrawingCanvas(): UseDrawingCanvasReturn {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasesRef = useRef(new Map<string, HTMLCanvasElement>());
  // Layers whose canvas has been sized to the surface already; a canvas that
  // has been sized must not be resized again, since that clears its content.
  const sizedRef = useRef(new Set<string>());
  // Pixels waiting for their layer's canvas to mount — undoing a delete puts
  // the layer back one render before its canvas exists.
  const pendingRestoreRef = useRef(new Map<string, ImageData>());

  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const strokeBefore = useRef<ImageData | null>(null);

  const toolRef = useRef<Tool>("brush");
  const brushSizeRef = useRef(2);
  const brushColorRef = useRef("#000000");

  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);

  // Bottom to top: the first layer paints first, the last one paints over it.
  const [layers, setLayers] = useState<Layer[]>([FIRST_LAYER]);
  const [activeLayerId, setActiveLayerId] = useState(FIRST_LAYER.id);
  const layersRef = useRef(layers);
  const activeLayerIdRef = useRef(activeLayerId);

  const [toolState, setToolState] = useState({
    tool: "brush" as Tool,
    brushSize: 2,
    brushColor: "#000000",
    canUndo: false,
    canRedo: false,
  });

  const syncHistoryFlags = useCallback(() => {
    setToolState((prev) => ({
      ...prev,
      canUndo: historyIndexRef.current >= 0,
      canRedo: historyIndexRef.current < historyRef.current.length - 1,
    }));
  }, []);

  const pushEntry = useCallback(
    (entry: HistoryEntry) => {
      const entries = historyRef.current.slice(0, historyIndexRef.current + 1);
      entries.push(entry);
      if (entries.length > MAX_HISTORY) {
        entries.shift();
      }
      historyRef.current = entries;
      historyIndexRef.current = entries.length - 1;
      syncHistoryFlags();
    },
    [syncHistoryFlags],
  );

  const surfaceSize = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return { width: 0, height: 0 };
    return { width: surface.clientWidth, height: surface.clientHeight };
  }, []);

  const registerLayerCanvas = useCallback(
    (layerId: string) => (el: HTMLCanvasElement | null) => {
      // React passes null when the inline ref callback identity changes on a
      // re-render; the element itself is still mounted, so keep what we have.
      if (!el) return;
      canvasesRef.current.set(layerId, el);

      if (!sizedRef.current.has(layerId)) {
        const { width, height } = surfaceSize();
        if (width === 0 || height === 0) return;
        el.width = width;
        el.height = height;
        sizedRef.current.add(layerId);
      }

      const pending = pendingRestoreRef.current.get(layerId);
      if (pending) {
        pendingRestoreRef.current.delete(layerId);
        el.getContext("2d")?.putImageData(pending, 0, 0);
      }
    },
    [surfaceSize],
  );

  // Keep every layer canvas the same size as the drawing surface, preserving
  // what is already drawn on it.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const resizeObserver = new ResizeObserver(() => {
      const width = surface.clientWidth;
      const height = surface.clientHeight;
      if (width === 0 || height === 0) return;

      canvasesRef.current.forEach((canvas, layerId) => {
        sizedRef.current.add(layerId);
        if (canvas.width === width && canvas.height === height) return;

        const ctx = canvas.getContext("2d");
        let snapshot: ImageData | null = null;
        if (ctx && canvas.width > 0 && canvas.height > 0) {
          snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }

        canvas.width = width;
        canvas.height = height;

        if (ctx && snapshot) {
          ctx.putImageData(snapshot, 0, 0);
        }
      });
    });

    resizeObserver.observe(surface);
    return () => resizeObserver.disconnect();
  }, []);

  const captureLayer = useCallback((layerId: string): ImageData | null => {
    const canvas = canvasesRef.current.get(layerId);
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, []);

  const restore = useCallback((layerId: string, imageData: ImageData) => {
    const canvas = canvasesRef.current.get(layerId);
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      // The layer's canvas isn't mounted yet; paint it on registration.
      pendingRestoreRef.current.set(layerId, imageData);
      return;
    }
    ctx.putImageData(imageData, 0, 0);
  }, []);

  const currentLayerState = useCallback(
    (): LayerState => ({
      layers: layersRef.current,
      activeLayerId: activeLayerIdRef.current,
    }),
    [],
  );

  const applyLayerState = useCallback(
    (next: LayerState, pixels?: { layerId: string; imageData: ImageData }) => {
      // Forget canvases for layers this state doesn't have; a layer that comes
      // back later gets a fresh canvas and its stored pixels.
      layersRef.current.forEach((layer) => {
        if (next.layers.some((l) => l.id === layer.id)) return;
        canvasesRef.current.delete(layer.id);
        sizedRef.current.delete(layer.id);
        pendingRestoreRef.current.delete(layer.id);
      });

      if (pixels && next.layers.some((l) => l.id === pixels.layerId)) {
        pendingRestoreRef.current.set(pixels.layerId, pixels.imageData);
      }

      layersRef.current = next.layers;
      activeLayerIdRef.current = next.activeLayerId;
      setLayers(next.layers);
      setActiveLayerId(next.activeLayerId);
    },
    [],
  );

  // Drawing happens on the surface, not on the layer canvases, so the topmost
  // layer doesn't swallow pointer events meant for the active one.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const activeCanvas = () =>
      canvasesRef.current.get(activeLayerIdRef.current) ?? null;

    const getPoint = (e: PointerEvent, canvas: HTMLCanvasElement) => {
      const rect = surface.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      const canvas = activeCanvas();
      if (!canvas) return;

      // Painting into a hidden layer looks like the app is ignoring the user.
      const active = layersRef.current.find(
        (layer) => layer.id === activeLayerIdRef.current,
      );
      if (!active || !active.visible) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      strokeBefore.current = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      isDrawing.current = true;
      lastPoint.current = getPoint(e, canvas);
      surface.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDrawing.current || !lastPoint.current) return;
      const canvas = activeCanvas();
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const point = getPoint(e, canvas);

      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(point.x, point.y);
      ctx.lineWidth = brushSizeRef.current;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (toolRef.current === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = brushColorRef.current;
      }

      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";

      lastPoint.current = point;
    };

    const onPointerUp = () => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      lastPoint.current = null;

      const layerId = activeLayerIdRef.current;
      const before = strokeBefore.current;
      strokeBefore.current = null;
      if (!before) return;

      const after = captureLayer(layerId);
      if (!after) return;

      pushEntry({ type: "stroke", layerId, before, after });
    };

    surface.addEventListener("pointerdown", onPointerDown);
    surface.addEventListener("pointermove", onPointerMove);
    surface.addEventListener("pointerup", onPointerUp);
    surface.addEventListener("pointerleave", onPointerUp);

    return () => {
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", onPointerUp);
      surface.removeEventListener("pointerleave", onPointerUp);
    };
  }, [captureLayer, pushEntry]);

  const setTool = useCallback((tool: Tool) => {
    toolRef.current = tool;
    setToolState((prev) => ({ ...prev, tool }));
  }, []);

  const setBrushSize = useCallback((size: number) => {
    brushSizeRef.current = size;
    setToolState((prev) => ({ ...prev, brushSize: size }));
  }, []);

  const setBrushColor = useCallback((color: string) => {
    brushColorRef.current = color;
    setToolState((prev) => ({ ...prev, brushColor: color }));
  }, []);

  const undo = useCallback(() => {
    const index = historyIndexRef.current;
    if (index < 0) return;

    const entry = historyRef.current[index];
    if (entry.type === "stroke") {
      restore(entry.layerId, entry.before);
    } else {
      applyLayerState(entry.before, entry.pixels);
    }

    historyIndexRef.current = index - 1;
    syncHistoryFlags();
  }, [applyLayerState, restore, syncHistoryFlags]);

  const redo = useCallback(() => {
    const next = historyIndexRef.current + 1;
    if (next > historyRef.current.length - 1) return;

    const entry = historyRef.current[next];
    if (entry.type === "stroke") {
      restore(entry.layerId, entry.after);
    } else {
      applyLayerState(entry.after, entry.pixels);
    }

    historyIndexRef.current = next;
    syncHistoryFlags();
  }, [applyLayerState, restore, syncHistoryFlags]);

  const addLayer = useCallback(() => {
    const before = currentLayerState();

    // Number from the layers that exist right now, so undoing an add and
    // adding again gives back the same number instead of drifting upward.
    // Taking the max rather than the count keeps ids unique when a layer
    // below the top has been deleted.
    const highest = before.layers.reduce((max, layer) => {
      const n = Number.parseInt(layer.id.slice("layer-".length), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    const number = highest + 1;

    const layer: Layer = {
      id: `layer-${number}`,
      name: `Layer ${number}`,
      visible: true,
    };
    const after: LayerState = {
      layers: [...before.layers, layer],
      activeLayerId: layer.id,
    };

    applyLayerState(after);
    pushEntry({ type: "layers", before, after });
  }, [applyLayerState, currentLayerState, pushEntry]);

  const removeLayer = useCallback(
    (layerId: string) => {
      const before = currentLayerState();
      if (before.layers.length <= 1) return;

      const index = before.layers.findIndex((layer) => layer.id === layerId);
      if (index === -1) return;

      const remaining = before.layers.filter((layer) => layer.id !== layerId);
      const after: LayerState = {
        layers: remaining,
        activeLayerId:
          before.activeLayerId === layerId
            ? remaining[Math.max(0, index - 1)].id
            : before.activeLayerId,
      };

      // Keep the artwork so undo can bring the layer back, not just its name.
      const imageData = captureLayer(layerId);

      applyLayerState(after);
      pushEntry({
        type: "layers",
        before,
        after,
        pixels: imageData ? { layerId, imageData } : undefined,
      });
    },
    [applyLayerState, captureLayer, currentLayerState, pushEntry],
  );

  // Selecting a layer changes nothing about the drawing, so it isn't undoable.
  const selectLayer = useCallback(
    (layerId: string) => {
      applyLayerState({ layers: layersRef.current, activeLayerId: layerId });
    },
    [applyLayerState],
  );

  const toggleLayerVisibility = useCallback(
    (layerId: string) => {
      const before = currentLayerState();
      if (!before.layers.some((layer) => layer.id === layerId)) return;

      const after: LayerState = {
        ...before,
        layers: before.layers.map((layer) =>
          layer.id === layerId ? { ...layer, visible: !layer.visible } : layer,
        ),
      };

      applyLayerState(after);
      pushEntry({ type: "layers", before, after });
    },
    [applyLayerState, currentLayerState, pushEntry],
  );

  const moveLayer = useCallback(
    (layerId: string, direction: "up" | "down") => {
      const before = currentLayerState();
      const index = before.layers.findIndex((layer) => layer.id === layerId);
      if (index === -1) return;

      const target = direction === "up" ? index + 1 : index - 1;
      if (target < 0 || target > before.layers.length - 1) return;

      const reordered = [...before.layers];
      [reordered[index], reordered[target]] = [
        reordered[target],
        reordered[index],
      ];
      const after: LayerState = { ...before, layers: reordered };

      applyLayerState(after);
      pushEntry({ type: "layers", before, after });
    },
    [applyLayerState, currentLayerState, pushEntry],
  );

  const exportPNG = useCallback(() => {
    const canvases = layersRef.current
      .filter((layer) => layer.visible)
      .map((layer) => canvasesRef.current.get(layer.id))
      .filter((canvas): canvas is HTMLCanvasElement => canvas !== undefined);

    const reference =
      canvasesRef.current.get(activeLayerIdRef.current) ??
      canvasesRef.current.values().next().value;
    if (!reference) return "";

    const output = document.createElement("canvas");
    output.width = reference.width;
    output.height = reference.height;

    const ctx = output.getContext("2d");
    if (!ctx) return "";

    // Layers are transparent so they can stack; the drawing itself is on white.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, output.width, output.height);
    canvases.forEach((canvas) => ctx.drawImage(canvas, 0, 0));

    return output.toDataURL("image/png");
  }, []);

  const state = useMemo<DrawingState>(
    () => ({ ...toolState, layers, activeLayerId }),
    [toolState, layers, activeLayerId],
  );

  return {
    surfaceRef,
    registerLayerCanvas,
    state,
    setTool,
    setBrushSize,
    setBrushColor,
    undo,
    redo,
    addLayer,
    removeLayer,
    selectLayer,
    toggleLayerVisibility,
    moveLayer,
    exportPNG,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
  };
}
