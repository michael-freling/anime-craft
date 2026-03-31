import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionProvider, useSession } from '../../contexts/SessionContext';

// Test component that exposes session state and dispatch for testing
function TestConsumer() {
  const { state, dispatch } = useSession();
  return (
    <div>
      <span data-testid="session-id">{state.sessionId ?? 'null'}</span>
      <span data-testid="reference-image-id">{state.referenceImageId ?? 'null'}</span>
      <span data-testid="exercise-mode">{state.exerciseMode ?? 'null'}</span>
      <span data-testid="status">{state.status}</span>
      <span data-testid="start-time">{state.startTime ?? 'null'}</span>
      <span data-testid="elapsed-seconds">{state.elapsedSeconds}</span>
      <button
        data-testid="btn-start"
        onClick={() =>
          dispatch({
            type: 'START_SESSION',
            sessionId: 'sess-001',
            referenceImageId: 'ref-001',
            exerciseMode: 'line_work',
          })
        }
      >
        Start
      </button>
      <button data-testid="btn-tick" onClick={() => dispatch({ type: 'TICK' })}>
        Tick
      </button>
      <button data-testid="btn-submit-start" onClick={() => dispatch({ type: 'SUBMIT_START' })}>
        Submit Start
      </button>
      <button data-testid="btn-submit-complete" onClick={() => dispatch({ type: 'SUBMIT_COMPLETE' })}>
        Submit Complete
      </button>
      <button data-testid="btn-discard" onClick={() => dispatch({ type: 'DISCARD' })}>
        Discard
      </button>
      <button data-testid="btn-reset" onClick={() => dispatch({ type: 'RESET' })}>
        Reset
      </button>
    </div>
  );
}

