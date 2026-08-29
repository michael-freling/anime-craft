import { useCallback, useEffect, useState } from "react";
import { ListResumableSessions } from "../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/sessionservice.js";
import { DiscardSession } from "../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/sessionservice.js";

interface ResumeSessionsProps {
  onResume: (sessionId: string) => void;
}

function formatWhen(value: unknown): string {
  if (!value) return "not started yet";
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
 * Because every session saves itself as it is drawn, an unfinished one is
 * never lost — it is just waiting here.
 */
function ResumeSessions({ onResume }: ResumeSessionsProps) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      ListResumableSessions(6)
        .then((result) => setSessions(result ?? []))
        .catch((e: unknown) => {
          console.error("ResumeSessions: could not list sessions:", e);
          setError(e instanceof Error ? e.message : "Could not load sessions");
        }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    ListResumableSessions(6)
      .then((result) => {
        if (!cancelled) setSessions(result ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error("ResumeSessions: could not list sessions:", e);
        setError(e instanceof Error ? e.message : "Could not load sessions");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDiscard = async (sessionId: string) => {
    try {
      await DiscardSession(sessionId);
      await load();
    } catch (e) {
      console.error("ResumeSessions: could not discard the session:", e);
      setError(e instanceof Error ? e.message : "Could not discard the session");
    }
  };

  if (error) {
    return (
      <p className="home-error" data-testid="resume-sessions-error">
        {error}
      </p>
    );
  }

  if (sessions.length === 0) return null;

  return (
    <div className="resume-sessions" data-testid="resume-sessions">
      <h3>Continue drawing</h3>
      <ul className="resume-list">
        {sessions.map((session) => (
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
                {session.operationCount} change
                {session.operationCount === 1 ? "" : "s"} · saved{" "}
                {formatWhen(session.lastSavedAt)}
              </span>
            </div>
            <div className="resume-actions">
              <button
                className="session-btn session-btn-submit"
                onClick={() => onResume(session.id)}
                data-testid={`resume-btn-${session.id}`}
              >
                Resume
              </button>
              <button
                className="session-btn session-btn-discard"
                onClick={() => handleDiscard(session.id)}
                data-testid={`resume-discard-${session.id}`}
              >
                Discard
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ResumeSessions;
