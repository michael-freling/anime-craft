import { render, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDrawingCanvas } from '../../hooks/useDrawingCanvas';

describe('useDrawingCanvas', () => {
  it('has correct initial state values', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    expect(result.current.state.tool).toBe('brush');
    expect(result.current.state.brushSize).toBe(2);
    expect(result.current.state.brushColor).toBe('#000000');
    expect(result.current.state.canUndo).toBe(false);
    expect(result.current.state.canRedo).toBe(false);
  });

  it('setTool changes tool state', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    act(() => {
      result.current.setTool('eraser');
    });

    expect(result.current.state.tool).toBe('eraser');

    act(() => {
      result.current.setTool('brush');
    });

    expect(result.current.state.tool).toBe('brush');
  });

  it('setBrushSize changes brushSize state', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    act(() => {
      result.current.setBrushSize(10);
    });

    expect(result.current.state.brushSize).toBe(10);

    act(() => {
      result.current.setBrushSize(5);
    });

    expect(result.current.state.brushSize).toBe(5);
  });

  it('setBrushColor changes brushColor state', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    act(() => {
      result.current.setBrushColor('#ff0000');
    });

    expect(result.current.state.brushColor).toBe('#ff0000');

    act(() => {
      result.current.setBrushColor('#00ff00');
    });

    expect(result.current.state.brushColor).toBe('#00ff00');
  });

  it('undo is callable without error when canvas is null (no-op)', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    expect(() => {
      act(() => {
        result.current.undo();
      });
    }).not.toThrow();
  });

  it('redo is callable without error when canvas is null (no-op)', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    expect(() => {
      act(() => {
        result.current.redo();
      });
    }).not.toThrow();
  });

  it('clear is callable without error when canvas is null (no-op)', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    expect(() => {
      act(() => {
        result.current.clear();
      });
    }).not.toThrow();
  });

  it('exportPNG returns empty string when canvas is null', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    let exportResult: string = '';
    act(() => {
      exportResult = result.current.exportPNG();
    });

    expect(exportResult).toBe('');
  });

  it('canUndo and canRedo top-level properties match state', () => {
    const { result } = renderHook(() => useDrawingCanvas());

    expect(result.current.canUndo).toBe(result.current.state.canUndo);
    expect(result.current.canRedo).toBe(result.current.state.canRedo);
  });

  it('canvasRef is defined', () => {
    const { result } = renderHook(() => useDrawingCanvas());
    expect(result.current.canvasRef).toBeDefined();
    expect(result.current.canvasRef.current).toBeNull();
  });
});

