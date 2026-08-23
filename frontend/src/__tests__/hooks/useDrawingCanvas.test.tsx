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

  it('drops redoable changes once a new change is made', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    act(() => result.current.addLayer());
    act(() => result.current.undo());
    expect(result.current.state.canRedo).toBe(true);

    act(() => result.current.addLayer());
    expect(result.current.state.canRedo).toBe(false);
    expect(result.current.state.layers.map((l) => l.id)).toEqual([
      'layer-1',
      'layer-3',
    ]);
  });
});
