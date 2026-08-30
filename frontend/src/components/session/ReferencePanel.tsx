import ReferenceImageViewer from "./ReferenceImageViewer";

export type ReferencePlacement = "panel" | "window" | "hidden";

interface ReferencePanelProps {
  referenceId: string | null;
  placement: ReferencePlacement;
  onPlacementChange: (placement: ReferencePlacement) => void;
  busy: boolean;
  error: string | null;
}

/**
 * The reference beside the drawing, and the two ways to give the drawing more
 * room: send the reference to a window of its own, or put it away entirely.
 *
 * They are one control rather than two toggles because they are the same
 * decision — where the reference should be — and only one answer can hold at a
 * time. A window suits a second screen; hiding suits a single one, where a
 * floating window would cover the drawing it made room for.
 */
function ReferencePanel({
  referenceId,
  placement,
  onPlacementChange,
  busy,
  error,
}: ReferencePanelProps) {
  if (placement !== "panel") {
    const away = placement === "window" ? "in its own window" : "hidden";
    return (
      <div className="session-reference-away" data-testid="reference-away">
        <button
          className="toolbar-btn"
          onClick={() => onPlacementChange("panel")}
          disabled={busy}
          data-testid="reference-show-here"
          title="Put the reference back beside the drawing"
        >
          Reference {away} — show it here
        </button>
        {error && (
          <p className="home-error" data-testid="reference-placement-error">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="session-reference" data-testid="reference-panel">
      <div className="session-panel-header">
        <h3 className="session-panel-title">Reference</h3>
        <div className="session-panel-actions">
          <button
            className="toolbar-btn"
            onClick={() => onPlacementChange("window")}
            disabled={busy || !referenceId}
            data-testid="reference-open-window"
            title="Move the reference to a window of its own, which you can put on another screen"
          >
            Open in a window
          </button>
          <button
            className="toolbar-btn"
            onClick={() => onPlacementChange("hidden")}
            disabled={busy}
            data-testid="reference-hide"
            title="Put the reference away and give the drawing the whole window"
          >
            Hide
          </button>
        </div>
      </div>

      {error && (
        <p className="home-error" data-testid="reference-placement-error">
          {error}
        </p>
      )}

      {referenceId ? (
        <ReferenceImageViewer referenceId={referenceId} />
      ) : (
        <div className="session-loading" data-testid="session-loading">
          Loading session...
        </div>
      )}
    </div>
  );
}

export default ReferencePanel;
