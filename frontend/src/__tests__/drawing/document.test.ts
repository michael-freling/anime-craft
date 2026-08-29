import { describe, it, expect } from 'vitest';
import {
  materialize,
  nextLayerNumber,
  parseScene,
  quantize,
} from '../../drawing/document';
import type { Operation, Stroke } from '../../drawing/document';

function stroke(id: string, layerId: string, ...points: number[]): Operation {
  return {
    type: 'add_stroke',
    stroke: { id, layerId, tool: 'brush', color: '#000000', size: 2, points },
  };
}

function addLayer(id: string, name: string): Operation {
  return { type: 'add_layer', layer: { id, name, visible: true } };
}

const ids = (layers: { id: string }[]) => layers.map((layer) => layer.id);

describe('materialize', () => {
  it('starts with a single layer and nothing drawn', () => {
    const doc = materialize([], -1);

    expect(ids(doc.layers)).toEqual(['layer-1']);
    expect(doc.strokes.size).toBe(0);
    expect(doc.activeLayerId).toBe('layer-1');
  });

  it('applies operations in order', () => {
    const doc = materialize(
      [stroke('s1', 'layer-1', 0, 0, 10, 10), addLayer('layer-2', 'Layer 2'), stroke('s2', 'layer-2', 1, 1, 2, 2)],
      2
    );

    expect(ids(doc.layers)).toEqual(['layer-1', 'layer-2']);
    expect(doc.strokes.get('layer-1')).toHaveLength(1);
    expect(doc.strokes.get('layer-2')?.[0].id).toBe('s2');
  });

  // The cursor is what undo moves: everything past it is the redo stack.
  it('stops at the cursor', () => {
    const operations = [
      stroke('s1', 'layer-1', 0, 0, 1, 1),
      stroke('s2', 'layer-1', 2, 2, 3, 3),
    ];

    expect(materialize(operations, -1).strokes.get('layer-1')).toBeUndefined();
    expect(materialize(operations, 0).strokes.get('layer-1')).toHaveLength(1);
    expect(materialize(operations, 1).strokes.get('layer-1')).toHaveLength(2);
  });

  it('brings a deleted layer back with its artwork when the cursor moves back', () => {
    const operations: Operation[] = [
      addLayer('layer-2', 'Layer 2'),
      stroke('s1', 'layer-2', 0, 0, 1, 1),
      { type: 'remove_layer', layerId: 'layer-2' },
    ];

    expect(ids(materialize(operations, 2).layers)).toEqual(['layer-1']);

    const restored = materialize(operations, 1);
    expect(ids(restored.layers)).toEqual(['layer-1', 'layer-2']);
    expect(restored.strokes.get('layer-2')).toHaveLength(1);
  });

  it('keeps the last layer, so there is always somewhere to paint', () => {
    const doc = materialize([{ type: 'remove_layer', layerId: 'layer-1' }], 0);

    expect(ids(doc.layers)).toEqual(['layer-1']);
  });

  it('reorders and hides layers', () => {
    const doc = materialize(
      [
        addLayer('layer-2', 'Layer 2'),
        { type: 'move_layer', layerId: 'layer-2', toIndex: 0 },
        { type: 'set_layer_visible', layerId: 'layer-1', visible: false },
      ],
      2
    );

    expect(ids(doc.layers)).toEqual(['layer-2', 'layer-1']);
    expect(doc.layers[1].visible).toBe(false);
  });

  it('ignores operations that name a layer which is not there', () => {
    const doc = materialize(
      [
        stroke('s1', 'layer-9', 0, 0, 1, 1),
        { type: 'move_layer', layerId: 'layer-1', toIndex: 7 },
      ],
      1
    );

    expect(ids(doc.layers)).toEqual(['layer-1']);
    expect(doc.strokes.size).toBe(0);
  });

  // A marker recording that the drawing was submitted is history, not
  // artwork: it has to pass through the renderer without drawing anything.
  it('draws nothing for a submission marker', () => {
    const doc = materialize(
      [
        stroke('s1', 'layer-1', 0, 0, 1, 1),
        {
          type: 'mark_submitted',
          sessionId: 'session-001',
          submittedAt: '2026-01-02T03:04:05Z',
        },
        stroke('s2', 'layer-1', 2, 2, 3, 3),
      ],
      2
    );

    expect(ids(doc.layers)).toEqual(['layer-1']);
    expect(doc.strokes.get('layer-1')).toHaveLength(2);
  });

  // Undo should put the artist back where they were working, which the log
  // knows without recording every selection.
  it('derives which layer was being worked on', () => {
    const operations = [addLayer('layer-2', 'Layer 2'), stroke('s1', 'layer-1', 0, 0, 1, 1)];

    expect(materialize(operations, 0).activeLayerId).toBe('layer-2');
    expect(materialize(operations, 1).activeLayerId).toBe('layer-1');
    expect(materialize(operations, -1).activeLayerId).toBe('layer-1');
  });
});

describe('nextLayerNumber', () => {
  it('counts from the highest number in use, not the number of layers', () => {
    expect(nextLayerNumber([{ id: 'layer-1', name: 'Layer 1', visible: true }])).toBe(2);
    // layer-2 was deleted but undo can still bring it back, so 2 is taken.
    expect(
      nextLayerNumber([
        { id: 'layer-1', name: 'Layer 1', visible: true },
        { id: 'layer-3', name: 'Layer 3', visible: true },
      ])
    ).toBe(4);
  });
});

describe('quantize', () => {
  it('rounds to a tenth of a document unit', () => {
    expect(quantize(10.04)).toBe(10);
    expect(quantize(10.06)).toBe(10.1);
    expect(quantize(-3.333)).toBe(-3.3);
  });
});

describe('parseScene', () => {
  it('reads a saved scene', () => {
    const scene = parseScene(
      JSON.stringify({
        version: 1,
        document: { width: 800, height: 600 },
        activeLayerId: 'layer-2',
        cursor: 0,
        operations: [addLayer('layer-2', 'Layer 2')],
      })
    );

    expect(scene?.document).toEqual({ width: 800, height: 600 });
    expect(scene?.activeLayerId).toBe('layer-2');
    expect(scene?.operations).toHaveLength(1);
  });

  it('has nothing to restore for a session that was never saved', () => {
    expect(parseScene('')).toBeNull();
  });

  // A corrupt file must not take the editor down with it.
  it('refuses anything that is not a scene', () => {
    expect(parseScene('{not json')).toBeNull();
    expect(parseScene('42')).toBeNull();
    expect(parseScene('null')).toBeNull();
  });

  it('fills in what a partial scene leaves out', () => {
    const scene = parseScene('{}');

    expect(scene?.document).toEqual({ width: 1024, height: 768 });
    expect(scene?.activeLayerId).toBe('layer-1');
    expect(scene?.cursor).toBe(-1);
    expect(scene?.operations).toEqual([]);
  });

  it('clamps a cursor that points past the end of the log', () => {
    const scene = parseScene(
      JSON.stringify({ cursor: 99, operations: [addLayer('layer-2', 'Layer 2')] })
    );

    expect(scene?.cursor).toBe(0);
  });
});
