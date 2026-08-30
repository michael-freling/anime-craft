/**
 * What a window is for.
 *
 * A second window loads the same frontend and says what it is for in the query
 * string. It has to be the query rather than a path: the asset server serves
 * files and answers anything it does not recognise with a 404, so a route like
 * /reference/ref-001 would never reach the app, while the query is left alone
 * and "/" is served as usual.
 */
export type WindowTarget =
  | { kind: "app" }
  | { kind: "reference"; referenceId: string };

export function windowTargetFrom(search: string): WindowTarget {
  const params = new URLSearchParams(search);
  if (params.get("window") !== "reference") return { kind: "app" };

  const referenceId = params.get("referenceId");
  // A reference window with nothing to show is not one; falling back to the
  // app is better than an empty window with no way out of it.
  if (!referenceId) return { kind: "app" };

  return { kind: "reference", referenceId };
}
