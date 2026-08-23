import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDrawingShortcuts } from '../../hooks/useDrawingShortcuts';

const onSetTool = vi.fn();
const onUndo = vi.fn();
const onRedo = vi.fn();

function Harness() {
  useDrawingShortcuts({ onSetTool, onUndo, onRedo });
  return <input data-testid="text-field" />;
}

describe('useDrawingShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    render(<Harness />);
  });

  it('switches to the brush with B and the eraser with E', async () => {
    const user = userEvent.setup();

    await user.keyboard('b');
    expect(onSetTool).toHaveBeenCalledWith('brush');

    await user.keyboard('e');
    expect(onSetTool).toHaveBeenCalledWith('eraser');
  });

  it('accepts uppercase letters', async () => {
    const user = userEvent.setup();

    await user.keyboard('{Shift>}B{/Shift}');

    expect(onSetTool).toHaveBeenCalledWith('brush');
  });

  it('undoes with Ctrl+Z and redoes with Ctrl+Shift+Z', async () => {
    const user = userEvent.setup();

    await user.keyboard('{Control>}z{/Control}');
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('undoes with Cmd+Z on macOS keyboards', async () => {
    const user = userEvent.setup();

    await user.keyboard('{Meta>}z{/Meta}');

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('also redoes with Ctrl+Y', async () => {
    const user = userEvent.setup();

    await user.keyboard('{Control>}y{/Control}');

    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it('ignores tool keys while typing in a field', async () => {
    const user = userEvent.setup();

    await user.click(screen.getByTestId('text-field'));
    await user.keyboard('be');

    expect(onSetTool).not.toHaveBeenCalled();
    expect(screen.getByTestId('text-field')).toHaveValue('be');
  });

  it('leaves modified letters alone so Ctrl+B stays free', async () => {
    const user = userEvent.setup();

    await user.keyboard('{Control>}b{/Control}');

    expect(onSetTool).not.toHaveBeenCalled();
  });
});
