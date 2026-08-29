import { DiscardSession } from "../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/sessionservice.js";
import { DeleteDrawingDocument } from "../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/drawingservice.js";

/**
 * Throws away the drawing autosave has been keeping for a session, and marks
 * the session abandoned if it was still unfinished. Both halves belong
 * together: leaving the files behind would grow the data directory for every
 * abandoned session with nothing left in the app able to reach them.
 *
 * A session that was already submitted keeps its score and its feedback —
 * deleting the drawing removes what can be drawn on again, not the record of
 * having practised.
 *
 * This backs Discard in the session and Delete on the home screen, so it is
 * defined once here rather than at each button.
 */
export async function discardSession(sessionId: string): Promise<void> {
  await DiscardSession(sessionId);
  await DeleteDrawingDocument(sessionId);
}