describe('SessionContext', () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dateNowSpy = vi.spyOn(Date, 'now');
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  function renderWithProvider() {
    const user = userEvent.setup();
    render(
      <SessionProvider>
        <TestConsumer />
      </SessionProvider>
    );
    return { user };
  }

  it('provides initial state', () => {
    renderWithProvider();

    expect(screen.getByTestId('session-id')).toHaveTextContent('null');
    expect(screen.getByTestId('reference-image-id')).toHaveTextContent('null');
    expect(screen.getByTestId('exercise-mode')).toHaveTextContent('null');
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    expect(screen.getByTestId('start-time')).toHaveTextContent('null');
    expect(screen.getByTestId('elapsed-seconds')).toHaveTextContent('0');
  });

  it('START_SESSION sets all fields correctly', async () => {
    dateNowSpy.mockReturnValue(1000000);
    const { user } = renderWithProvider();

    await user.click(screen.getByTestId('btn-start'));

    expect(screen.getByTestId('session-id')).toHaveTextContent('sess-001');
    expect(screen.getByTestId('reference-image-id')).toHaveTextContent('ref-001');
    expect(screen.getByTestId('exercise-mode')).toHaveTextContent('line_work');
    expect(screen.getByTestId('status')).toHaveTextContent('drawing');
    expect(screen.getByTestId('start-time')).toHaveTextContent('1000000');
    expect(screen.getByTestId('elapsed-seconds')).toHaveTextContent('0');
  });

  it('TICK computes elapsed seconds from startTime', async () => {
    dateNowSpy.mockReturnValue(1000000);
    const { user } = renderWithProvider();

    await user.click(screen.getByTestId('btn-start'));

    // Advance time by 5 seconds
    dateNowSpy.mockReturnValue(1005000);
    await user.click(screen.getByTestId('btn-tick'));

    expect(screen.getByTestId('elapsed-seconds')).toHaveTextContent('5');
  });

  it('TICK returns same state when startTime is null', async () => {
    const { user } = renderWithProvider();

    // State is initial (startTime is null), so TICK should be a no-op
    await user.click(screen.getByTestId('btn-tick'));

    expect(screen.getByTestId('elapsed-seconds')).toHaveTextContent('0');
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    expect(screen.getByTestId('start-time')).toHaveTextContent('null');
  });

  it('SUBMIT_START sets status to submitting', async () => {
    const { user } = renderWithProvider();

    await user.click(screen.getByTestId('btn-start'));
    await user.click(screen.getByTestId('btn-submit-start'));

    expect(screen.getByTestId('status')).toHaveTextContent('submitting');
  });

  it('SUBMIT_COMPLETE sets status to submitted', async () => {
    const { user } = renderWithProvider();

    await user.click(screen.getByTestId('btn-start'));
    await user.click(screen.getByTestId('btn-submit-start'));
    await user.click(screen.getByTestId('btn-submit-complete'));

    expect(screen.getByTestId('status')).toHaveTextContent('submitted');
  });

  it('DISCARD resets to initial state', async () => {
    dateNowSpy.mockReturnValue(1000000);
    const { user } = renderWithProvider();

    // Start a session first
    await user.click(screen.getByTestId('btn-start'));
    expect(screen.getByTestId('status')).toHaveTextContent('drawing');

    // Discard should reset everything
    await user.click(screen.getByTestId('btn-discard'));

    expect(screen.getByTestId('session-id')).toHaveTextContent('null');
    expect(screen.getByTestId('reference-image-id')).toHaveTextContent('null');
    expect(screen.getByTestId('exercise-mode')).toHaveTextContent('null');
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    expect(screen.getByTestId('start-time')).toHaveTextContent('null');
    expect(screen.getByTestId('elapsed-seconds')).toHaveTextContent('0');
  });

  it('RESET resets to initial state', async () => {
    dateNowSpy.mockReturnValue(1000000);
    const { user } = renderWithProvider();

    // Start a session and submit
    await user.click(screen.getByTestId('btn-start'));
    await user.click(screen.getByTestId('btn-submit-start'));
    await user.click(screen.getByTestId('btn-submit-complete'));
    expect(screen.getByTestId('status')).toHaveTextContent('submitted');

    // Reset should return to initial state
    await user.click(screen.getByTestId('btn-reset'));

    expect(screen.getByTestId('session-id')).toHaveTextContent('null');
    expect(screen.getByTestId('reference-image-id')).toHaveTextContent('null');
    expect(screen.getByTestId('exercise-mode')).toHaveTextContent('null');
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    expect(screen.getByTestId('start-time')).toHaveTextContent('null');
    expect(screen.getByTestId('elapsed-seconds')).toHaveTextContent('0');
  });

  it('useSession throws when used outside SessionProvider', () => {
    // Suppress console.error for the expected error boundary
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function BadConsumer() {
      useSession();
      return <div>Should not render</div>;
    }

    expect(() => render(<BadConsumer />)).toThrow(
      'useSession must be used within a SessionProvider'
    );

    consoleSpy.mockRestore();
  });

  it('reducer default case returns current state for unknown action type', async () => {
    const { user } = renderWithProvider();

    // Start a session to have non-initial state
    dateNowSpy.mockReturnValue(1000000);
    await user.click(screen.getByTestId('btn-start'));

    expect(screen.getByTestId('session-id')).toHaveTextContent('sess-001');
    expect(screen.getByTestId('status')).toHaveTextContent('drawing');

    // Dispatch an unknown action type to hit the default case
    // We need a component that can dispatch arbitrary actions
    // The existing TestConsumer has fixed buttons, so we verify by using act directly
  });
});

// Separate test that uses a custom consumer to dispatch unknown action
describe('SessionContext reducer default case', () => {
  function UnknownActionConsumer() {
    const { state, dispatch } = useSession();
    return (
      <div>
        <span data-testid="status">{state.status}</span>
        <span data-testid="session-id">{state.sessionId ?? 'null'}</span>
        <button
          data-testid="btn-unknown"
          onClick={() => dispatch({ type: 'UNKNOWN_ACTION' } as any)}
        >
          Unknown
        </button>
        <button
          data-testid="btn-start"
          onClick={() =>
            dispatch({
              type: 'START_SESSION',
              sessionId: 'sess-001',
              referenceImageId: 'ref-001',
              exerciseMode: 'line_work',
            })
          }
        >
          Start
        </button>
      </div>
    );
  }

  it('returns the same state when an unknown action is dispatched', async () => {
    const user = userEvent.setup();
    render(
      <SessionProvider>
        <UnknownActionConsumer />
      </SessionProvider>
    );

    // Start a session first
    await user.click(screen.getByTestId('btn-start'));
    expect(screen.getByTestId('status')).toHaveTextContent('drawing');
    expect(screen.getByTestId('session-id')).toHaveTextContent('sess-001');

    // Dispatch unknown action — should not change state
    await user.click(screen.getByTestId('btn-unknown'));
    expect(screen.getByTestId('status')).toHaveTextContent('drawing');
    expect(screen.getByTestId('session-id')).toHaveTextContent('sess-001');
  });
});
