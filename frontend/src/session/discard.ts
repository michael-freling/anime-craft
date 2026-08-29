import { DiscardSession } from "../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/sessionservice.js";
import { DeleteDrawingDocument } from "../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/drawingservice.js";

/**
 * Discarding takes an unfinished session off the resume list and throws away
 * the drawing autosave has been keeping for it. Both halves belong together:
 * leaving the files behind would grow the data directory for every abandoned
 * session with nothing left in the app able to reach them.
 *
 * Discard is offered from the session itself and from the home screen, so it
 * is defined once here rather than at each button.
 */
export async function discardSession(sessionId: string): Promise<void> {
  await DiscardSession(sessionId);
  await DeleteDrawingDocument(sessionId);
}
