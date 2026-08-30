import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ReferencePanel, {
  ReferenceAwayControl,
} from '../../components/session/ReferencePanel';

vi.mock('../../components/session/ReferenceImageViewer', () => ({
  default: ({ referenceId }: { referenceId: string }) => (
    <img data-testid="reference-image" alt="reference" src={`#${referenceId}`} />
  ),
}));

function renderPanel(overrides: Partial<Parameters<typeof ReferencePanel>[0]> = {}) {
  const onPlacementChange = vi.fn();
  const view = render(
    <ReferencePanel
      referenceId="ref-001"
      placement="panel"
      onPlacementChange={onPlacementChange}
      busy={false}
      error={null}
      {...overrides}
    />
  );
  return { onPlacementChange, container: view.container };
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

  // The whole point of moving the reference is the room it frees, so the panel
  // leaves nothing behind — not even a panel saying it is empty.
  it('takes up no room at all once the reference is elsewhere', () => {
    const { container } = renderPanel({ placement: 'window' });

    expect(screen.queryByTestId('reference-panel')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('leaves nothing behind when the reference is merely hidden', () => {
    const { container } = renderPanel({ placement: 'hidden' });

    expect(container).toBeEmptyDOMElement();
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

describe('ReferenceAwayControl', () => {
  function renderAway(
    overrides: Partial<Parameters<typeof ReferenceAwayControl>[0]> = {}
  ) {
    const onShowHere = vi.fn();
    render(
      <ReferenceAwayControl
        placement="window"
        onShowHere={onShowHere}
        busy={false}
        error={null}
        {...overrides}
      />
    );
    return { onShowHere };
  }

  it('brings the reference back', async () => {
    const user = userEvent.setup();
    const { onShowHere } = renderAway();

    await user.click(screen.getByTestId('reference-show-here'));

    expect(onShowHere).toHaveBeenCalled();
  });

  // Where it went belongs in the tooltip: the label has to stay short, because
  // a long one starts taking back the room the reference gave up.
  it('says where the reference went without spending width on it', () => {
    renderAway({ placement: 'window' });

    const button = screen.getByTestId('reference-show-here');
    expect(button).toHaveTextContent('Show reference');
    expect(button).toHaveAttribute(
      'title',
      'The reference is in its own window \u2014 put it back beside the drawing'
    );
  });

  it('says so when the reference is merely hidden', () => {
    renderAway({ placement: 'hidden' });

    expect(screen.getByTestId('reference-show-here')).toHaveAttribute(
      'title',
      'The reference is hidden \u2014 put it back beside the drawing'
    );
  });

  it('reports a placement that would not take', () => {
    renderAway({ error: 'no display' });

    expect(screen.getByTestId('reference-placement-error')).toHaveTextContent(
      'no display'
    );
  });

  it('waits while a placement is in flight', () => {
    renderAway({ busy: true });

    expect(screen.getByTestId('reference-show-here')).toBeDisabled();
  });
});
