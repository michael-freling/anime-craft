import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import DrawingCanvas from '../../components/drawing/DrawingCanvas';

describe('DrawingCanvas', () => {
  it('renders canvas element with correct data-testid', () => {
    const canvasRef = createRef<HTMLCanvasElement>();
    render(<DrawingCanvas canvasRef={canvasRef} tool="brush" />);

    expect(screen.getByTestId('drawing-canvas')).toBeInTheDocument();
  });

  it('shows crosshair cursor for brush tool', () => {
    const canvasRef = createRef<HTMLCanvasElement>();
    render(<DrawingCanvas canvasRef={canvasRef} tool="brush" />);

    const canvas = screen.getByTestId('drawing-canvas');
    expect(canvas).toHaveStyle({ cursor: 'crosshair' });
  });

  it('shows cell cursor for eraser tool', () => {
    const canvasRef = createRef<HTMLCanvasElement>();
    render(<DrawingCanvas canvasRef={canvasRef} tool="eraser" />);

    const canvas = screen.getByTestId('drawing-canvas');
    expect(canvas).toHaveStyle({ cursor: 'cell' });
  });

  it('renders inside a canvas-container div', () => {
    const canvasRef = createRef<HTMLCanvasElement>();
    render(<DrawingCanvas canvasRef={canvasRef} tool="brush" />);

    const canvas = screen.getByTestId('drawing-canvas');
    expect(canvas.parentElement).toHaveClass('canvas-container');
  });

  it('assigns the ref to the canvas element', () => {
    const canvasRef = createRef<HTMLCanvasElement>();
    render(<DrawingCanvas canvasRef={canvasRef} tool="brush" />);

    expect(canvasRef.current).toBe(screen.getByTestId('drawing-canvas'));
  });
});