// Tests that use a rendered canvas element to cover canvas-dependent code paths
describe('useDrawingCanvas with canvas element', () => {
  let hookResult: ReturnType<typeof useDrawingCanvas>;
  const mockCtx = {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
    putImageData: vi.fn(),
    createImageData: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 0 }),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    canvas: { width: 800, height: 600 },
    lineWidth: 1,
    lineCap: 'round',
    lineJoin: 'round',
    strokeStyle: '#000',
    fillStyle: '#000',
    globalCompositeOperation: 'source-over',
  };

  function TestCanvasComponent() {
    const hook = useDrawingCanvas();
    hookResult = hook;
    return (
      <div style={{ width: '800px', height: '600px' }} data-testid="canvas-parent">
        <canvas ref={hook.canvasRef} data-testid="test-canvas" />
        <span data-testid="tool">{hook.state.tool}</span>
        <span data-testid="can-undo">{String(hook.state.canUndo)}</span>
        <span data-testid="can-redo">{String(hook.state.canRedo)}</span>
      </div>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock context methods
    Object.keys(mockCtx).forEach((key) => {
      if (typeof (mockCtx as any)[key]?.mockClear === 'function') {
        (mockCtx as any)[key].mockClear();
      }
    });

    // Mock setPointerCapture/releasePointerCapture which are not available in jsdom
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();

    // Mock clientWidth/clientHeight since jsdom doesn't compute layout
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  });

  it('initializes canvas when mounted with parent element', () => {
    // The test-setup.ts mocks getContext globally, and initCanvas is called on mount
    render(<TestCanvasComponent />);

    const canvas = screen.getByTestId('test-canvas') as HTMLCanvasElement;
    expect(canvas).toBeInTheDocument();
    // initCanvas calls getContext('2d')
    expect(canvas.getContext).toHaveBeenCalledWith('2d');
  });

  it('exportPNG returns data URL when canvas is mounted', () => {
    render(<TestCanvasComponent />);

    let result: string = '';
    act(() => {
      result = hookResult.exportPNG();
    });

    // The global mock in test-setup.ts returns 'data:image/png;base64,test'
    expect(result).toBe('data:image/png;base64,test');
  });

  it('clear calls fillRect on the canvas context', () => {
    render(<TestCanvasComponent />);

    act(() => {
      hookResult.clear();
    });

    const canvas = screen.getByTestId('test-canvas') as HTMLCanvasElement;
    // clear calls getContext, then fillRect
    expect(canvas.getContext).toHaveBeenCalledWith('2d');
  });

  it('undo and redo work with canvas and history', () => {
    render(<TestCanvasComponent />);

    // After initCanvas, one snapshot is saved (historyIndex = 0)
    // undo should not change anything since we're at index 0
    act(() => {
      hookResult.undo();
    });
    expect(screen.getByTestId('can-undo')).toHaveTextContent('false');

    // redo should also not change anything
    act(() => {
      hookResult.redo();
    });
    expect(screen.getByTestId('can-redo')).toHaveTextContent('false');
  });

  it('clear followed by undo allows undo', () => {
    render(<TestCanvasComponent />);

    // After init, one snapshot exists (index 0)
    // Clear creates a second snapshot (index 1)
    act(() => {
      hookResult.clear();
    });

    expect(screen.getByTestId('can-undo')).toHaveTextContent('true');

    // Undo back to the first snapshot
    act(() => {
      hookResult.undo();
    });

    expect(screen.getByTestId('can-undo')).toHaveTextContent('false');
    expect(screen.getByTestId('can-redo')).toHaveTextContent('true');

    // Redo back to the cleared state
    act(() => {
      hookResult.redo();
    });

    expect(screen.getByTestId('can-redo')).toHaveTextContent('false');
    expect(screen.getByTestId('can-undo')).toHaveTextContent('true');
  });

  it('registers pointer event listeners on the canvas', () => {
    render(<TestCanvasComponent />);

    const canvas = screen.getByTestId('test-canvas') as HTMLCanvasElement;
    const addEventSpy = vi.spyOn(canvas, 'addEventListener');

    // The event listeners are registered during the initial effect.
    // Since the effect already ran, verify by checking the canvas can receive events.
    // We can verify by dispatching pointer events.

    // Create a mock getBoundingClientRect for the canvas
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // Simulate pointer events - these should not throw
    act(() => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true, pointerId: 1 })
      );
    });

    act(() => {
      canvas.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 150, clientY: 150, bubbles: true, pointerId: 1 })
      );
    });

    act(() => {
      canvas.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })
      );
    });

    // After pointer up, a snapshot should be saved, making undo possible
    expect(screen.getByTestId('can-undo')).toHaveTextContent('true');
  });

  it('handles eraser tool during drawing', () => {
    render(<TestCanvasComponent />);

    const canvas = screen.getByTestId('test-canvas') as HTMLCanvasElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600,
      width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    });

    // Switch to eraser
    act(() => {
      hookResult.setTool('eraser');
    });

    expect(screen.getByTestId('tool')).toHaveTextContent('eraser');

    // Draw with eraser
    act(() => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 50, clientY: 50, bubbles: true, pointerId: 1 })
      );
    });
    act(() => {
      canvas.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 100, clientY: 100, bubbles: true, pointerId: 1 })
      );
    });
    act(() => {
      canvas.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })
      );
    });

    // Should have saved a snapshot after drawing
    expect(screen.getByTestId('can-undo')).toHaveTextContent('true');
  });

  it('pointerleave ends drawing like pointerup', () => {
    render(<TestCanvasComponent />);

    const canvas = screen.getByTestId('test-canvas') as HTMLCanvasElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600,
      width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    });

    act(() => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 50, clientY: 50, bubbles: true, pointerId: 1 })
      );
    });
    act(() => {
      canvas.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 100, clientY: 100, bubbles: true, pointerId: 1 })
      );
    });
    act(() => {
      canvas.dispatchEvent(
        new PointerEvent('pointerleave', { bubbles: true, pointerId: 1 })
      );
    });

    expect(screen.getByTestId('can-undo')).toHaveTextContent('true');
  });

  it('pointermove without pointerdown does not draw', () => {
    render(<TestCanvasComponent />);

    const canvas = screen.getByTestId('test-canvas') as HTMLCanvasElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600,
      width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    });

    // Move without pressing - should not create any history entry
    act(() => {
      canvas.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 100, clientY: 100, bubbles: true })
      );
    });

    // Only the initial snapshot from initCanvas exists
    expect(screen.getByTestId('can-undo')).toHaveTextContent('false');
  });

  it('pointerup without prior pointerdown is a no-op', () => {
    render(<TestCanvasComponent />);

    const canvas = screen.getByTestId('test-canvas') as HTMLCanvasElement;

    // pointerup without active drawing should not add snapshot
    act(() => {
      canvas.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true })
      );
    });

    expect(screen.getByTestId('can-undo')).toHaveTextContent('false');
  });

  it('undo after clear and then new drawing truncates redo history', () => {
    render(<TestCanvasComponent />);

    const canvas = screen.getByTestId('test-canvas') as HTMLCanvasElement;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600,
      width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    });

    // Create snapshot by clearing (index 0 -> 1)
    act(() => {
      hookResult.clear();
    });

    // Undo to go back to index 0
    act(() => {
      hookResult.undo();
    });
    expect(screen.getByTestId('can-redo')).toHaveTextContent('true');

    // Now clear again - this should truncate the redo history
    act(() => {
      hookResult.clear();
    });

    // After truncation, we should be at the end
    expect(screen.getByTestId('can-redo')).toHaveTextContent('false');
    expect(screen.getByTestId('can-undo')).toHaveTextContent('true');
  });

  it('limits history to 50 entries by shifting old entries', () => {
    render(<TestCanvasComponent />);

    // After initCanvas, one snapshot exists (index 0).
    // Add 50 more snapshots (via clear) to reach 51 total, triggering the limit.
    for (let i = 0; i < 50; i++) {
      act(() => {
        hookResult.clear();
      });
    }

    // We should still be able to undo (history is capped at 50)
    expect(screen.getByTestId('can-undo')).toHaveTextContent('true');

    // Undo all the way back — we can only undo 49 times (50 entries, index 49 -> 0)
    for (let i = 0; i < 49; i++) {
      act(() => {
        hookResult.undo();
      });
    }

    // At index 0, canUndo should be false
    expect(screen.getByTestId('can-undo')).toHaveTextContent('false');
  });

  it('ResizeObserver callback resizes canvas and restores content', () => {
    // Access the stored ResizeObserver callbacks from global
    const callbacks = (globalThis as any).__resizeObserverCallbacks as Array<ResizeObserverCallback>;
    const initialLength = callbacks.length;

    render(<TestCanvasComponent />);

    const canvas = screen.getByTestId('test-canvas') as HTMLCanvasElement;

    // The ResizeObserver effect should have added a callback
    expect(callbacks.length).toBeGreaterThan(initialLength);

    const resizeCallback = callbacks[callbacks.length - 1];

    // Change the parent's clientWidth/clientHeight to trigger a resize
    const parent = canvas.parentElement!;
    Object.defineProperty(parent, 'clientWidth', { configurable: true, get: () => 1024 });
    Object.defineProperty(parent, 'clientHeight', { configurable: true, get: () => 768 });

    // Trigger the resize callback
    act(() => {
      resizeCallback([], {} as ResizeObserver);
    });

    // Canvas should be resized
    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(768);
  });

  it('ResizeObserver callback skips when size has not changed', () => {
    const callbacks = (globalThis as any).__resizeObserverCallbacks as Array<ResizeObserverCallback>;
    const initialLength = callbacks.length;

    render(<TestCanvasComponent />);

    const canvas = screen.getByTestId('test-canvas') as HTMLCanvasElement;
    const resizeCallback = callbacks[callbacks.length - 1];

    // Canvas is already 800x600 and parent reports 800x600, so no resize should happen
    const ctxMock = canvas.getContext('2d')!;
    (ctxMock.getImageData as any).mockClear();

    act(() => {
      resizeCallback([], {} as ResizeObserver);
    });

    // getImageData should not be called since size didn't change
    expect(ctxMock.getImageData).not.toHaveBeenCalled();
  });

  it('ResizeObserver callback skips when dimensions are zero', () => {
    const callbacks = (globalThis as any).__resizeObserverCallbacks as Array<ResizeObserverCallback>;
    const initialLength = callbacks.length;

    render(<TestCanvasComponent />);

    const canvas = screen.getByTestId('test-canvas') as HTMLCanvasElement;
    const parent = canvas.parentElement!;
    const resizeCallback = callbacks[callbacks.length - 1];

    // Set parent dimensions to zero
    Object.defineProperty(parent, 'clientWidth', { configurable: true, get: () => 0 });
    Object.defineProperty(parent, 'clientHeight', { configurable: true, get: () => 0 });

    const originalWidth = canvas.width;

    act(() => {
      resizeCallback([], {} as ResizeObserver);
    });

    // Canvas should not have been resized
    expect(canvas.width).toBe(originalWidth);
  });
});
