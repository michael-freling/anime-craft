import type { SaveStatus } from "../../hooks/useDrawingAutosave";

interface SaveIndicatorProps {
  status: SaveStatus;
  lastSavedAt: number | null;
  error: string | null;
}

function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Autosave is only reassuring if the artist can see it happening. This says
 * what the app has actually written, and says so plainly when it could not.
 */
function SaveIndicator({ status, lastSavedAt, error }: SaveIndicatorProps) {
  if (status === "error") {
    return (
      <span
        className="save-indicator save-indicator-error"
        data-testid="save-indicator"
        title={error ?? undefined}
        role="status"
      >
        Not saved — retrying
      </span>
    );
  }

  if (status === "saving") {
    return (
      <span className="save-indicator" data-testid="save-indicator" role="status">
        Saving…
      </span>
    );
  }

  if (lastSavedAt === null) {
    return (
      <span className="save-indicator" data-testid="save-indicator" role="status">
        Saves as you draw
      </span>
    );
  }

  return (
    <span className="save-indicator" data-testid="save-indicator" role="status">
      Saved {formatClock(lastSavedAt)}
    </span>
  );
}

export default SaveIndicator;
