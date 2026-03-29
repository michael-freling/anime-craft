import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js', () => ({
  GetReference: (...args: any[]) => mockGetReference(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/drawingservice.js', () => ({
  SaveDrawing: (...args: any[]) => mockSaveDrawing(...args),
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
      expect(screen.getByTestId('reference-placeholder')).toBeInTheDocument();
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
});
