import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ReferencePanel from '../../components/session/ReferencePanel';

vi.mock('../../components/session/ReferenceImageViewer', () => ({
  default: ({ referenceId }: { referenceId: string }) => (
    <img data-testid="reference-image" alt="reference" src={`#${referenceId}`} />
  ),
}));

function renderPanel(overrides: Partial<Parameters<typeof ReferencePanel>[0]> = {}) {
  const onPlacementChange = vi.fn();
  render(
    <ReferencePanel
      referenceId="ref-001"
      placement="panel"
      onPlacementChange={onPlacementChange}
      busy={false}
      error={null}
      {...overrides}
    />
  );
  return { onPlacementChange };
}

describe('ReferencePanel', () => {
  it('shows the reference beside the drawing by default', () => {
    renderPanel();

    expect(screen.getByTestId('reference-panel')).toBeInTheDocument();
    expect(screen.getByTestId('reference-image')).toBeInTheDocument();
    expect(screen.getByTestId('reference-open-window')).toBeInTheDocument();
    expect(screen.getByTestId('reference-hide')).toBeInTheDocument();
  });

  // The two ways to give the drawing more room.
  it('offers to move the reference to its own window', async () => {
    const user = userEvent.setup();
    const { onPlacementChange } = renderPanel();

    await user.click(screen.getByTestId('reference-open-window'));

    expect(onPlacementChange).toHaveBeenCalledWith('window');
  });

  it('offers to put the reference away entirely', async () => {
    const user = userEvent.setup();
    const { onPlacementChange } = renderPanel();

    await user.click(screen.getByTestId('reference-hide'));

    expect(onPlacementChange).toHaveBeenCalledWith('hidden');
  });

  // Whichever way it went, there has to be a way back, and it should say where
  // the reference actually is.
  it('says where the reference went and brings it back', async () => {
    const user = userEvent.setup();
    const { onPlacementChange } = renderPanel({ placement: 'window' });

    expect(screen.queryByTestId('reference-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('reference-away')).toHaveTextContent(
      'Reference in its own window'
    );

    await user.click(screen.getByTestId('reference-show-here'));
    expect(onPlacementChange).toHaveBeenCalledWith('panel');
  });

  it('says so when the reference is merely hidden', () => {
    renderPanel({ placement: 'hidden' });

    expect(screen.getByTestId('reference-away')).toHaveTextContent('Reference hidden');
  });

  it('reports a placement that would not take', () => {
    renderPanel({ error: 'no display' });

    expect(screen.getByTestId('reference-placement-error')).toHaveTextContent('no display');
  });

  // Nothing to put in a window until the session has loaded.
  it('cannot open a window before the reference is known', () => {
    renderPanel({ referenceId: null });

    expect(screen.getByTestId('reference-open-window')).toBeDisabled();
    expect(screen.getByTestId('session-loading')).toBeInTheDocument();
  });

  it('waits while a placement is in flight', () => {
    renderPanel({ busy: true });

    expect(screen.getByTestId('reference-open-window')).toBeDisabled();
    expect(screen.getByTestId('reference-hide')).toBeDisabled();
  });
});
