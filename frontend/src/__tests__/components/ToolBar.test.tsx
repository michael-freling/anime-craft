import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ToolBar from '../../components/drawing/ToolBar';

const defaultState = {
  tool: 'brush' as const,
  brushSize: 2,
  brushColor: '#000000',
  canUndo: true,
  canRedo: true,
  layers: [{ id: 'layer-1', name: 'Layer 1', visible: true }],
  activeLayerId: 'layer-1',
};

const defaultProps = {
  state: defaultState,
  onSetTool: vi.fn(),
  onSetBrushSize: vi.fn(),
  onSetBrushColor: vi.fn(),
  onUndo: vi.fn(),
  onRedo: vi.fn(),
};

describe('ToolBar', () => {
  it('renders tool buttons', () => {
    render(<ToolBar {...defaultProps} />);

    expect(screen.getByText('Brush')).toBeInTheDocument();
    expect(screen.getByText('Eraser')).toBeInTheDocument();
    expect(screen.getByText('Undo')).toBeInTheDocument();
    expect(screen.getByText('Redo')).toBeInTheDocument();
  });

  it('does not render a Clear button', () => {
    render(<ToolBar {...defaultProps} />);

    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-clear')).not.toBeInTheDocument();
  });

  it('advertises the keyboard shortcut for each tool', () => {
    render(<ToolBar {...defaultProps} />);

    expect(screen.getByTestId('tool-brush')).toHaveAttribute('title', 'Brush (B)');
    expect(screen.getByTestId('tool-eraser')).toHaveAttribute('title', 'Eraser (E)');
    expect(screen.getByTestId('btn-undo')).toHaveAttribute('title', 'Undo (Ctrl+Z)');
    expect(screen.getByTestId('btn-redo')).toHaveAttribute(
      'title',
      'Redo (Ctrl+Shift+Z)'
    );
  });

  it('renders brush size preset buttons', () => {
    render(<ToolBar {...defaultProps} />);

    expect(screen.getByText('Small')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Large')).toBeInTheDocument();
  });

  it('renders color palette swatches', () => {
    render(<ToolBar {...defaultProps} />);

    expect(screen.getByTestId('color-black')).toBeInTheDocument();
    expect(screen.getByTestId('color-red')).toBeInTheDocument();
    expect(screen.getByTestId('color-blue')).toBeInTheDocument();
    expect(screen.getByTestId('color-green')).toBeInTheDocument();
    expect(screen.getByTestId('color-orange')).toBeInTheDocument();
    expect(screen.getByTestId('color-purple')).toBeInTheDocument();
  });

  it('calls onSetTool when Brush and Eraser are clicked', async () => {
    const user = userEvent.setup();
    const onSetTool = vi.fn();
    render(<ToolBar {...defaultProps} onSetTool={onSetTool} />);

    await user.click(screen.getByText('Eraser'));
    expect(onSetTool).toHaveBeenCalledWith('eraser');

    await user.click(screen.getByText('Brush'));
    expect(onSetTool).toHaveBeenCalledWith('brush');
  });

  it('calls onSetBrushSize when size buttons are clicked', async () => {
    const user = userEvent.setup();
    const onSetBrushSize = vi.fn();
    render(<ToolBar {...defaultProps} onSetBrushSize={onSetBrushSize} />);

    await user.click(screen.getByText('Small'));
    expect(onSetBrushSize).toHaveBeenCalledWith(2);

    await user.click(screen.getByText('Medium'));
    expect(onSetBrushSize).toHaveBeenCalledWith(5);

    await user.click(screen.getByText('Large'));
    expect(onSetBrushSize).toHaveBeenCalledWith(10);
  });

  it('calls onSetBrushColor when a color swatch is clicked', async () => {
    const user = userEvent.setup();
    const onSetBrushColor = vi.fn();
    render(<ToolBar {...defaultProps} onSetBrushColor={onSetBrushColor} />);

    await user.click(screen.getByTestId('color-red'));
    expect(onSetBrushColor).toHaveBeenCalledWith('#f44336');

    await user.click(screen.getByTestId('color-blue'));
    expect(onSetBrushColor).toHaveBeenCalledWith('#2196f3');
  });

  it('calls onUndo and onRedo when clicked', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(<ToolBar {...defaultProps} onUndo={onUndo} onRedo={onRedo} />);

    await user.click(screen.getByText('Undo'));
    expect(onUndo).toHaveBeenCalled();

    await user.click(screen.getByText('Redo'));
    expect(onRedo).toHaveBeenCalled();
  });


  it('disables Undo when canUndo is false', () => {
    render(
      <ToolBar
        {...defaultProps}
        state={{ ...defaultState, canUndo: false }}
      />
    );

    expect(screen.getByText('Undo')).toBeDisabled();
  });

  it('disables Redo when canRedo is false', () => {
    render(
      <ToolBar
        {...defaultProps}
        state={{ ...defaultState, canRedo: false }}
      />
    );

    expect(screen.getByText('Redo')).toBeDisabled();
  });

  it('highlights active brush size', () => {
    render(
      <ToolBar
        {...defaultProps}
        state={{ ...defaultState, brushSize: 5 }}
      />
    );

    expect(screen.getByText('Medium')).toHaveClass('active');
    expect(screen.getByText('Small')).not.toHaveClass('active');
    expect(screen.getByText('Large')).not.toHaveClass('active');
  });

  it('highlights active tool', () => {
    render(
      <ToolBar
        {...defaultProps}
        state={{ ...defaultState, tool: 'eraser' }}
      />
    );

    expect(screen.getByText('Eraser')).toHaveClass('active');
    expect(screen.getByText('Brush')).not.toHaveClass('active');
  });
});
