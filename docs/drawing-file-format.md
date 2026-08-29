# Saving drawings

A practice session saves itself while it is drawn, and can be picked back up
later — with its layers, its vector strokes, its undo history and the reference
image it was drawn from.

This describes what is written, where, and why it is shaped this way.

## The file format: OpenRaster

A saved drawing is an [OpenRaster](https://www.openraster.org/) file (`.ora`) —
the open, ZIP-based interchange format that Krita, MyPaint, GIMP and Drawpile
all read and write. It was chosen over the alternatives because it is the only
widely supported open format that carries a **layer stack**, which this app's
drawings have and a flat PNG cannot express. SVG has no layer or eraser
semantics to speak of; PSD and `.kra` are far larger specifications with no
practical benefit here.

A file written by Anime Craft is a conforming OpenRaster archive:

```
mimetype                    "image/openraster", stored uncompressed, first entry
stack.xml                   the layer stack, topmost layer first
data/000.png                one PNG per layer, bottom first
data/001.png
mergedimage.png             the flattened drawing on white
Thumbnails/thumbnail.png    at most 256x256
animecraft/scene.json       the vector operation log (see below)
animecraft/reference.png    the reference image the drawing was practised from
```

Opening one in Krita gives back the drawing with its layers intact. The two
`animecraft/` members are the app's own; the spec allows extra members and
other readers ignore them.

### Why the extra members

OpenRaster stores pixels. Resuming a session needs more than pixels:

- **`animecraft/scene.json`** holds the drawing as vectors — an ordered log of
  operations, plus where the undo cursor sits — so a restored session can be
  drawn on, undone and redone as if it had never been closed. Strokes are
  stored in document units, so the drawing keeps its proportions on a screen of
  any size.
- **`animecraft/reference.png`** embeds the reference image, which makes the
  file self-contained: it opens as a working session on a machine that has
  never seen the original library.

A file from another program is a valid OpenRaster archive without these, and
opening one reports that it carries no editable drawing data rather than
failing obscurely.

## The drawing is an operation log

The document model is one idea, shared by the editor
(`frontend/src/drawing/document.ts`) and the Go side
(`gateway/internal/drawdoc`):

> A drawing is the first `cursor + 1` operations of a log, applied in order.

```json
{"type": "add_stroke", "stroke": {"id": "s1", "layerId": "layer-1",
  "tool": "brush", "color": "#000000", "size": 2, "points": [10, 10, 90, 40]}}
{"type": "add_layer", "layer": {"id": "layer-2", "name": "Layer 2", "visible": true}}
{"type": "remove_layer", "layerId": "layer-2"}
{"type": "set_layer_visible", "layerId": "layer-1", "visible": false}
{"type": "move_layer", "layerId": "layer-1", "toIndex": 1}
```

Undo moves the cursor back rather than deleting anything, so the operations
past it are the redo stack — and because they are saved too, **undo survives
closing the app**. Drawing something new after an undo discards that tail, in
the editor and in the store alike.

Points are a flat `[x0, y0, x1, y1, ...]` array rounded to a tenth of a
document unit: about half the JSON of an array of objects, and finer than a
screen can resolve.

Two things follow from keeping vectors rather than bitmaps:

- Undo depth is no longer capped. The previous implementation kept two
  full-canvas `ImageData` snapshots per undo step — roughly 6 MB per stroke at
  this document size, which is why it was limited to 30 steps.
- The drawing can be re-rendered at any size, which is what makes a saved file
  meaningful.

## Saving is a journal plus a checkpoint

Writing a whole OpenRaster file after every stroke would mean rendering and
zipping every layer several times a minute. Saving is split in two, the way
databases split a write-ahead log from its checkpoints:

```
<data>/drawings/<sessionID>/
    journal.ndjson    one JSON operation per line, appended
    state.json        cursor, operation count, revision, tool, active layer
    document.ora      the OpenRaster checkpoint
```

**The journal is the hot path.** An autosave appends the operations the editor
has that the store does not — a few hundred bytes, whatever the size of the
drawing — and rewrites the small state file atomically. It is only rewritten in
full when the artist undoes and then draws again, replacing the tail.

**The OpenRaster file is the checkpoint.** It is written on the first save (so
a portable copy exists from the outset), then every 25 revisions or two
minutes, and always on an explicit flush: leaving the page, submitting, or
exporting. Its layers are rendered from the vectors by Go
(`gateway/internal/drawdoc/raster.go`), so a checkpoint costs nothing on the
wire.

On load the journal wins, since it is never behind the checkpoint. The
OpenRaster file is the fallback for a drawing that arrived as a file rather
than through the editor.

Crash safety comes from the shape of the writes: the journal is append-only,
the state file is replaced atomically, a half-written final journal line is
discarded on read, and operations the state file does not account for are
ignored so the drawing always matches the cursor saved with it.

## When saving happens

`useDrawingAutosave` writes once the artist pauses for 1.2 s, and at the latest
after 10 s of continuous drawing, so someone sketching without a break is still
covered. Only one save is in flight at a time; anything that changes while one
is out goes with the next. A save also runs when the drawing is left, when the
window closes, and before a drawing is submitted for feedback. A failure is
shown rather than swallowed, and retried — the work is still in the editor.

## What the artist sees

- The session shows what has been written: *Saving…*, *Saved 14:05*, or
  *Not saved — retrying*.
- The home screen lists unfinished sessions under **Continue drawing**, with
  what was saved and when.
- **Save a copy…** writes a `.ora` anywhere; **Open a saved drawing…** turns
  one back into a session, restoring its reference image if this machine does
  not already have it.
- **Discard** takes the session off the resume list *and* deletes what autosave
  kept for it. Both halves belong together: leaving the files behind would grow
  the data directory for every abandoned session with nothing in the app able
  to reach them.

## Compatibility

`scene.json` carries a `version`. A file written by a newer version is refused
rather than half-understood, and operations are re-emitted with any fields a
reader does not recognise intact, so a log written by a newer app survives a
round trip through an older one.
