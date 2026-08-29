import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDrawingAutosave } from '../../hooks/useDrawingAutosave';

interface Change {
  id: number;
}

function setup(overrides: Record<string, unknown> = {}) {
  // A queue of unsaved changes, the way the editor's log behaves: getPending
  // reports what is outstanding, and a save clears it.
  let pending: Change | null = null;
  const save = vi.fn().mockImplementation(async () => {
    pending = null;
  });

  const view = renderHook(
    ({ revision }: { revision: number }) =>
      useDrawingAutosave<Change>({
        revision,
        getPending: () => pending,
        save,
        debounceMs: 1000,
        maxDelayMs: 5000,
        retryDelayMs: 3000,
        ...overrides,
      }),
    { initialProps: { revision: 0 } },
  );

  const change = async (revision: number) => {
    pending = { id: revision };
    await act(async () => {
      view.rerender({ revision });
    });
  };

  return { view, save, change, setPending: (value: Change | null) => (pending = value) };
}

const tick = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});

describe('useDrawingAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves nothing while nothing has changed', async () => {
    const { save } = setup();

    await tick(10000);

    expect(save).not.toHaveBeenCalled();
  });

  // The point of the debounce: a burst of strokes is one save, not twenty.
  it('waits for a pause, then saves once for the whole burst', async () => {
    const { save, change } = setup();

    await change(1);
    await tick(400);
    await change(2);
    await tick(400);
    await change(3);
    expect(save).not.toHaveBeenCalled();

    await tick(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ id: 3 });
  });

  // Someone sketching without a pause still has to be covered.
  it('saves during continuous drawing once the longest wait is up', async () => {
    const { save, change } = setup();

    for (let i = 1; i <= 12; i++) {
      await change(i);
      await tick(500);
    }

    expect(save).toHaveBeenCalled();
  });

  it('reports what it has saved', async () => {
    const { view, save, change } = setup();

    expect(view.result.current.status).toBe('idle');
    expect(view.result.current.lastSavedAt).toBeNull();

    await change(1);
    await tick(1000);

    expect(save).toHaveBeenCalled();
    expect(view.result.current.status).toBe('saved');
    expect(view.result.current.lastSavedAt).not.toBeNull();
  });

  it('keeps one save in flight and sends the rest afterwards', async () => {
    let release: (() => void) | undefined;
    let pending: Change | null = null;
    const save = vi.fn().mockImplementation(
      (value: Change) =>
        new Promise<void>((resolve) => {
          release = () => {
            if (pending?.id === value.id) pending = null;
            resolve();
          };
        }),
    );

    const view = renderHook(
      ({ revision }: { revision: number }) =>
        useDrawingAutosave<Change>({
          revision,
          getPending: () => pending,
          save,
          debounceMs: 1000,
          maxDelayMs: 5000,
        }),
      { initialProps: { revision: 0 } },
    );

    pending = { id: 1 };
    await act(async () => view.rerender({ revision: 1 }));
    await tick(1000);
    expect(save).toHaveBeenCalledTimes(1);

    // More work arrives while the first save is still out.
    pending = { id: 2 };
    await act(async () => view.rerender({ revision: 2 }));
    await tick(1000);
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.();
    });
    await tick(1000);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ id: 2 });
  });

  // A failed save must not lose the work: the editor still has it, so try
  // again rather than pretend it is saved.
  it('reports a failure and tries again', async () => {
    let pending: Change | null = { id: 1 };
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockImplementation(async () => {
        pending = null;
      });

    const view = renderHook(
      ({ revision }: { revision: number }) =>
        useDrawingAutosave<Change>({
          revision,
          getPending: () => pending,
          save,
          debounceMs: 1000,
          maxDelayMs: 5000,
          retryDelayMs: 3000,
        }),
      { initialProps: { revision: 0 } },
    );

    await act(async () => view.rerender({ revision: 1 }));
    await tick(1000);

    expect(view.result.current.status).toBe('error');
    expect(view.result.current.error).toBe('disk full');

    await tick(3000);

    expect(save).toHaveBeenCalledTimes(2);
    expect(view.result.current.status).toBe('saved');
  });

  it('saves immediately when asked to flush', async () => {
    const { view, save, change } = setup();

    await change(1);
    await act(async () => {
      await view.result.current.flush();
    });

    expect(save).toHaveBeenCalledTimes(1);
  });

  // Leaving the page is the one moment a debounce would cost the artist work.
  it('saves what is outstanding when the editor goes away', async () => {
    const { view, save, change } = setup();

    await change(1);
    await act(async () => {
      view.unmount();
    });

    expect(save).toHaveBeenCalledWith({ id: 1 });
  });

  it('stays quiet until it is turned on', async () => {
    const { save, change } = setup({ enabled: false });

    await change(1);
    await tick(10000);

    expect(save).not.toHaveBeenCalled();
  });
});
