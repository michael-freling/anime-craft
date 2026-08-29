import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useDrawingCanvas } from '../../hooks/useDrawingCanvas';

describe('useDrawingCanvas layers', () => {
  it('starts with a single active layer', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    expect(result.current.state.layers).toEqual([
      { id: 'layer-1', name: 'Layer 1', visible: true },
    ]);
    expect(result.current.state.activeLayerId).toBe('layer-1');
  });

  it('adds a layer on top and makes it active', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    act(() => result.current.addLayer());

    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-1',
      'layer-2',
    ]);
    expect(result.current.state.activeLayerId).toBe('layer-2');
  });

  it('selects a layer', () => {
    const { result } = renderHook(() => useDrawingCanvas());
    act(() => result.current.addLayer());

    act(() => result.current.selectLayer('layer-1'));

    expect(result.current.state.activeLayerId).toBe('layer-1');
  });

  it('toggles layer visibility', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    act(() => result.current.toggleLayerVisibility('layer-1'));
    expect(result.current.state.layers[0].visible).toBe(false);

    act(() => result.current.toggleLayerVisibility('layer-1'));
    expect(result.current.state.layers[0].visible).toBe(true);
  });

  it('reorders layers', () => {
    const { result } = renderHook(() => useDrawingCanvas());
    act(() => result.current.addLayer());

    act(() => result.current.moveLayer('layer-1', 'up'));
    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-2',
      'layer-1',
    ]);

    act(() => result.current.moveLayer('layer-1', 'down'));
    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-1',
      'layer-2',
    ]);
  });

  it('ignores moves past the ends of the stack', () => {
    const { result } = renderHook(() => useDrawingCanvas());
    act(() => result.current.addLayer());

    act(() => result.current.moveLayer('layer-1', 'down'));
    act(() => result.current.moveLayer('layer-2', 'up'));

    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-1',
      'layer-2',
    ]);
  });

  it('removes a layer and activates a remaining one', () => {
    const { result } = renderHook(() => useDrawingCanvas());
    act(() => result.current.addLayer());

    act(() => result.current.removeLayer('layer-2'));

    expect(result.current.state.layers.map((l) => l.id)).toEqual(['layer-1']);
    expect(result.current.state.activeLayerId).toBe('layer-1');
  });

  it('keeps the last layer', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    act(() => result.current.removeLayer('layer-1'));

    expect(result.current.state.layers.map((l) => l.id)).toEqual(['layer-1']);
  });

  it('has nothing to undo or redo before any change', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    expect(result.current.state.canUndo).toBe(false);
    expect(result.current.state.canRedo).toBe(false);

    act(() => result.current.undo());
    act(() => result.current.redo());

    expect(result.current.state.canUndo).toBe(false);
    expect(result.current.state.canRedo).toBe(false);
  });
});

