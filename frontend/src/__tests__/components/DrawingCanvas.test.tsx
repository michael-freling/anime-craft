import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import DrawingCanvas from '../../components/drawing/DrawingCanvas';
import type { Layer } from '../../hooks/useDrawingCanvas';

const LAYERS: Layer[] = [
  { id: 'layer-1', name: 'Layer 1', visible: true },
  { id: 'layer-2', name: 'Layer 2', visible: true },
];

function renderCanvas(overrides: Partial<Parameters<typeof DrawingCanvas>[0]> = {}) {
  const surfaceRef = createRef<HTMLDivElement>();
  const props = {
    surfaceRef,
    registerLayerCanvas: () => vi.fn(),
    layers: LAYERS,
    tool: 'brush' as const,
    ...overrides,
  };
  render(<DrawingCanvas {...props} />);
  return { surfaceRef };
}

describe('DrawingCanvas', () => {
  it('renders the drawing surface', () => {
    renderCanvas();

    expect(screen.getByTestId('drawing-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('drawing-canvas')).toHaveClass('canvas-container');
  });

  it('renders one canvas per layer', () => {
    renderCanvas();

    expect(screen.getByTestId('layer-canvas-layer-1')).toBeInTheDocument();
    expect(screen.getByTestId('layer-canvas-layer-2')).toBeInTheDocument();
  });

  it('stacks layers so later layers paint above earlier ones', () => {
    renderCanvas();

    expect(screen.getByTestId('layer-canvas-layer-1')).toHaveStyle({ zIndex: '0' });
    expect(screen.getByTestId('layer-canvas-layer-2')).toHaveStyle({ zIndex: '1' });
  });

  it('hides layers that are toggled off', () => {
    renderCanvas({
      layers: [
        { id: 'layer-1', name: 'Layer 1', visible: true },
        { id: 'layer-2', name: 'Layer 2', visible: false },
      ],
    });

    expect(screen.getByTestId('layer-canvas-layer-1')).toHaveStyle({
      visibility: 'visible',
    });
    expect(screen.getByTestId('layer-canvas-layer-2')).toHaveStyle({
      visibility: 'hidden',
    });
  });

  it('shows crosshair cursor for brush and cell cursor for eraser', () => {
    const { unmount } = render(
      <DrawingCanvas
        surfaceRef={createRef<HTMLDivElement>()}
        registerLayerCanvas={() => vi.fn()}
        layers={LAYERS}
        tool="brush"
      />
    );
    expect(screen.getByTestId('drawing-canvas')).toHaveStyle({ cursor: 'crosshair' });
    unmount();

    renderCanvas({ tool: 'eraser' });
    expect(screen.getByTestId('drawing-canvas')).toHaveStyle({ cursor: 'cell' });
  });

  it('assigns the surface ref to the container', () => {
    const { surfaceRef } = renderCanvas();

    expect(surfaceRef.current).toBe(screen.getByTestId('drawing-canvas'));
  });

  it('registers each layer canvas with its layer id', () => {
    const registered: string[] = [];
    renderCanvas({
      registerLayerCanvas: (layerId: string) => (el: HTMLCanvasElement | null) => {
        if (el) registered.push(layerId);
      },
    });

    expect(registered).toEqual(['layer-1', 'layer-2']);
  });
});
