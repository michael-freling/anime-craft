import { useCallback, useEffect, useRef, useState } from "react";
import { ListResumableSessions } from "../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/sessionservice.js";
import {
  GetDrawingThumbnail,
  ResumeDrawing,
} from "../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/drawingservice.js";
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
 *
 * Each row shows the drawing itself. Reference titles repeat across sessions,
 * so a list of them alone gives the artist no way to tell one attempt from
 * another.
 */
function ResumeSessions({ onOpen }: ResumeSessionsProps) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const requested = useRef<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
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

  // Previews are fetched once each. A drawing without one yet keeps its
  // placeholder rather than blanking the row.
  useEffect(() => {
    let cancelled = false;
    const missing = sessions.filter(
      (session) => session?.id && !requested.current.has(session.id),
    );
    if (missing.length === 0) return;
    missing.forEach((session) => requested.current.add(session.id));

    Promise.all(
      missing.map((session) =>
        GetDrawingThumbnail(session.id)
          .then((dataUrl: string) => [session.id, dataUrl] as const)
          .catch((e: unknown) => {
            console.error("ResumeSessions: could not load a preview:", e);
            requested.current.delete(session.id);
            return null;
          }),
      ),
    ).then((results) => {
      if (cancelled) return;
      const loaded = results.filter(
        (result): result is readonly [string, string] =>
          result !== null && Boolean(result[1]),
      );
      if (loaded.length === 0) return;
      setThumbnails((prev) => ({ ...prev, ...Object.fromEntries(loaded) }));
    });

    return () => {
      cancelled = true;
    };
  }, [sessions]);

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

  const handleDelete = async (sessionId: string) => {
    setConfirmingId(null);
    setError(null);
    try {
      await discardSession(sessionId);
      requested.current.delete(sessionId);
      await load();
    } catch (e) {
      console.error("ResumeSessions: could not delete the drawing:", e);
      setError(e instanceof Error ? e.message : "Could not delete the drawing");
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
          const confirming = confirmingId === session.id;
          return (
            <li
              key={session.id}
              className="resume-item"
              data-testid={`resume-item-${session.id}`}
            >
              <div className="resume-preview">
                {thumbnails[session.id] ? (
                  <img
                    className="resume-preview-img"
                    src={thumbnails[session.id]}
                    alt={`Drawing from ${session.referenceTitle || "a reference"}`}
                    data-testid={`resume-preview-${session.id}`}
                  />
                ) : (
                  <span className="thumbnail-placeholder">…</span>
                )}
              </div>

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
                {confirming ? (
                  <>
                    <span className="resume-confirm">Delete this drawing?</span>
                    <button
                      className="session-btn session-btn-discard"
                      onClick={() => handleDelete(session.id)}
                      data-testid={`resume-delete-confirm-${session.id}`}
                    >
                      Delete
                    </button>
                    <button
                      className="session-btn session-btn-secondary"
                      onClick={() => setConfirmingId(null)}
                      data-testid={`resume-delete-cancel-${session.id}`}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
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
                    <button
                      className="session-btn session-btn-discard"
                      onClick={() => setConfirmingId(session.id)}
                      data-testid={`resume-delete-${session.id}`}
                      title={
                        submitted
                          ? "Delete this drawing. The session's score and feedback are kept."
                          : "Delete this unfinished drawing"
                      }
                    >
                      Delete
                    </button>
                  </>
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
