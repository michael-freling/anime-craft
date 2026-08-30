import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface AutosaveOptions<T> {
  /** Changes whenever the drawing changes. */
  revision: number;
  /** Returns what still has to be saved, or null when the store is current. */
  getPending: () => T | null;
  save: (pending: T) => Promise<void>;
  /** Saving is off until the session is known. */
  enabled?: boolean;
  /** Quiet time after the last change before a save goes out. */
  debounceMs?: number;
  /** How long an unsaved change may wait, however busy the artist is. */
  maxDelayMs?: number;
  retryDelayMs?: number;
}

export interface AutosaveResult {
  status: SaveStatus;
  lastSavedAt: number | null;
  error: string | null;
  /** Saves right now and waits for it — used when leaving the drawing. */
  flush: () => Promise<void>;
}

/**
 * Saving while drawing has to be invisible: often enough that nothing is ever
 * lost, rarely enough that it never interrupts a stroke.
 *
 * A save goes out once the artist pauses (the debounce), and at the latest
 * after maxDelayMs of continuous drawing, so someone sketching without a break
 * is still covered. Only one save is in flight at a time; anything that
 * changes while one is out goes with the next.
 */
export function useDrawingAutosave<T>({
  revision,
  getPending,
  save,
  enabled = true,
  debounceMs = 1200,
  maxDelayMs = 10000,
  retryDelayMs = 5000,
}: AutosaveOptions<T>): AutosaveResult {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtySinceRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const seenRevisionRef = useRef(revision);
  const mountedRef = useRef(true);

  // Kept in refs so the timer callbacks never close over a stale render.
  const getPendingRef = useRef(getPending);
  getPendingRef.current = getPending;
  const saveRef = useRef(save);
  saveRef.current = save;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const runRef = useRef<() => Promise<void>>(async () => {});
  const scheduleRef = useRef<(delayOverride?: number) => void>(() => {});

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const schedule = useCallback(
    (delayOverride?: number) => {
      if (!enabledRef.current) return;
      clearTimer();

      const now = Date.now();
      if (dirtySinceRef.current === null) {
        dirtySinceRef.current = now;
      }
      const waited = now - dirtySinceRef.current;
      const delay =
        delayOverride ?? Math.max(0, Math.min(debounceMs, maxDelayMs - waited));

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void runRef.current();
      }, delay);
    },
    [clearTimer, debounceMs, maxDelayMs],
  );
  scheduleRef.current = schedule;

  const run = useCallback(async (): Promise<void> => {
    if (!enabledRef.current) return;
    if (inFlightRef.current) {
      // Wait for the save already going out, then let it decide whether
      // anything is still outstanding.
      await inFlightPromiseRef.current?.catch(() => undefined);
      if (inFlightRef.current) return;
    }

    const pending = getPendingRef.current();
    if (!pending) {
      dirtySinceRef.current = null;
      return;
    }

    inFlightRef.current = true;
    if (mountedRef.current) setStatus("saving");

    const promise = saveRef.current(pending);
    inFlightPromiseRef.current = promise;
    try {
      await promise;
      dirtySinceRef.current = null;
      if (mountedRef.current) {
        setError(null);
        setLastSavedAt(Date.now());
        setStatus("saved");
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : "Could not save the drawing");
        setStatus("error");
        // The work is still in the editor, so try again rather than drop it.
        scheduleRef.current(retryDelayMs);
      }
      return;
    } finally {
      inFlightRef.current = false;
      inFlightPromiseRef.current = null;
    }

    // Strokes drawn while that save was out still have to go.
    if (mountedRef.current && getPendingRef.current()) {
      scheduleRef.current();
    }
  }, [retryDelayMs]);
  runRef.current = run;

  useEffect(() => {
    if (revision === seenRevisionRef.current) return;
    seenRevisionRef.current = revision;
    scheduleRef.current();
  }, [revision]);

  // Closing the window is the one moment a debounce would lose work.
  useEffect(() => {
    const onLeaving = () => {
      clearTimer();
      void runRef.current();
    };
    window.addEventListener("pagehide", onLeaving);
    return () => window.removeEventListener("pagehide", onLeaving);
  }, [clearTimer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      void runRef.current();
    };
  }, [clearTimer]);

  const flush = useCallback(async () => {
    clearTimer();
    await run();
  }, [clearTimer, run]);

  return { status, lastSavedAt, error, flush };
}
