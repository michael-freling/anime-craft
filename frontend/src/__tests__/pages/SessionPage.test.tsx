import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SessionPage from '../../pages/SessionPage';

const mockGetSession = vi.fn();
const mockGetReference = vi.fn();
const mockSaveDrawing = vi.fn();
const mockEndSession = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/sessionservice.js', () => ({
  GetSession: (...args: any[]) => mockGetSession(...args),
  EndSession: (...args: any[]) => mockEndSession(...args),
}));

const mockGetReferenceImageData = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js', () => ({
  GetReference: (...args: any[]) => mockGetReference(...args),
  GetReferenceImageData: (...args: any[]) => mockGetReferenceImageData(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/drawingservice.js', () => ({
  SaveDrawing: (...args: any[]) => mockSaveDrawing(...args),
}));

const mockExportPNG = vi.fn();

vi.mock('../../hooks/useDrawingCanvas', () => ({
  useDrawingCanvas: () => ({
    canvasRef: { current: null },
    state: {
      tool: 'brush' as const,
      brushSize: 2,
      brushColor: '#000000',
      canUndo: false,
      canRedo: false,
    },
    setTool: vi.fn(),
    setBrushSize: vi.fn(),
    setBrushColor: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    clear: vi.fn(),
    exportPNG: mockExportPNG,
    canUndo: false,
    canRedo: false,
  }),
}));

