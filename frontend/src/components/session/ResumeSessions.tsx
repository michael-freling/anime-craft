import { useCallback, useEffect, useState } from "react";
import { ListResumableSessions } from "../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/sessionservice.js";
import { ResumeDrawing } from "../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/drawingservice.js";
import { discardSession } from "../../session/discard";

interface ResumeSessionsProps {
  onOpen: (sessionId: string) => void;
}

function formatWhen(value: unknown): string {
  if (!value) return "recently";
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return "recently";

  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return date.toLocaleDateString();
}

/**
 * Every drawing saves itself as it is made, so none of them are ever lost —
 * they are waiting here. Submitted drawings are listed alongside unfinished
 * ones: finishing a session should not be the moment a drawing becomes
 * unreachable.
 */
function ResumeSessions({ onOpen }: ResumeSessionsProps) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      ListResumableSessions(8)
        .then((result) => setSessions(result ?? []))
        .catch((e: unknown) => {
          console.error("ResumeSessions: could not list drawings:", e);
          setError(e instanceof Error ? e.message : "Could not load drawings");
        }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    ListResumableSessions(8)
      .then((result) => {
        if (!cancelled) setSessions(result ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error("ResumeSessions: could not list drawings:", e);
        setError(e instanceof Error ? e.message : "Could not load drawings");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Which session to open is the backend's call: an unfinished one is picked
  // up where it was left, a submitted one is continued in a fresh attempt.
  const handleOpen = async (sessionId: string) => {
    setBusyId(sessionId);
    setError(null);
    try {
      const session = await ResumeDrawing(sessionId);
      onOpen(session.id);
    } catch (e) {
      console.error("ResumeSessions: could not open the drawing:", e);
      setError(e instanceof Error ? e.message : "Could not open the drawing");
      setBusyId(null);
    }
  };

  const handleDiscard = async (sessionId: string) => {
    setError(null);
    try {
      await discardSession(sessionId);
      await load();
    } catch (e) {
      console.error("ResumeSessions: could not discard the session:", e);
      setError(e instanceof Error ? e.message : "Could not discard the session");
    }
  };

  if (error && sessions.length === 0) {
    return (
      <p className="home-error" data-testid="resume-sessions-error">
        {error}
      </p>
    );
  }

  if (sessions.length === 0) return null;

  return (
    <div className="resume-sessions" data-testid="resume-sessions">
      <h3>Your drawings</h3>
      {error && (
        <p className="home-error" data-testid="resume-sessions-error">
          {error}
        </p>
      )}
      <ul className="resume-list">
        {sessions.map((session) => {
          const submitted = session.status === "completed";
          return (
            <li
              key={session.id}
              className="resume-item"
              data-testid={`resume-item-${session.id}`}
            >
              <div className="resume-details">
                <span className="resume-title">
                  {session.referenceTitle || "Untitled reference"}
                </span>
                <span className="resume-meta">
                  <span
                    className={`resume-status resume-status-${submitted ? "submitted" : "unfinished"}`}
                    data-testid={`resume-status-${session.id}`}
                  >
                    {submitted ? "Submitted" : "Unfinished"}
                  </span>
                  {session.operationCount} change
                  {session.operationCount === 1 ? "" : "s"} · saved{" "}
                  {formatWhen(session.lastSavedAt)}
                </span>
              </div>
              <div className="resume-actions">
                <button
                  className="session-btn session-btn-submit"
                  onClick={() => handleOpen(session.id)}
                  disabled={busyId === session.id}
                  data-testid={`resume-btn-${session.id}`}
                  title={
                    submitted
                      ? "Carry on from this drawing in a new session, leaving the submitted one and its feedback as they are"
                      : "Pick this session up where you left it"
                  }
                >
                  {busyId === session.id
                    ? "Opening..."
                    : submitted
                      ? "Keep drawing"
                      : "Resume"}
                </button>
                {!submitted && (
                  <button
                    className="session-btn session-btn-discard"
                    onClick={() => handleDiscard(session.id)}
                    data-testid={`resume-discard-${session.id}`}
                  >
                    Discard
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ResumeSessions;
