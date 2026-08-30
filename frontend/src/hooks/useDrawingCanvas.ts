import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_DOCUMENT_SIZE,
  FIRST_LAYER,
  materialize,
  nextLayerNumber,
  quantize,
} from "../drawing/document";
import type {
  DocumentSize,
  Layer,
  Operation,
  Scene,
  Stroke,
  Tool,
  ToolState,
} from "../drawing/document";
import { composite, drawSegment, renderLayer } from "../drawing/render";

export type { Layer, Tool, Scene } from "../drawing/document";

export interface DrawingState {
  tool: Tool;
  brushSize: number;
  brushColor: string;
  canUndo: boolean;
  canRedo: boolean;
  layers: Layer[];
  activeLayerId: string;
}

/**
 * The slice of the operation log the editor has and the store does not, ready
 * to be handed to autosave.
 */
export interface PendingSave {
  fromIndex: number;
  operations: Operation[];
  cursor: number;
  activeLayerId: string;
  tool: ToolState;
  document: DocumentSize;
}

interface UseDrawingCanvasReturn {
  surfaceRef: React.RefObject<HTMLDivElement>;
  pageRef: React.RefObject<HTMLDivElement>;
  registerLayerCanvas: (layerId: string) => (el: HTMLCanvasElement | null) => void;
  state: DrawingState;
  documentSize: DocumentSize;
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
  /** Replaces the drawing with a saved one. */
  hydrate: (scene: Scene) => void;
  /** Bumps whenever the drawing changes, so autosave knows there is work. */
  revision: number;
  takePendingSave: () => PendingSave | null;
  commitSave: (saved: PendingSave) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useDrawingCanvas(): UseDrawingCanvasReturn {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasesRef = useRef(new Map<string, HTMLCanvasElement>());
  // React calls a ref callback again whenever its identity changes, which
  // would repaint every layer on every render. Keeping one callback per layer
  // means a canvas is registered once.
  const registrarsRef = useRef(
    new Map<string, (el: HTMLCanvasElement | null) => void>(),
  );

  // The drawing itself: an operation log and how far into it we are.
  const operationsRef = useRef<Operation[]>([]);
  const cursorRef = useRef(-1);
  // Operations before this were inherited from the drawing the session began
  // with, so undo stops here rather than unpicking work done elsewhere.
  const baseIndexRef = useRef(0);
  const strokesRef = useRef<Map<string, Stroke[]>>(new Map());

  // What autosave still owes the store. pendingFrom is the earliest index
  // where the editor's log differs from the store's; it drops back when the
  // artist undoes and draws again, replacing the tail.
  const pendingFromRef = useRef(0);
  const syncedCountRef = useRef(0);
  const syncedCursorRef = useRef(-1);

  const isDrawingRef = useRef(false);
  const strokeRef = useRef<Stroke | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const strokeCounterRef = useRef(0);

  const toolRef = useRef<Tool>("brush");
  const brushSizeRef = useRef(2);
  const brushColorRef = useRef("#000000");

  const [layers, setLayers] = useState<Layer[]>([{ ...FIRST_LAYER }]);
  const [activeLayerId, setActiveLayerId] = useState(FIRST_LAYER.id);
  const layersRef = useRef(layers);
  const activeLayerIdRef = useRef(activeLayerId);

  const [documentSize, setDocumentSize] = useState<DocumentSize>(DEFAULT_DOCUMENT_SIZE);
  const documentSizeRef = useRef(documentSize);

  const [revision, setRevision] = useState(0);
  // Bumped when layers need repainting from the log rather than incrementally.
  const [renderToken, setRenderToken] = useState(0);

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
      canUndo: cursorRef.current >= baseIndexRef.current,
      canRedo: cursorRef.current < operationsRef.current.length - 1,
    }));
  }, []);

  const currentTool = useCallback(
    (): ToolState => ({
      tool: toolRef.current,
      brushSize: brushSizeRef.current,
      brushColor: brushColorRef.current,
    }),
    [],
  );

  /**
   * Rebuilds the layer stack and every layer's strokes from the log, then
   * repaints. This is what undo, redo, a layer change and opening a saved
   * drawing all come down to.
   */
  const syncFromLog = useCallback(
    (options: { keepActive: boolean; activeOverride?: string } = { keepActive: true }) => {
      const doc = materialize(operationsRef.current, cursorRef.current);
      strokesRef.current = doc.strokes;

      const exists = (id: string | undefined) =>
        Boolean(id) && doc.layers.some((layer) => layer.id === id);

      let nextActive = doc.activeLayerId;
      if (exists(options.activeOverride)) {
        nextActive = options.activeOverride as string;
      } else if (options.keepActive && exists(activeLayerIdRef.current)) {
        nextActive = activeLayerIdRef.current;
      }

      // Forget canvases for layers this state no longer has; one that comes
      // back through undo gets a fresh canvas and is repainted from the log.
      canvasesRef.current.forEach((_, layerId) => {
        if (doc.layers.some((layer) => layer.id === layerId)) return;
        canvasesRef.current.delete(layerId);
        registrarsRef.current.delete(layerId);
      });

      layersRef.current = doc.layers;
      activeLayerIdRef.current = nextActive;
      setLayers(doc.layers);
      setActiveLayerId(nextActive);
      setRenderToken((token) => token + 1);
      syncHistoryFlags();
    },
    [syncHistoryFlags],
  );

  const pushOperation = useCallback(
    (operation: Operation, options: { resync?: boolean } = {}) => {
      const operations = operationsRef.current;

      // Drawing after an undo discards the redo stack, here and in the store.
      const redoStart = cursorRef.current + 1;
      const truncated = redoStart < operations.length;
      if (truncated) {
        operations.length = redoStart;
        pendingFromRef.current = Math.min(pendingFromRef.current, redoStart);
      }

      operations.push(operation);
      cursorRef.current = operations.length - 1;

      if (truncated || options.resync) {
        syncFromLog({ keepActive: true });
      } else if (operation.type === "add_stroke") {
        // The stroke is already on the canvas from being drawn; just record it.
        const existing = strokesRef.current.get(operation.stroke.layerId);
        if (existing) {
          existing.push(operation.stroke);
        } else {
          strokesRef.current.set(operation.stroke.layerId, [operation.stroke]);
        }
        syncHistoryFlags();
      }

      setRevision((value) => value + 1);
    },
    [syncFromLog, syncHistoryFlags],
  );

  const registerLayerCanvas = useCallback((layerId: string) => {
    const existing = registrarsRef.current.get(layerId);
    if (existing) return existing;

    const register = (el: HTMLCanvasElement | null) => {
      if (!el) return;
      const size = documentSizeRef.current;
      // A canvas is sized in document units, so the browser scales it to
      // whatever room the page has and strokes never need rescaling.
      if (el.width !== size.width || el.height !== size.height) {
        el.width = size.width;
        el.height = size.height;
      }
      canvasesRef.current.set(layerId, el);
      renderLayer(el, strokesRef.current.get(layerId));
    };
    registrarsRef.current.set(layerId, register);
    return register;
  }, []);

  useEffect(() => {
    canvasesRef.current.forEach((canvas, layerId) => {
      renderLayer(canvas, strokesRef.current.get(layerId));
    });
  }, [renderToken]);

  // Fit the page into whatever room the surface has, keeping its proportions.
  // The drawing is a fixed-size page rather than "however big the window is",
  // which is what lets a saved file reopen looking the same.
  useEffect(() => {
    const surface = surfaceRef.current;
    const page = pageRef.current;
    if (!surface || !page) return;

    const fit = () => {
      const width = surface.clientWidth;
      const height = surface.clientHeight;
      if (width === 0 || height === 0) return;
      const size = documentSizeRef.current;
      const scale = Math.min(width / size.width, height / size.height);
      page.style.width = `${Math.round(size.width * scale)}px`;
      page.style.height = `${Math.round(size.height * scale)}px`;
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [documentSize]);

  // Pointer events live on the page, not the surface around it, so strokes
  // start inside the drawing and the topmost layer never swallows them.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const activeCanvas = () => canvasesRef.current.get(activeLayerIdRef.current) ?? null;

    const getPoint = (e: PointerEvent) => {
      const rect = page.getBoundingClientRect();
      const size = documentSizeRef.current;
      const scaleX = rect.width > 0 ? size.width / rect.width : 1;
      const scaleY = rect.height > 0 ? size.height / rect.height : 1;
      return {
        x: quantize((e.clientX - rect.left) * scaleX),
        y: quantize((e.clientY - rect.top) * scaleY),
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

      const point = getPoint(e);
      strokeCounterRef.current += 1;
      strokeRef.current = {
        id: `s${Date.now().toString(36)}${strokeCounterRef.current.toString(36)}`,
        layerId: active.id,
        tool: toolRef.current,
        color: brushColorRef.current,
        size: brushSizeRef.current,
        points: [point.x, point.y],
      };
      isDrawingRef.current = true;
      lastPointRef.current = point;
      page.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      const stroke = strokeRef.current;
      const last = lastPointRef.current;
      if (!isDrawingRef.current || !stroke || !last) return;

      const canvas = canvasesRef.current.get(stroke.layerId);
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;

      const point = getPoint(e);
      if (point.x === last.x && point.y === last.y) return;

      drawSegment(ctx, stroke, last, point);
      stroke.points.push(point.x, point.y);
      lastPointRef.current = point;
    };

    const onPointerUp = () => {
      const stroke = strokeRef.current;
      isDrawingRef.current = false;
      lastPointRef.current = null;
      strokeRef.current = null;
      if (!stroke) return;

      if (stroke.points.length === 2) {
        // A tap with no drag: paint the dot the artist expects.
        const ctx = canvasesRef.current.get(stroke.layerId)?.getContext("2d");
        const point = { x: stroke.points[0], y: stroke.points[1] };
        if (ctx) drawSegment(ctx, stroke, point, point);
      }

      pushOperation({ type: "add_stroke", stroke });
    };

    page.addEventListener("pointerdown", onPointerDown);
    page.addEventListener("pointermove", onPointerMove);
    page.addEventListener("pointerup", onPointerUp);
    page.addEventListener("pointerleave", onPointerUp);

    return () => {
      page.removeEventListener("pointerdown", onPointerDown);
      page.removeEventListener("pointermove", onPointerMove);
      page.removeEventListener("pointerup", onPointerUp);
      page.removeEventListener("pointerleave", onPointerUp);
    };
  }, [pushOperation]);

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
    if (cursorRef.current < baseIndexRef.current) return;
    cursorRef.current -= 1;
    syncFromLog({ keepActive: false });
    setRevision((value) => value + 1);
  }, [syncFromLog]);

  const redo = useCallback(() => {
    if (cursorRef.current >= operationsRef.current.length - 1) return;
    cursorRef.current += 1;
    syncFromLog({ keepActive: false });
    setRevision((value) => value + 1);
  }, [syncFromLog]);

  const addLayer = useCallback(() => {
    const number = nextLayerNumber(layersRef.current);
    const layer: Layer = {
      id: `layer-${number}`,
      name: `Layer ${number}`,
      visible: true,
    };
    pushOperation({ type: "add_layer", layer }, { resync: true });
    activeLayerIdRef.current = layer.id;
    setActiveLayerId(layer.id);
  }, [pushOperation]);

  const removeLayer = useCallback(
    (layerId: string) => {
      if (layersRef.current.length <= 1) return;
      if (!layersRef.current.some((layer) => layer.id === layerId)) return;
      pushOperation({ type: "remove_layer", layerId }, { resync: true });
    },
    [pushOperation],
  );

  // Selecting a layer changes nothing about the drawing, so it is neither
  // undoable nor worth a save of its own; it rides along with the next one.
  const selectLayer = useCallback((layerId: string) => {
    if (!layersRef.current.some((layer) => layer.id === layerId)) return;
    activeLayerIdRef.current = layerId;
    setActiveLayerId(layerId);
  }, []);

  const toggleLayerVisibility = useCallback(
    (layerId: string) => {
      const layer = layersRef.current.find((candidate) => candidate.id === layerId);
      if (!layer) return;
      pushOperation(
        { type: "set_layer_visible", layerId, visible: !layer.visible },
        { resync: true },
      );
    },
    [pushOperation],
  );

  const moveLayer = useCallback(
    (layerId: string, direction: "up" | "down") => {
      const index = layersRef.current.findIndex((layer) => layer.id === layerId);
      if (index === -1) return;
      const toIndex = direction === "up" ? index + 1 : index - 1;
      if (toIndex < 0 || toIndex > layersRef.current.length - 1) return;
      pushOperation({ type: "move_layer", layerId, toIndex }, { resync: true });
    },
    [pushOperation],
  );

  const exportPNG = useCallback(() => {
    const canvases = layersRef.current
      .filter((layer) => layer.visible)
      .map((layer) => canvasesRef.current.get(layer.id))
      .filter((canvas): canvas is HTMLCanvasElement => canvas !== undefined);
    if (canvases.length === 0) return "";

    const size = documentSizeRef.current;
    return composite(canvases, size.width, size.height);
  }, []);

  const hydrate = useCallback(
    (scene: Scene) => {
      operationsRef.current = scene.operations;
      cursorRef.current = scene.cursor;
      baseIndexRef.current = scene.baseIndex ?? 0;
      strokeCounterRef.current = scene.operations.length;

      documentSizeRef.current = scene.document;
      setDocumentSize(scene.document);
      canvasesRef.current.forEach((canvas) => {
        canvas.width = scene.document.width;
        canvas.height = scene.document.height;
      });

      if (scene.tool) {
        toolRef.current = scene.tool.tool;
        brushSizeRef.current = scene.tool.brushSize;
        brushColorRef.current = scene.tool.brushColor;
        setToolState((prev) => ({
          ...prev,
          tool: scene.tool!.tool,
          brushSize: scene.tool!.brushSize,
          brushColor: scene.tool!.brushColor,
        }));
      }

      // Everything in the scene came from the store, so nothing is owed yet.
      pendingFromRef.current = scene.operations.length;
      syncedCountRef.current = scene.operations.length;
      syncedCursorRef.current = scene.cursor;

      syncFromLog({ keepActive: false, activeOverride: scene.activeLayerId });
    },
    [syncFromLog],
  );

  const takePendingSave = useCallback((): PendingSave | null => {
    const fromIndex = pendingFromRef.current;
    const operations = operationsRef.current.slice(fromIndex);
    const cursor = cursorRef.current;
    if (
      operations.length === 0 &&
      cursor === syncedCursorRef.current &&
      fromIndex === syncedCountRef.current
    ) {
      return null;
    }
    return {
      fromIndex,
      operations,
      cursor,
      activeLayerId: activeLayerIdRef.current,
      tool: currentTool(),
      document: documentSizeRef.current,
    };
  }, [currentTool]);

  const commitSave = useCallback((saved: PendingSave) => {
    const end = saved.fromIndex + saved.operations.length;
    // Leave pendingFrom alone if an undo-then-draw moved it back below what
    // this save covered: those operations still have to go.
    if (pendingFromRef.current === saved.fromIndex) {
      pendingFromRef.current = end;
    }
    syncedCountRef.current = end;
    syncedCursorRef.current = saved.cursor;
  }, []);

  const state = useMemo<DrawingState>(
    () => ({ ...toolState, layers, activeLayerId }),
    [toolState, layers, activeLayerId],
  );

  return {
    surfaceRef,
    pageRef,
    registerLayerCanvas,
    state,
    documentSize,
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
    hydrate,
    revision,
    takePendingSave,
    commitSave,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
  };
}
