import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReferencePlacement } from '../../hooks/useReferencePlacement';

const mockOpen = vi.fn();
const mockClose = vi.fn();
const mockIsOpen = vi.fn();

vi.mock(
  '../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/referencewindowservice.js',
  () => ({
    OpenReferenceWindow: (...args: any[]) => mockOpen(...args),
    CloseReferenceWindow: (...args: any[]) => mockClose(...args),
    IsReferenceWindowOpen: (...args: any[]) => mockIsOpen(...args),
  })
);

// The window announces its own closing, which is the one state change the
// editor cannot see for itself.
let closedListener: (() => void) | undefined;
const mockEventsOn = vi.fn((_name: string, callback: () => void) => {
  closedListener = callback;
  return () => {
    closedListener = undefined;
  };
});

vi.mock('@wailsio/runtime', () => ({
  Events: { On: (...args: any[]) => mockEventsOn(...(args as [string, () => void])) },
}));

describe('useReferencePlacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closedListener = undefined;
    mockOpen.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockIsOpen.mockResolvedValue(false);
  });

  it('starts with the reference beside the drawing', async () => {
    const { result } = renderHook(() => useReferencePlacement('ref-001'));

    await waitFor(() => expect(mockIsOpen).toHaveBeenCalled());
    expect(result.current.placement).toBe('panel');
  });

  it('moves the reference into its own window', async () => {
    const { result } = renderHook(() => useReferencePlacement('ref-001'));

    await act(async () => {
      await result.current.setPlacement('window');
    });

    expect(mockOpen).toHaveBeenCalledWith('ref-001');
    expect(result.current.placement).toBe('window');
  });

  it('takes the window down when the reference comes back', async () => {
    const { result } = renderHook(() => useReferencePlacement('ref-001'));
    await act(async () => {
      await result.current.setPlacement('window');
    });

    await act(async () => {
      await result.current.setPlacement('panel');
    });

    expect(mockClose).toHaveBeenCalled();
    expect(result.current.placement).toBe('panel');
  });

  // Hiding is for a single screen, where a floating window would cover the
  // drawing it made room for — so it must not leave one open.
  it('closes the window when the reference is hidden instead', async () => {
    const { result } = renderHook(() => useReferencePlacement('ref-001'));
    await act(async () => {
      await result.current.setPlacement('window');
    });
    mockClose.mockClear();

    await act(async () => {
      await result.current.setPlacement('hidden');
    });

    expect(mockClose).toHaveBeenCalled();
    expect(result.current.placement).toBe('hidden');
  });

  // Closing the window from its own title bar has to reach the editor, or it
  // would go on claiming the reference is somewhere it is not.
  it('puts the reference back when the window is closed from its title bar', async () => {
    const { result } = renderHook(() => useReferencePlacement('ref-001'));
    await act(async () => {
      await result.current.setPlacement('window');
    });
    expect(result.current.placement).toBe('window');

    await waitFor(() => expect(closedListener).toBeDefined());
    act(() => closedListener!());

    expect(result.current.placement).toBe('panel');
  });

  // A session opened while the window is already up should lay itself out for
  // that, rather than showing the reference twice.
  it('notices a window that is already open', async () => {
    mockIsOpen.mockResolvedValue(true);

    const { result } = renderHook(() => useReferencePlacement('ref-001'));

    await waitFor(() => expect(result.current.placement).toBe('window'));
  });

  it('reports a window that would not open, and stays put', async () => {
    mockOpen.mockRejectedValue(new Error('this build cannot open a second window'));
    const { result } = renderHook(() => useReferencePlacement('ref-001'));

    await act(async () => {
      await result.current.setPlacement('window');
    });

    expect(result.current.error).toBe('this build cannot open a second window');
    expect(result.current.placement).toBe('panel');
    expect(result.current.busy).toBe(false);
  });

  it('has nothing to put in a window before the reference is known', async () => {
    const { result } = renderHook(() => useReferencePlacement(null));

    await act(async () => {
      await result.current.setPlacement('window');
    });

    expect(mockOpen).not.toHaveBeenCalled();
  });

  // A reference floating above everything else, for a session no longer open,
  // is only in the way.
  it('takes the window with it when the drawing is left', async () => {
    const { result, unmount } = renderHook(() => useReferencePlacement('ref-001'));
    await act(async () => {
      await result.current.setPlacement('window');
    });
    mockClose.mockClear();

    unmount();

    expect(mockClose).toHaveBeenCalled();
  });
});
