import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useCallback } from "react";
import { useDrawingCanvas } from "../hooks/useDrawingCanvas";
import { SessionProvider, useSession } from "../contexts/SessionContext";
import DrawingCanvas from "../components/drawing/DrawingCanvas";
import ToolBar from "../components/drawing/ToolBar";
import SessionControls from "../components/session/SessionControls";
import ReferenceImageViewer from "../components/session/ReferenceImageViewer";
import { GetSession } from "../../bindings/github.com/michael-freling/anime-craft/internal/bff/sessionservice.js";
import { SaveDrawing } from "../../bindings/github.com/michael-freling/anime-craft/internal/bff/drawingservice.js";
import { EndSession } from "../../bindings/github.com/michael-freling/anime-craft/internal/bff/sessionservice.js";
import { GetReference } from "../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js";

function SessionPageInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state: sessionState, dispatch } = useSession();
  const {
    canvasRef,
    state: drawingState,
    setTool,
    setBrushSize,
    setBrushColor,
    undo,
    redo,
    clear,
    exportPNG,
  } = useDrawingCanvas();

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

  // Timer tick
  useEffect(() => {
    if (sessionState.status !== "drawing") return;
    const interval = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(interval);
  }, [sessionState.status, dispatch]);

  const handleSubmit = useCallback(async () => {
    if (!id) return;
    dispatch({ type: "SUBMIT_START" });
    const base64Data = exportPNG();
    await SaveDrawing(id, base64Data);
    await EndSession(id);
    dispatch({ type: "SUBMIT_COMPLETE" });
    navigate(`/session/${id}/feedback`);
  }, [id, dispatch, exportPNG, navigate]);

  const handleDiscard = useCallback(() => {
    dispatch({ type: "DISCARD" });
    navigate("/");
  }, [dispatch, navigate]);

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
            onClear={clear}
          />
          <DrawingCanvas canvasRef={canvasRef} tool={drawingState.tool} />
          <SessionControls
            elapsedSeconds={sessionState.elapsedSeconds}
            onSubmit={handleSubmit}
            onDiscard={handleDiscard}
            isSubmitting={sessionState.status === "submitting"}
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
