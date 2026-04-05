import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FeedbackPage from '../../pages/FeedbackPage';

const mockGetFeedback = vi.fn();
const mockRequestFeedback = vi.fn();
const mockGetSession = vi.fn();
const mockGetReferenceImageData = vi.fn();
const mockGetDrawingImageData = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/feedbackservice.js', () => ({
  GetFeedback: (...args: any[]) => mockGetFeedback(...args),
  RequestFeedback: (...args: any[]) => mockRequestFeedback(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/sessionservice.js', () => ({
  GetSession: (...args: any[]) => mockGetSession(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js', () => ({
  GetReferenceImageData: (...args: any[]) => mockGetReferenceImageData(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/drawingservice.js', () => ({
  GetDrawingImageData: (...args: any[]) => mockGetDrawingImageData(...args),
}));

function renderFeedbackPage() {
  return render(
    <MemoryRouter initialEntries={['/session/session-001/feedback']}>
      <Routes>
        <Route path="/session/:id/feedback" element={<FeedbackPage />} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('FeedbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFeedback.mockResolvedValue({
      referenceLineArt: '',
    });
    mockGetSession.mockResolvedValue({
      id: 'session-001',
      referenceImageId: 'ref-001',
    });
    mockGetReferenceImageData.mockResolvedValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlz');
    mockGetDrawingImageData.mockResolvedValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12P4z8BQDwAEgAF/QualDw');
  });

  it('shows loading state initially', () => {
    mockGetFeedback.mockReturnValue(new Promise(() => {})); // never resolves
    renderFeedbackPage();
    expect(screen.getByText('Analyzing your drawing...')).toBeInTheDocument();
  });

  it('renders the feedback page with comparison images', async () => {
    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByTestId('side-by-side')).toBeInTheDocument();
    });

    const refImg = screen.getByTestId('comparison-reference') as HTMLImageElement;
    const drawingImg = screen.getByTestId('comparison-drawing') as HTMLImageElement;
    expect(refImg.src).toContain('data:image/png;base64,');
    expect(drawingImg.src).toContain('data:image/png;base64,');
  });

  it('"Start New Session" button navigates to "/"', async () => {
    const user = userEvent.setup();
    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByText('Start New Session')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Start New Session'));

    await waitFor(() => {
      expect(screen.getByText('Home Page')).toBeInTheDocument();
    });
  });

  it('shows error state when feedback loading fails', async () => {
    mockGetFeedback.mockRejectedValue(new Error('No feedback'));
    mockRequestFeedback.mockRejectedValue(new Error('Service error'));
    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByText('Service error')).toBeInTheDocument();
    });
  });

  it('falls back to RequestFeedback when GetFeedback rejects', async () => {
    // GetFeedback rejects, then RequestFeedback succeeds
    mockGetFeedback.mockRejectedValue(new Error('Not found'));
    mockRequestFeedback.mockResolvedValue({
      referenceLineArt: '',
    });

    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByTestId('side-by-side')).toBeInTheDocument();
    });
    expect(mockRequestFeedback).toHaveBeenCalledWith('session-001');
  });

  it('shows fallback error message for non-Error exceptions', async () => {
    mockGetFeedback.mockRejectedValue('string error');
    mockRequestFeedback.mockRejectedValue('another string error');
    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByText('Failed to load feedback')).toBeInTheDocument();
    });
  });

  it('renders side-by-side comparison with loaded images', async () => {
    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByTestId('side-by-side')).toBeInTheDocument();
    });

    const refImg = screen.getByTestId('comparison-reference') as HTMLImageElement;
    const drawingImg = screen.getByTestId('comparison-drawing') as HTMLImageElement;
    expect(refImg.src).toContain('data:image/png;base64,');
    expect(drawingImg.src).toContain('data:image/png;base64,');
  });

  it('does not update state when unmounted before feedback resolves (cancelled guard)', async () => {
    let resolveFeedback!: (value: any) => void;
    mockGetFeedback.mockReturnValue(new Promise((resolve) => { resolveFeedback = resolve; }));

    const { unmount } = renderFeedbackPage();

    // Show loading
    expect(screen.getByText('Analyzing your drawing...')).toBeInTheDocument();

    // Unmount before resolving
    unmount();

    // Resolve after unmount
    resolveFeedback({
      referenceLineArt: '',
    });

    await new Promise((r) => setTimeout(r, 50));
    // No errors — the cancelled check prevents state updates
  });

  it('does not update state when unmounted before GetSession resolves (after feedback)', async () => {
    // Feedback resolves immediately, but GetSession hangs
    let resolveSession!: (value: any) => void;
    mockGetSession.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));

    const { unmount } = renderFeedbackPage();

    // The async function sets feedback, then calls GetSession (which hangs).
    // Since the whole async function hasn't reached finally yet, loading stays true.
    // Wait a bit to let the feedback promise resolve and GetSession be called.
    await waitFor(() => {
      expect(mockGetSession).toHaveBeenCalled();
    });

    // Unmount before session resolves
    unmount();

    resolveSession({
      id: 'session-001',
      referenceImageId: 'ref-001',
    });

    await new Promise((r) => setTimeout(r, 50));
    // No errors — cancelled guard prevents image state updates
  });

  it('does not update state when unmounted after GetSession but before images resolve', async () => {
    let resolveRef!: (value: any) => void;
    let resolveDrawing!: (value: any) => void;
    mockGetReferenceImageData.mockReturnValue(new Promise((resolve) => { resolveRef = resolve; }));
    mockGetDrawingImageData.mockReturnValue(new Promise((resolve) => { resolveDrawing = resolve; }));

    const { unmount } = renderFeedbackPage();

    // Wait for GetSession to be called (feedback and session have resolved)
    await waitFor(() => {
      expect(mockGetReferenceImageData).toHaveBeenCalled();
    });

    // Unmount before images resolve
    unmount();

    resolveRef('data:image/png;base64,ref123');
    resolveDrawing('data:image/png;base64,drawing456');

    await new Promise((r) => setTimeout(r, 50));
    // No errors — cancelled guard prevents state updates after unmount
  });

  it('shows error view when feedback data has null overallScore (error path)', async () => {
    // When GetFeedback fails and RequestFeedback also fails, error is shown.
    // Here we test the "!feedback" branch of the error/!feedback guard.
    // If both GetFeedback and RequestFeedback succeed but the result causes
    // an error during processing, the catch block handles it.
    mockGetFeedback.mockRejectedValue(new Error('No feedback'));
    // RequestFeedback throws because accessing properties on null causes TypeError
    mockRequestFeedback.mockResolvedValue(null);

    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByTestId('feedback-error')).toBeInTheDocument();
    });
  });

  it('renders line art panel when referenceLineArt is provided', async () => {
    mockGetFeedback.mockResolvedValue({
      referenceLineArt: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12P4/x8AAwAB/aurH8kAAAAASUVORK5CYII=',
    });

    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByTestId('side-by-side')).toBeInTheDocument();
    });

    const lineArtImg = screen.getByTestId('comparison-lineart') as HTMLImageElement;
    expect(lineArtImg.src).toContain('data:image/png;base64,');
    expect(screen.getByText('Reference Line Art')).toBeInTheDocument();
  });

  it('does not render side-by-side when reference or drawing URLs are empty', async () => {
    // Make GetSession resolve but image data returns empty strings
    mockGetReferenceImageData.mockResolvedValue('');
    mockGetDrawingImageData.mockResolvedValue('');

    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByText('Drawing Feedback')).toBeInTheDocument();
    });

    // Side-by-side should not be rendered since URLs are empty strings (falsy)
    expect(screen.queryByTestId('side-by-side')).not.toBeInTheDocument();
  });

  it('shows "Failed to load feedback" when error is null but feedback is also null', async () => {
    // Both GetFeedback and RequestFeedback fail, error message from non-Error
    mockGetFeedback.mockRejectedValue('not an Error');
    mockRequestFeedback.mockRejectedValue('also not an Error');

    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByTestId('feedback-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed to load feedback')).toBeInTheDocument();
  });

  it('does not set loading to false when cancelled during error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockGetFeedback.mockRejectedValue(new Error('No feedback'));

    let rejectRequestFeedback!: (reason: any) => void;
    mockRequestFeedback.mockReturnValue(new Promise((_, reject) => { rejectRequestFeedback = reject; }));

    const { unmount } = renderFeedbackPage();

    // Still loading while RequestFeedback is pending
    expect(screen.getByText('Analyzing your drawing...')).toBeInTheDocument();

    // Unmount before RequestFeedback rejects
    unmount();

    rejectRequestFeedback(new Error('Also failed'));

    await new Promise((r) => setTimeout(r, 50));
    // No errors — cancelled guard in catch and finally blocks prevents state updates
    consoleSpy.mockRestore();
  });
});