describe('useDrawingCanvas undo of layer changes', () => {
  it('undoes and redoes adding a layer', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    act(() => result.current.addLayer());
    expect(result.current.state.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.state.layers.map((l) => l.id)).toEqual(['layer-1']);
    expect(result.current.state.activeLayerId).toBe('layer-1');

    act(() => result.current.redo());
    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-1',
      'layer-2',
    ]);
    expect(result.current.state.activeLayerId).toBe('layer-2');
  });

  it('undoes deleting a layer, restoring the layer and the selection', () => {
    const { result } = renderHook(() => useDrawingCanvas());
    act(() => result.current.addLayer());

    act(() => result.current.removeLayer('layer-2'));
    expect(result.current.state.layers.map((l) => l.id)).toEqual(['layer-1']);

    act(() => result.current.undo());
    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-1',
      'layer-2',
    ]);
    expect(result.current.state.activeLayerId).toBe('layer-2');

    act(() => result.current.redo());
    expect(result.current.state.layers.map((l) => l.id)).toEqual(['layer-1']);
  });

  it('undoes reordering', () => {
    const { result } = renderHook(() => useDrawingCanvas());
    act(() => result.current.addLayer());

    act(() => result.current.moveLayer('layer-1', 'up'));
    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-2',
      'layer-1',
    ]);

    act(() => result.current.undo());
    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-1',
      'layer-2',
    ]);
  });

  it('undoes hiding a layer', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    act(() => result.current.toggleLayerVisibility('layer-1'));
    expect(result.current.state.layers[0].visible).toBe(false);

    act(() => result.current.undo());
    expect(result.current.state.layers[0].visible).toBe(true);

    act(() => result.current.redo());
    expect(result.current.state.layers[0].visible).toBe(false);
  });

  it('does not record layer selection', () => {
    const { result } = renderHook(() => useDrawingCanvas());
    act(() => result.current.addLayer());

    act(() => result.current.selectLayer('layer-1'));
    expect(result.current.state.canUndo).toBe(true);

    // The only undoable change is the add, so one undo clears the stack.
    act(() => result.current.undo());
    expect(result.current.state.canUndo).toBe(false);
    expect(result.current.state.layers.map((l) => l.id)).toEqual(['layer-1']);
  });

  it('reuses the layer number after undoing an add', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    act(() => result.current.addLayer());
    act(() => result.current.undo());
    expect(result.current.state.canRedo).toBe(true);

    // Adding again gives back Layer 2, not Layer 3 — undo rolls the
    // numbering back with the stack.
    act(() => result.current.addLayer());
    expect(result.current.state.canRedo).toBe(false);
    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-1',
      'layer-2',
    ]);
    expect(result.current.state.layers.map((l) => l.name)).toEqual([
      'Layer 1',
      'Layer 2',
    ]);
  });

  it('does not reuse the id of a layer that is still undo-restorable', () => {
    const { result } = renderHook(() => useDrawingCanvas());
    act(() => result.current.addLayer()); // layer-2
    act(() => result.current.addLayer()); // layer-3

    // Deleting from the middle leaves layer-3 on top, so the next layer is 4;
    // reusing 2 would collide with the layer undo can bring back.
    act(() => result.current.removeLayer('layer-2'));
    act(() => result.current.addLayer());
    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-1',
      'layer-3',
      'layer-4',
    ]);

    act(() => result.current.undo()); // undo the add
    act(() => result.current.undo()); // undo the delete
    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-1',
      'layer-2',
      'layer-3',
    ]);
  });
});

