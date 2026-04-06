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

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/feedbackservice.js', () => ({
  GetFeedback: (...args: any[]) => mockGetFeedback(...args),
  RequestFeedback: (...args: any[]) => mockRequestFeedback(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/sessionservice.js', () => ({
  GetSession: (...args: any[]) => mockGetSession(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/referenceservice.js', () => ({
  GetReference: (...args: any[]) => mockGetReference(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/drawingservice.js', () => ({
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
      colorAccuracyScore: 65,
      summary: 'Good attempt with room for improvement.',
      details: 'Your line work shows promise.',
      strengths: ['Clean line strokes', 'Good proportions'],
      improvements: ['Work on line confidence', 'Practice curves'],
      referenceLineArt: '',
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
    expect(screen.getByText('Generating AI feedback...')).toBeInTheDocument();
  });

  it('renders scores when feedback has scores', async () => {
    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByTestId('feedback-scores')).toBeInTheDocument();
    });

    expect(screen.getByTestId('score-bar-overall')).toBeInTheDocument();
    expect(screen.getByTestId('score-bar-proportions')).toBeInTheDocument();
    expect(screen.getByTestId('score-bar-line-quality')).toBeInTheDocument();
    expect(screen.getByTestId('score-bar-accuracy')).toBeInTheDocument();

    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('70')).toBeInTheDocument();
    expect(screen.getByText('65')).toBeInTheDocument();
  });

  it('renders summary and details', async () => {
    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByTestId('feedback-summary')).toBeInTheDocument();
    });

    expect(screen.getByText('Good attempt with room for improvement.')).toBeInTheDocument();
    expect(screen.getByText('Your line work shows promise.')).toBeInTheDocument();
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

  it('shows "What you did well" and "Areas to improve" headings', async () => {
    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByText('What you did well')).toBeInTheDocument();
    });
    expect(screen.getByText('Areas to improve')).toBeInTheDocument();
  });

  it('handles missing/zero scores gracefully', async () => {
    mockGetFeedback.mockResolvedValue({
      overallScore: 0,
      proportionsScore: null,
      lineQualityScore: null,
      colorAccuracyScore: null,
      summary: '',
      details: '',
      strengths: [],
      improvements: [],
      referenceLineArt: '',
    });

    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByTestId('feedback-scores')).toBeInTheDocument();
    });

    expect(screen.getByTestId('feedback-scores-analyzing')).toBeInTheDocument();
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
    expect(screen.queryByTestId('feedback-details')).not.toBeInTheDocument();
  });

  it('handles partially missing scores', async () => {
    mockGetFeedback.mockResolvedValue({
      overallScore: 75,
      proportionsScore: null,
      lineQualityScore: null,
      colorAccuracyScore: null,
      summary: 'Some feedback.',
      details: '',
      strengths: [],
      improvements: [],
      referenceLineArt: '',
    });

    renderFeedbackPage();

    await waitFor(() => {
      expect(screen.getByTestId('score-bar-overall')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('score-bar-proportions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('score-bar-line-quality')).not.toBeInTheDocument();
    expect(screen.queryByTestId('score-bar-accuracy')).not.toBeInTheDocument();
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

  it('renders line art panel when referenceLineArt is provided', async () => {
    mockGetFeedback.mockResolvedValue({
      overallScore: 75,
      proportionsScore: 80,
      lineQualityScore: 70,
      colorAccuracyScore: null,
      summary: 'Good attempt.',
      details: 'Details here.',
      strengths: ['Good proportions'],
      improvements: ['Practice more'],
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
});
