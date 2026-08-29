import { useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDrawingCanvas } from "../hooks/useDrawingCanvas";
import type { PendingSave } from "../hooks/useDrawingCanvas";
import { useDrawingAutosave } from "../hooks/useDrawingAutosave";
import { useDrawingShortcuts } from "../hooks/useDrawingShortcuts";
import { parseScene } from "../drawing/document";
import { SessionProvider, useSession } from "../contexts/SessionContext";
import DrawingCanvas from "../components/drawing/DrawingCanvas";
import ToolBar from "../components/drawing/ToolBar";
import LayerPanel from "../components/drawing/LayerPanel";
import SaveIndicator from "../components/drawing/SaveIndicator";
import SessionControls from "../components/session/SessionControls";
import ReferenceImageViewer from "../components/session/ReferenceImageViewer";
import { GetSession } from "../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/sessionservice.js";
import {
  ExportDrawingFile,
  FlushDrawingDocument,
  LoadDrawingDocument,
  SaveDrawing,
  SaveDrawingOperations,
} from "../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/drawingservice.js";
import { EndSession } from "../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/sessionservice.js";
import { discardSession } from "../session/discard";
import { GetReference } from "../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/referenceservice.js";

function SessionPageInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state: sessionState, dispatch } = useSession();
  const {
    surfaceRef,
    pageRef,
    registerLayerCanvas,
    state: drawingState,
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
  } = useDrawingCanvas();

  const [restored, setRestored] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const saveOperations = useCallback(
    async (pending: PendingSave) => {
      if (!id) return;
      await SaveDrawingOperations(id, JSON.stringify(pending));
      commitSave(pending);
    },
    [id, commitSave],
  );

  const autosave = useDrawingAutosave<PendingSave>({
    revision,
    getPending: takePendingSave,
    save: saveOperations,
    // Nothing may be saved before the drawing on disk has been restored, or
    // an empty editor would overwrite the work being loaded.
    enabled: Boolean(id) && restored,
  });

  useDrawingShortcuts({ onSetTool: setTool, onUndo: undo, onRedo: redo });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    GetSession(id).then((session) => {
      if (cancelled) return;
      GetReference(session.referenceImageId).then((ref) => {
        if (cancelled) return;
        dispatch({
          type: "START_SESSION",
          sessionId: session.id,
          referenceImageId: ref.id,
          exerciseMode: session.exerciseMode,
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [id, dispatch]);

  // Put the saved drawing back before anything can be saved over it.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    LoadDrawingDocument(id)
      .then((raw: string) => {
        if (cancelled) return;
        const scene = parseScene(raw);
        if (scene) hydrate(scene);
      })
      .catch((e: unknown) => {
        console.error("SessionPage: could not restore the drawing:", e);
      })
      .finally(() => {
        if (!cancelled) setRestored(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id, hydrate]);

  // Leaving the drawing is when the home screen next shows it, and the
  // preview it shows lives in the checkpoint. Autosave alone only appends to
  // the journal, which could leave the preview several strokes behind.
  const flushRef = useRef(autosave.flush);
  flushRef.current = autosave.flush;
  useEffect(() => {
    if (!id) return;
    return () => {
      flushRef
        .current()
        .then(() => FlushDrawingDocument(id))
        .catch((e: unknown) => {
          console.error("SessionPage: could not flush the drawing:", e);
        });
    };
  }, [id]);

  // Timer tick
  useEffect(() => {
    if (sessionState.status !== "drawing") return;
    const interval = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(interval);
  }, [sessionState.status, dispatch]);

  const handleSubmit = useCallback(async () => {
    if (!id) return;
    dispatch({ type: "SUBMIT_START" });
    // The last strokes have to reach the store before the drawing is graded.
    await autosave.flush();
    const base64Data = exportPNG();
    await SaveDrawing(id, base64Data);
    await EndSession(id);
    dispatch({ type: "SUBMIT_COMPLETE" });
    navigate(`/session/${id}/feedback`);
  }, [id, dispatch, autosave, exportPNG, navigate]);

  const handleDiscard = useCallback(async () => {
    if (id) {
      // A failure here costs an abandoned session on the resume list, which
      // is not worth trapping the artist on the page for.
      await discardSession(id).catch((e: unknown) => {
        console.error("SessionPage: could not discard the session:", e);
      });
    }
    dispatch({ type: "DISCARD" });
    navigate("/");
  }, [id, dispatch, navigate]);

  const handleExport = useCallback(async () => {
    if (!id) return;
    try {
      const { Dialogs } = await import("@wailsio/runtime");
      const destPath = await Dialogs.SaveFile({
        Title: "Save a copy of this drawing",
        Filename: "practice.ora",
        Filters: [{ DisplayName: "OpenRaster drawing", Pattern: "*.ora" }],
      });
      if (!destPath) return;

      await autosave.flush();
      const written = await ExportDrawingFile(id, destPath);
      setExportMessage(`Saved a copy to ${written}`);
    } catch (e) {
      console.error("SessionPage: export failed:", e);
      setExportMessage(e instanceof Error ? e.message : "Could not save a copy");
    }
  }, [id, autosave]);

  const referenceImageId = sessionState.referenceImageId;

  return (
    <div className="session-page" data-testid="session-page">
      <div className="session-split">
        <div className="session-reference">
          <h3 className="session-panel-title">Reference</h3>
          {referenceImageId ? (
            <ReferenceImageViewer referenceId={referenceImageId} />
          ) : (
            <div className="session-loading" data-testid="session-loading">
              Loading session...
            </div>
          )}
        </div>
        <div className="session-drawing">
          <ToolBar
            state={drawingState}
            onSetTool={setTool}
            onSetBrushSize={setBrushSize}
            onSetBrushColor={setBrushColor}
            onUndo={undo}
            onRedo={redo}
          />
          <div className="canvas-with-layers">
            <DrawingCanvas
              surfaceRef={surfaceRef}
              pageRef={pageRef}
              registerLayerCanvas={registerLayerCanvas}
              layers={drawingState.layers}
              tool={drawingState.tool}
              documentSize={documentSize}
            />
            <LayerPanel
              layers={drawingState.layers}
              activeLayerId={drawingState.activeLayerId}
              onAddLayer={addLayer}
              onRemoveLayer={removeLayer}
              onSelectLayer={selectLayer}
              onToggleVisibility={toggleLayerVisibility}
              onMoveLayer={moveLayer}
            />
          </div>
          {exportMessage && (
            <p className="session-export-message" data-testid="export-message">
              {exportMessage}
            </p>
          )}
          <SessionControls
            elapsedSeconds={sessionState.elapsedSeconds}
            onSubmit={handleSubmit}
            onDiscard={handleDiscard}
            onExport={handleExport}
            isSubmitting={sessionState.status === "submitting"}
            saveIndicator={
              <SaveIndicator
                status={autosave.status}
                lastSavedAt={autosave.lastSavedAt}
                error={autosave.error}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}

function SessionPage() {
  return (
    <SessionProvider>
      <SessionPageInner />
    </SessionProvider>
  );
}

export default SessionPage;