describe('useDrawingCanvas saving', () => {
  it('has nothing to save before anything is drawn', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    expect(result.current.takePendingSave()).toBeNull();
  });

  it('offers each change to autosave once', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    act(() => result.current.addLayer());
    const first = result.current.takePendingSave()!;
    expect(first.fromIndex).toBe(0);
    expect(first.cursor).toBe(0);
    expect(first.operations).toEqual([
      { type: 'add_layer', layer: { id: 'layer-2', name: 'Layer 2', visible: true } },
    ]);

    act(() => result.current.commitSave(first));
    expect(result.current.takePendingSave()).toBeNull();

    // The next change is offered on its own, not with the one already saved.
    act(() => result.current.toggleLayerVisibility('layer-1'));
    const second = result.current.takePendingSave()!;
    expect(second.fromIndex).toBe(1);
    expect(second.operations).toEqual([
      { type: 'set_layer_visible', layerId: 'layer-1', visible: false },
    ]);
  });

  // Undo does not delete anything: it moves the cursor, and the redo stack is
  // saved with it so undo survives closing the app.
  it('saves an undo as a cursor move, keeping the redo stack', () => {
    const { result } = renderHook(() => useDrawingCanvas());
    act(() => result.current.addLayer());
    act(() => result.current.commitSave(result.current.takePendingSave()!));

    act(() => result.current.undo());

    const pending = result.current.takePendingSave()!;
    expect(pending.operations).toEqual([]);
    expect(pending.cursor).toBe(-1);
    expect(pending.fromIndex).toBe(1);
  });

  // Drawing after an undo throws the redo stack away, so the saved log has to
  // be rewritten from that point rather than appended to.
  it('replaces the tail of the log when the artist draws after an undo', () => {
    const { result } = renderHook(() => useDrawingCanvas());
    act(() => result.current.addLayer()); // layer-2
    act(() => result.current.addLayer()); // layer-3
    act(() => result.current.commitSave(result.current.takePendingSave()!));

    act(() => result.current.undo());
    act(() => result.current.toggleLayerVisibility('layer-1'));

    const pending = result.current.takePendingSave()!;
    expect(pending.fromIndex).toBe(1);
    expect(pending.operations).toEqual([
      { type: 'set_layer_visible', layerId: 'layer-1', visible: false },
    ]);
    expect(pending.cursor).toBe(1);
  });

  it('carries the tool and the selected layer along with the drawing', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    act(() => result.current.setBrushColor('#2196f3'));
    act(() => result.current.setBrushSize(10));
    act(() => result.current.setTool('eraser'));
    act(() => result.current.addLayer());

    const pending = result.current.takePendingSave()!;
    expect(pending.tool).toEqual({
      tool: 'eraser',
      brushSize: 10,
      brushColor: '#2196f3',
    });
    expect(pending.activeLayerId).toBe('layer-2');
    expect(pending.document).toEqual({ width: 1024, height: 768 });
  });
});

describe('useDrawingCanvas restoring a saved drawing', () => {
  const savedScene = {
    version: 1,
    document: { width: 1024, height: 768 },
    activeLayerId: 'layer-2',
    cursor: 2,
    tool: { tool: 'eraser' as const, brushSize: 10, brushColor: '#f44336' },
    operations: [
      {
        type: 'add_stroke' as const,
        stroke: {
          id: 's1',
          layerId: 'layer-1',
          tool: 'brush' as const,
          color: '#000000',
          size: 2,
          points: [10, 10, 100, 100],
        },
      },
      {
        type: 'add_layer' as const,
        layer: { id: 'layer-2', name: 'Layer 2', visible: true },
      },
      {
        type: 'add_layer' as const,
        layer: { id: 'layer-3', name: 'Layer 3', visible: true },
      },
    ],
  };

  it('puts back the layers, the tool and the selection', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    act(() => result.current.hydrate({ ...savedScene, cursor: 1 }));

    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-1',
      'layer-2',
    ]);
    expect(result.current.state.activeLayerId).toBe('layer-2');
    expect(result.current.state.tool).toBe('eraser');
    expect(result.current.state.brushSize).toBe(10);
    expect(result.current.state.brushColor).toBe('#f44336');
  });

  it('puts back the undo history, redo stack included', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    // Saved mid-undo: layer-3 is not on screen but can still be redone.
    act(() => result.current.hydrate({ ...savedScene, cursor: 1 }));
    expect(result.current.state.canUndo).toBe(true);
    expect(result.current.state.canRedo).toBe(true);
    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-1',
      'layer-2',
    ]);

    act(() => result.current.redo());
    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-1',
      'layer-2',
      'layer-3',
    ]);
  });

  it('owes the store nothing straight after restoring', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    act(() => result.current.hydrate(savedScene));

    expect(result.current.takePendingSave()).toBeNull();
  });

  it('appends to the restored log rather than starting over', () => {
    const { result } = renderHook(() => useDrawingCanvas());
    act(() => result.current.hydrate(savedScene));

    act(() => result.current.addLayer());

    const pending = result.current.takePendingSave()!;
    expect(pending.fromIndex).toBe(3);
    expect(pending.operations).toHaveLength(1);
    // Numbering continues past the layers the saved drawing already used.
    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-1',
      'layer-2',
      'layer-3',
      'layer-4',
    ]);
  });
});
