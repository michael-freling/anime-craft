import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import LayerPanel from '../../components/drawing/LayerPanel';
import type { Layer } from '../../hooks/useDrawingCanvas';

const LAYERS: Layer[] = [
  { id: 'layer-1', name: 'Layer 1', visible: true },
  { id: 'layer-2', name: 'Layer 2', visible: true },
];

const defaultProps = {
  layers: LAYERS,
  activeLayerId: 'layer-1',
  onAddLayer: vi.fn(),
  onRemoveLayer: vi.fn(),
  onSelectLayer: vi.fn(),
  onToggleVisibility: vi.fn(),
  onMoveLayer: vi.fn(),
};

describe('LayerPanel', () => {
  it('lists layers with the topmost first', () => {
    render(<LayerPanel {...defaultProps} />);

    const names = screen
      .getAllByRole('listitem')
      .map((item) => within(item).getByRole('button', { name: /^Layer/ }).textContent);

    expect(names).toEqual(['Layer 2', 'Layer 1']);
  });

  it('marks the active layer', () => {
    render(<LayerPanel {...defaultProps} activeLayerId="layer-2" />);

    expect(screen.getByTestId('layer-item-layer-2')).toHaveClass('active');
    expect(screen.getByTestId('layer-item-layer-1')).not.toHaveClass('active');
  });

  it('selects a layer when its name is clicked', async () => {
    const user = userEvent.setup();
    const onSelectLayer = vi.fn();
    render(<LayerPanel {...defaultProps} onSelectLayer={onSelectLayer} />);

    await user.click(screen.getByTestId('layer-select-layer-2'));

    expect(onSelectLayer).toHaveBeenCalledWith('layer-2');
  });

  it('adds a layer', async () => {
    const user = userEvent.setup();
    const onAddLayer = vi.fn();
    render(<LayerPanel {...defaultProps} onAddLayer={onAddLayer} />);

    await user.click(screen.getByTestId('layer-add'));

    expect(onAddLayer).toHaveBeenCalled();
  });

  it('toggles visibility and labels the control by what it will do', async () => {
    const user = userEvent.setup();
    const onToggleVisibility = vi.fn();
    render(
      <LayerPanel
        {...defaultProps}
        layers={[
          { id: 'layer-1', name: 'Layer 1', visible: true },
          { id: 'layer-2', name: 'Layer 2', visible: false },
        ]}
        onToggleVisibility={onToggleVisibility}
      />
    );

    expect(screen.getByTestId('layer-visibility-layer-1')).toHaveAttribute(
      'aria-label',
      'Hide Layer 1'
    );
    expect(screen.getByTestId('layer-visibility-layer-2')).toHaveAttribute(
      'aria-label',
      'Show Layer 2'
    );

    await user.click(screen.getByTestId('layer-visibility-layer-2'));
    expect(onToggleVisibility).toHaveBeenCalledWith('layer-2');
  });

  it('moves a layer up and down', async () => {
    const user = userEvent.setup();
    const onMoveLayer = vi.fn();
    render(<LayerPanel {...defaultProps} onMoveLayer={onMoveLayer} />);

    await user.click(screen.getByTestId('layer-up-layer-1'));
    expect(onMoveLayer).toHaveBeenCalledWith('layer-1', 'up');

    await user.click(screen.getByTestId('layer-down-layer-2'));
    expect(onMoveLayer).toHaveBeenCalledWith('layer-2', 'down');
  });

  it('disables moving past the top and bottom of the stack', () => {
    render(<LayerPanel {...defaultProps} />);

    // layer-2 is the topmost, layer-1 the bottom one.
    expect(screen.getByTestId('layer-up-layer-2')).toBeDisabled();
    expect(screen.getByTestId('layer-down-layer-1')).toBeDisabled();
  });

  it('deletes a layer, but not the last remaining one', async () => {
    const user = userEvent.setup();
    const onRemoveLayer = vi.fn();
    const { unmount } = render(
      <LayerPanel {...defaultProps} onRemoveLayer={onRemoveLayer} />
    );

    await user.click(screen.getByTestId('layer-delete-layer-2'));
    expect(onRemoveLayer).toHaveBeenCalledWith('layer-2');
    unmount();

    render(
      <LayerPanel
        {...defaultProps}
        layers={[{ id: 'layer-1', name: 'Layer 1', visible: true }]}
      />
    );
    expect(screen.getByTestId('layer-delete-layer-1')).toBeDisabled();
  });
});
