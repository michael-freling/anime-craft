import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FeedbackPage from '../../pages/FeedbackPage';

const mockGetFeedback = vi.fn();
const mockRequestFeedback = vi.fn();
const mockGetSession = vi.fn();
const mockGetReference = vi.fn();
const mockGetDrawing = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/feedbackservice.js', () => ({
  GetFeedback: (...args: any[]) => mockGetFeedback(...args),
  RequestFeedback: (...args: any[]) => mockRequestFeedback(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/sessionservice.js', () => ({
  GetSession: (...args: any[]) => mockGetSession(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js', () => ({
  GetReference: (...args: any[]) => mockGetReference(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/drawingservice.js', () => ({
  GetDrawing: (...args: any[]) => mockGetDrawing(...args),
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
      overallScore: 75,
      proportionsScore: 80,
      lineQualityScore: 70,
      colorAccuracyScore: null,
      summary: 'Good attempt with room for improvement.',
      details: 'Your line work shows promise.',
      strengths: ['Clean line strokes', 'Good proportions'],
      improvements: ['Work on line confidence', 'Practice curves'],
    });
    mockGetSession.mockResolvedValue({
      id: 'session-001',
      referenceImageId: 'ref-001',
    });
    mockGetReference.mockResolvedValue({
      id: 'ref-001',
      filePath: 'references/face.png',
    });
    mockGetDrawing.mockResolvedValue({
      id: 'drawing-001',
      filePath: 'drawings/drawing-001.png',
    });
  });

  it('shows loading state initially', () => {
    mockGetFeedback.mockReturnValue(new Promise(() => {})); // never resolves
    renderFeedbackPage();
    expect(screen.getByText('Analyzing your drawing...')).toBeInTheDocument();
  });

  it('renders score display with feedback data', async () => {
    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByText('75')).toBeInTheDocument();
    });
    expect(screen.getByText('Overall Score')).toBeInTheDocument();
  });

  it('shows strengths and improvements lists', async () => {
    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByText('Clean line strokes')).toBeInTheDocument();
    });
    expect(screen.getByText('Good proportions')).toBeInTheDocument();
    expect(screen.getByText('Work on line confidence')).toBeInTheDocument();
    expect(screen.getByText('Practice curves')).toBeInTheDocument();
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
      overallScore: 60,
      proportionsScore: 55,
      lineQualityScore: 65,
      colorAccuracyScore: null,
      summary: 'First feedback generated.',
      details: 'Details here.',
      strengths: ['Effort'],
      improvements: ['Everything'],
    });

    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByText('60')).toBeInTheDocument();
    });
    expect(screen.getByText('First feedback generated.')).toBeInTheDocument();
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
  });

  it('shows category breakdown with null scores', async () => {
    mockGetFeedback.mockResolvedValue({
      overallScore: 50,
      proportionsScore: null,
      lineQualityScore: null,
      colorAccuracyScore: null,
      summary: 'Minimal feedback.',
      details: '',
      strengths: [],
      improvements: [],
    });

    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByText('50')).toBeInTheDocument();
    });
  });

  it('handles feedback with empty strengths and improvements arrays', async () => {
    mockGetFeedback.mockResolvedValue({
      overallScore: 80,
      proportionsScore: 75,
      lineQualityScore: 85,
      colorAccuracyScore: 70,
      summary: 'Good work.',
      details: 'Nice job.',
      strengths: [],
      improvements: [],
    });

    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByText('80')).toBeInTheDocument();
    });
    expect(screen.getByText('Good work.')).toBeInTheDocument();
  });

  it('handles feedback with null strengths/improvements (uses empty arrays)', async () => {
    mockGetFeedback.mockResolvedValue({
      overallScore: 70,
      proportionsScore: null,
      lineQualityScore: null,
      colorAccuracyScore: null,
      summary: 'Basic feedback.',
      details: '',
      strengths: null,
      improvements: null,
    });

    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByText('70')).toBeInTheDocument();
    });
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
      overallScore: 75,
      proportionsScore: 80,
      lineQualityScore: 70,
      colorAccuracyScore: null,
      summary: 'Good.',
      details: 'Details.',
      strengths: ['A'],
      improvements: ['B'],
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
    mockGetReference.mockReturnValue(new Promise((resolve) => { resolveRef = resolve; }));
    mockGetDrawing.mockReturnValue(new Promise((resolve) => { resolveDrawing = resolve; }));

    const { unmount } = renderFeedbackPage();

    // Wait for GetSession to be called (feedback and session have resolved)
    await waitFor(() => {
      expect(mockGetReference).toHaveBeenCalled();
    });

    // Unmount before images resolve
    unmount();

    resolveRef({ id: 'ref-001', filePath: 'references/face.png' });
    resolveDrawing({ id: 'drawing-001', filePath: 'drawings/drawing-001.png' });

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

  it('does not render side-by-side when reference or drawing URLs are empty', async () => {
    // Make GetSession resolve but GetReference/GetDrawing return empty filePaths
    mockGetReference.mockResolvedValue({ id: 'ref-001', filePath: '' });
    mockGetDrawing.mockResolvedValue({ id: 'drawing-001', filePath: '' });

    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByText('75')).toBeInTheDocument();
    });

    // Side-by-side should not be rendered since filePaths are empty strings (falsy)
    expect(screen.queryByTestId('side-by-side')).not.toBeInTheDocument();
  });

  it('shows "Failed to load feedback" when error is null but feedback is also null', async () => {
    // This tests the `error || "Failed to load feedback"` expression on line 104
    // where error is null but !feedback is true.
    // When feedback data causes a TypeError (e.g., accessing .overallScore on null),
    // the catch block sets error. But we can also get the !feedback branch
    // by having the try block not set feedback at all (e.g., cancelled).
    // Simplest: make GetFeedback return undefined-like data that doesn't set feedback properly.

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
