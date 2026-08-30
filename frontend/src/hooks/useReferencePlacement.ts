import { useCallback, useEffect, useRef, useState } from "react";
import type { ReferencePlacement } from "../components/session/ReferencePanel";
import {
  CloseReferenceWindow,
  IsReferenceWindowOpen,
  OpenReferenceWindow,
} from "../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/referencewindowservice.js";

/** Matches ReferenceWindowClosedEvent in gateway/cmd/anime-craft. */
const WINDOW_CLOSED_EVENT = "reference-window:closed";

interface ReferencePlacementResult {
  placement: ReferencePlacement;
  setPlacement: (placement: ReferencePlacement) => void;
  busy: boolean;
  error: string | null;
}

/**
 * Where the reference is being shown, and keeping that in step with a window
 * the artist can close from its own title bar.
 *
 * The window is the one part of this the editor cannot see for itself, so the
 * app announces when it goes and the panel comes back rather than the editor
 * being left claiming the reference is somewhere it is not.
 */
export function useReferencePlacement(
  referenceId: string | null,
): ReferencePlacementResult {
  const [placement, setPlacementState] = useState<ReferencePlacement>("panel");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // A session opened while the window is already up should lay itself out for
  // that, rather than showing the reference twice.
  useEffect(() => {
    let cancelled = false;
    IsReferenceWindowOpen()
      .then((open: boolean) => {
        if (!cancelled && open) setPlacementState("window");
      })
      .catch(() => {
        // A build with no second window is not worth reporting; the panel is
        // the right answer either way.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;

    // Imported lazily, the way the rest of the app touches the Wails runtime,
    // to avoid its module-load side effects racing startup in dev mode.
    import("@wailsio/runtime")
      .then(({ Events }) => {
        if (cancelled) return;
        off = Events.On(WINDOW_CLOSED_EVENT, () => {
          if (mountedRef.current) setPlacementState("panel");
        });
      })
      .catch((e: unknown) => {
        console.error("useReferencePlacement: could not listen for the window:", e);
      });

    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  // Leaving the drawing takes the window with it: a reference floating above
  // everything else, for a session no longer open, is only in the way.
  useEffect(() => {
    return () => {
      CloseReferenceWindow().catch((e: unknown) => {
        console.error("useReferencePlacement: could not close the window:", e);
      });
    };
  }, []);

  const setPlacement = useCallback(
    async (next: ReferencePlacement) => {
      setBusy(true);
      setError(null);
      try {
        if (next === "window") {
          if (!referenceId) return;
          await OpenReferenceWindow(referenceId);
        } else {
          await CloseReferenceWindow();
        }
        if (mountedRef.current) setPlacementState(next);
      } catch (e) {
        console.error("useReferencePlacement: could not move the reference:", e);
        if (mountedRef.current) {
          setError(
            e instanceof Error ? e.message : "Could not move the reference",
          );
        }
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [referenceId],
  );

  return { placement, setPlacement, busy, error };
}
