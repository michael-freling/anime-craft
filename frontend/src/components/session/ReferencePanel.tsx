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
 *
 * Once the reference is elsewhere this renders nothing at all: a panel saying
 * the panel is empty would keep the very room it was asked to give up. The way
 * back is ReferenceAwayControl, which rides along in the toolbar.
 */
function ReferencePanel({
  referenceId,
  placement,
  onPlacementChange,
  busy,
  error,
}: ReferencePanelProps) {
  if (placement !== "panel") return null;

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

interface ReferenceAwayControlProps {
  placement: ReferencePlacement;
  onShowHere: () => void;
  busy: boolean;
  error: string | null;
}

/**
 * The way back, for when the reference is elsewhere.
 *
 * It belongs in a row that already exists — the toolbar — so that giving the
 * reference away really does give the drawing the space, rather than trading a
 * panel for a slightly smaller panel. Where the reference went is in the
 * tooltip rather than the label: the button does the same thing either way,
 * and a longer label would start eating the room again.
 */
function ReferenceAwayControl({
  placement,
  onShowHere,
  busy,
  error,
}: ReferenceAwayControlProps) {
  const where =
    placement === "window"
      ? "The reference is in its own window"
      : "The reference is hidden";

  return (
    <div className="reference-away" data-testid="reference-away">
      {error && (
        <span
          className="reference-away-error"
          data-testid="reference-placement-error"
        >
          {error}
        </span>
      )}
      <button
        className="toolbar-btn"
        onClick={onShowHere}
        disabled={busy}
        data-testid="reference-show-here"
        title={`${where} — put it back beside the drawing`}
      >
        Show reference
      </button>
    </div>
  );
}

export { ReferenceAwayControl };
export default ReferencePanel;