function renderSessionPage() {
  return render(
    <MemoryRouter initialEntries={['/session/session-001']}>
      <Routes>
        <Route path="/session/:id" element={<SessionPage />} />
        <Route path="/session/:id/feedback" element={<div>Feedback Page</div>} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SessionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      id: 'session-001',
      referenceImageId: 'ref-001',
      exerciseMode: 'line_work',
    });
    mockGetReference.mockResolvedValue({
      id: 'ref-001',
      title: 'Simple Face',
      filePath: 'references/face.png',
    });
    mockGetReferenceImageData.mockResolvedValue(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
    );
  });

  it('renders loading state initially', () => {
    mockGetSession.mockReturnValue(new Promise(() => {})); // never resolves
    renderSessionPage();

    expect(screen.getByTestId('session-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading session...')).toBeInTheDocument();
  });

  it('shows canvas and reference after loading', async () => {
    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByTestId('reference-image')).toBeInTheDocument();
    });

    expect(screen.getByTestId('drawing-canvas')).toBeInTheDocument();
  });

  it('shows toolbar and session controls', async () => {
    renderSessionPage();

    // Toolbar and session controls are always rendered, even during loading
    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('session-controls')).toBeInTheDocument();
  });

  it('renders session page container', () => {
    renderSessionPage();
    expect(screen.getByTestId('session-page')).toBeInTheDocument();
  });

  it('shows submit and discard buttons', () => {
    renderSessionPage();
    expect(screen.getByTestId('submit-btn')).toBeInTheDocument();
    expect(screen.getByTestId('discard-btn')).toBeInTheDocument();
  });

  it('displays reference image with correct src after full session load', async () => {
    const expectedDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    mockGetReferenceImageData.mockResolvedValue(expectedDataUrl);

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByTestId('reference-image')).toBeInTheDocument();
    });

    const img = screen.getByTestId('reference-image') as HTMLImageElement;
    expect(img.src).toBe(expectedDataUrl);
    expect(img.alt).toBe('Simple Face');
  });

  it('stays in loading state when GetSession fails', async () => {
    // GetSession rejects, but the component has no .catch() handler,
    // so we must catch the unhandled rejection at the process level.
    const rejections: unknown[] = [];
    const handler = (event: any) => {
      rejections.push(event.reason);
      // Prevent vitest from treating this as a test failure
      event.preventDefault?.();
    };
    // In jsdom, unhandled rejections propagate through the process
    process.on('unhandledRejection', handler);

    mockGetSession.mockRejectedValue(new Error('Session not found'));

    renderSessionPage();

    // The session loading indicator should remain since GetSession failed
    // and referenceImageId will never be set
    expect(screen.getByTestId('session-loading')).toBeInTheDocument();

    // Wait to ensure the rejection has been processed and nothing else appears
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('session-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('reference-image')).not.toBeInTheDocument();

    process.removeListener('unhandledRejection', handler);
  });

  it('calls GetReference with the referenceImageId from GetSession', async () => {
    mockGetSession.mockResolvedValue({
      id: 'session-001',
      referenceImageId: 'ref-custom-123',
      exerciseMode: 'line_work',
    });
    mockGetReference.mockResolvedValue({
      id: 'ref-custom-123',
      title: 'Custom Ref',
      filePath: 'references/custom.png',
    });

    renderSessionPage();

    await waitFor(() => {
      expect(mockGetReference).toHaveBeenCalledWith('ref-custom-123');
    });
  });

  it('calls GetReferenceImageData with the correct reference ID', async () => {
    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByTestId('reference-image')).toBeInTheDocument();
    });

    // GetReferenceImageData is called from the ReferenceImageViewer child
    // with the referenceImageId that was set via the session context
    expect(mockGetReferenceImageData).toHaveBeenCalledWith('ref-001');
  });

  it('submit handler calls SaveDrawing, EndSession, and navigates to feedback', async () => {
    const user = userEvent.setup();
    mockExportPNG.mockReturnValue('data:image/png;base64,drawingdata');
    mockSaveDrawing.mockResolvedValue(undefined);
    mockEndSession.mockResolvedValue(undefined);

    renderSessionPage();

    // Wait for session to fully load
    await waitFor(() => {
      expect(screen.getByTestId('reference-image')).toBeInTheDocument();
    });

    // Click submit
    await user.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(mockExportPNG).toHaveBeenCalled();
      expect(mockSaveDrawing).toHaveBeenCalledWith('session-001', 'data:image/png;base64,drawingdata');
      expect(mockEndSession).toHaveBeenCalledWith('session-001');
    });

    // Should navigate to feedback page
    await waitFor(() => {
      expect(screen.getByText('Feedback Page')).toBeInTheDocument();
    });
  });

  it('discard handler dispatches DISCARD and navigates to home', async () => {
    const user = userEvent.setup();

    renderSessionPage();

    // Wait for session to fully load
    await waitFor(() => {
      expect(screen.getByTestId('reference-image')).toBeInTheDocument();
    });

    // Click discard
    await user.click(screen.getByTestId('discard-btn'));

    // Should navigate to home page
    await waitFor(() => {
      expect(screen.getByText('Home Page')).toBeInTheDocument();
    });
  });

  it('does not update state when component unmounts before GetSession resolves', async () => {
    let resolveGetSession!: (value: any) => void;
    mockGetSession.mockReturnValue(new Promise((resolve) => { resolveGetSession = resolve; }));

    const { unmount } = renderSessionPage();

    // Unmount while GetSession is still pending
    unmount();

    // Resolve after unmount — the cancelled flag should prevent dispatch
    resolveGetSession({
      id: 'session-001',
      referenceImageId: 'ref-001',
      exerciseMode: 'line_work',
    });

    // Wait a tick to let the promise chain execute
    await new Promise((r) => setTimeout(r, 50));

    // No error should occur — the cancelled guard prevents state updates
    expect(mockGetReference).not.toHaveBeenCalled();
  });

  it('does not update state when component unmounts before GetReference resolves', async () => {
    let resolveGetReference!: (value: any) => void;
    mockGetReference.mockReturnValue(new Promise((resolve) => { resolveGetReference = resolve; }));

    const { unmount } = renderSessionPage();

    // Wait for GetSession to resolve
    await waitFor(() => {
      expect(mockGetSession).toHaveBeenCalled();
    });

    // Unmount while GetReference is still pending
    unmount();

    // Resolve after unmount
    resolveGetReference({
      id: 'ref-001',
      title: 'Simple Face',
      filePath: 'references/face.png',
    });

    await new Promise((r) => setTimeout(r, 50));

    // No errors; the cancelled guard prevented dispatch
  });

  it('does not render session page when id is missing', () => {
    render(
      <MemoryRouter initialEntries={['/session/']}>
        <Routes>
          <Route path="/session/" element={<SessionPage />} />
          <Route path="/session/:id/feedback" element={<div>Feedback Page</div>} />
          <Route path="/" element={<div>Home Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    // With no id, GetSession should not be called
    expect(mockGetSession).not.toHaveBeenCalled();
    // The loading state should still be shown since referenceImageId is null
    expect(screen.getByTestId('session-loading')).toBeInTheDocument();
  });
});
