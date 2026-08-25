import { useEffect } from "react";
import type { Tool } from "./useDrawingCanvas";

interface DrawingShortcuts {
  onSetTool: (tool: Tool) => void;
  onUndo: () => void;
  onRedo: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Keyboard shortcuts for the drawing surface:
 *   B                      brush
 *   E                      eraser
 *   Ctrl/Cmd+Z             undo
 *   Ctrl/Cmd+Shift+Z, Ctrl+Y  redo
 */
export function useDrawingShortcuts({
  onSetTool,
  onUndo,
  onRedo,
}: DrawingShortcuts): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const modifier = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (modifier && key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }

      if (modifier && key === "y") {
        e.preventDefault();
        onRedo();
        return;
      }

      // Plain letters only, so Ctrl+B and friends stay available.
      if (modifier || e.altKey) return;

      if (key === "b") {
        onSetTool("brush");
      } else if (key === "e") {
        onSetTool("eraser");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSetTool, onUndo, onRedo]);
}
