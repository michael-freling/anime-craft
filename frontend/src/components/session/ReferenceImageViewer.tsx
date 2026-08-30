import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  GetReference,
  GetReferenceImageData,
} from "../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/referenceservice.js";

interface ReferenceImageViewerProps {
  referenceId: string;
}

// Fitting the frame is the floor: zooming out past it would only add empty
// space around an image that is already whole. The ceiling is where a
// reference stops being a reference and becomes pixels.
const MIN_SCALE = 1;
const MAX_SCALE = 8;
const STEP = 1.4;
const KEY_PAN = 48;

interface View {
  scale: number;
  x: number;
  y: number;
}

const FIT: View = { scale: 1, x: 0, y: 0 };

interface Size {
  width: number;
  height: number;
}

/**
 * Where the picture actually sits inside the element it is drawn in. A
 * reference rarely has the frame's proportions, so it is letterboxed: the
 * limits below are the picture's own edges, not the element's, or it could be
 * dragged off into the empty band beside itself.
 */
function pictureIn(frame: Size, natural: Size | null) {
  if (!natural?.width || !natural.height || !frame.width || !frame.height) {
    // Before the image has loaded there is nothing better to go on.
    return { size: frame, inset: { width: 0, height: 0 } };
  }
  const fitted = Math.min(frame.width / natural.width, frame.height / natural.height);
  const size = {
    width: natural.width * fitted,
    height: natural.height * fitted,
  };
  return {
    size,
    inset: {
      width: (frame.width - size.width) / 2,
      height: (frame.height - size.height) / 2,
    },
  };
}

/**
 * Keeps the picture inside the frame: no scale past the limits, and no
 * dragging it off the edge until there is nothing left to look at.
 */
function settle(view: View, frame: Size, natural: Size | null): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale));
  const { size, inset } = pictureIn(frame, natural);
  return {
    scale,
    x: onAxis(view.x, frame.width, size.width * scale, inset.width * scale),
    y: onAxis(view.y, frame.height, size.height * scale, inset.height * scale),
  };
}

function onAxis(
  offset: number,
  frame: number,
  picture: number,
  inset: number,
): number {
  // Smaller than the frame there is nowhere to pan to, so it sits centred.
  if (picture <= frame) return (frame - picture) / 2 - inset;
  return Math.min(-inset, Math.max(frame - picture - inset, offset));
}

/**
 * The reference, zoomable and pannable.
 *
 * A reference is looked at closely — the turn of a wrist, how an eye meets a
 * nose — so seeing it whole is a starting point, not the whole job. The wheel
 * zooms where the pointer is, because that is the detail being looked at;
 * dragging moves the picture once there is more of it than frame.
 */
function ReferenceImageViewer({ referenceId }: ReferenceImageViewerProps) {
  const [title, setTitle] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(FIT);
  const [natural, setNatural] = useState<Size | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTitle(null);
    setImageDataUrl(null);
    // A different reference starts whole again; the old zoom meant nothing here.
    setView(FIT);
    setNatural(null);

    Promise.all([GetReference(referenceId), GetReferenceImageData(referenceId)])
      .then(([ref, dataUrl]) => {
        if (!cancelled) {
          setTitle(ref.title);
          setImageDataUrl(dataUrl);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load reference");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [referenceId]);

  const frameSize = useCallback((): Size => {
    const el = frameRef.current;
    if (!el) return { width: 0, height: 0 };
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }, []);

  const move = useCallback(
    (next: (current: View) => View) => {
      const frame = frameSize();
      setView((current) => settle(next(current), frame, natural));
    },
    [frameSize, natural],
  );

  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      move((current) => {
        const scale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, current.scale * factor),
        );
        // Hold whatever is under (px, py) still while the rest grows around it.
        const k = scale / current.scale;
        return {
          scale,
          x: px - (px - current.x) * k,
          y: py - (py - current.y) * k,
        };
      });
    },
    [move],
  );

  const zoomFromCentre = useCallback(
    (factor: number) => {
      const { width, height } = frameSize();
      zoomAt(factor, width / 2, height / 2);
    },
    [frameSize, zoomAt],
  );

  // Wheel is bound by hand because it has to be cancellable: left to the
  // browser it scrolls the page behind the reference instead of zooming it.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(
        Math.exp(-e.deltaY * 0.002),
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, imageDataUrl]);

  // Resizing the window changes how much frame there is, which can leave a
  // pan that was in range out of it.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setView((current) =>
        settle(current, { width: rect.width, height: rect.height }, natural),
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [imageDataUrl, natural]);

  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (view.scale <= MIN_SCALE) return;
    // Optional: not every environment the app is rendered in has capture.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const onDrag = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    move((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "+":
      case "=":
        zoomFromCentre(STEP);
        break;
      case "-":
      case "_":
        zoomFromCentre(1 / STEP);
        break;
      case "0":
        setView(FIT);
        break;
      case "ArrowLeft":
        move((c) => ({ ...c, x: c.x + KEY_PAN }));
        break;
      case "ArrowRight":
        move((c) => ({ ...c, x: c.x - KEY_PAN }));
        break;
      case "ArrowUp":
        move((c) => ({ ...c, y: c.y + KEY_PAN }));
        break;
      case "ArrowDown":
        move((c) => ({ ...c, y: c.y - KEY_PAN }));
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  if (error) {
    return (
      <div className="session-loading" data-testid="reference-error">
        {error}
      </div>
    );
  }

  if (!title || !imageDataUrl) {
    return (
      <div className="session-loading" data-testid="reference-loading">
        Loading reference...
      </div>
    );
  }

  const zoomed = view.scale > MIN_SCALE;

  return (
    <div
      className="reference-viewer"
      data-testid="reference-viewer"
      data-zoomed={zoomed ? "true" : "false"}
      ref={frameRef}
      tabIndex={0}
      onPointerDown={startDrag}
      onPointerMove={onDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => setView(FIT)}
      onKeyDown={onKeyDown}
    >
      <img
        className="session-reference-img"
        data-testid="reference-image"
        src={imageDataUrl}
        alt={title}
        draggable={false}
        onLoad={(e) =>
          setNatural({
            width: e.currentTarget.naturalWidth,
            height: e.currentTarget.naturalHeight,
          })
        }
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
      />

      {/* Floating, so the controls cost the reference no room of its own. */}
      <div
        className="reference-zoom"
        data-testid="reference-zoom"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button
          className="reference-zoom-btn"
          onClick={() => zoomFromCentre(1 / STEP)}
          disabled={!zoomed}
          data-testid="reference-zoom-out"
          title="Zoom out (−)"
          aria-label="Zoom out"
        >
          &minus;
        </button>
        <span className="reference-zoom-level" data-testid="reference-zoom-level">
          {Math.round(view.scale * 100)}%
        </span>
        <button
          className="reference-zoom-btn"
          onClick={() => zoomFromCentre(STEP)}
          disabled={view.scale >= MAX_SCALE}
          data-testid="reference-zoom-in"
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          className="reference-zoom-btn reference-zoom-fit"
          onClick={() => setView(FIT)}
          disabled={!zoomed}
          data-testid="reference-zoom-fit"
          title="Show the whole reference again (0, or double-click)"
        >
          Fit
        </button>
      </div>
    </div>
  );
}

export default ReferenceImageViewer;
