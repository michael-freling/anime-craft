interface SessionControlsProps {
  elapsedSeconds: number;
  onSubmit: () => void;
  onDiscard: () => void;
  isSubmitting: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function SessionControls({
  elapsedSeconds,
  onSubmit,
  onDiscard,
  isSubmitting,
}: SessionControlsProps) {
  return (
    <div className="session-controls" data-testid="session-controls">
      <span className="session-timer" data-testid="session-timer">
        {formatTime(elapsedSeconds)}
      </span>
      <button
        className="session-btn session-btn-submit"
        onClick={onSubmit}
        disabled={isSubmitting}
        data-testid="submit-btn"
      >
        {isSubmitting ? "Submitting..." : "Submit"}
      </button>
      <button
        className="session-btn session-btn-discard"
        onClick={onDiscard}
        disabled={isSubmitting}
        data-testid="discard-btn"
      >
        Discard
      </button>
    </div>
  );
}

export default SessionControls;
