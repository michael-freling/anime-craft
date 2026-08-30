import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import HomePage from '../../pages/HomePage';

const mockStartSession = vi.fn();
const mockListResumableSessions = vi.fn();
const mockDiscardSession = vi.fn();
const mockImportDrawingFile = vi.fn();
const mockDeleteDrawingDocument = vi.fn();
const mockResumeDrawing = vi.fn();
const mockGetDrawingThumbnail = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/sessionservice.js', () => ({
  StartSession: (...args: any[]) => mockStartSession(...args),
  ListResumableSessions: (...args: any[]) => mockListResumableSessions(...args),
  DiscardSession: (...args: any[]) => mockDiscardSession(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/drawingservice.js', () => ({
  ImportDrawingFile: (...args: any[]) => mockImportDrawingFile(...args),
  DeleteDrawingDocument: (...args: any[]) => mockDeleteDrawingDocument(...args),
  ResumeDrawing: (...args: any[]) => mockResumeDrawing(...args),
  GetDrawingThumbnail: (...args: any[]) => mockGetDrawingThumbnail(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/referenceservice.js', () => ({
  ListReferences: vi.fn().mockResolvedValue([
    {
      id: 'ref-001',
      title: 'Simple Face',
      filePath: 'references/face.png',
      exerciseMode: 'line_work',
      difficulty: 'beginner',
      tags: 'face',
    },
    {
      id: 'ref-002',
      title: 'Body Pose',
      filePath: 'references/body.png',
      exerciseMode: 'line_work',
      difficulty: 'intermediate',
      tags: 'body',
    },
  ]),
  AddReferenceByFilePath: vi.fn().mockResolvedValue({}),
  GetReferenceImageData: vi
    .fn()
    .mockResolvedValue('data:image/png;base64,aW1n'),
}));

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartSession.mockResolvedValue({ id: 'session-001' });
    mockListResumableSessions.mockResolvedValue([]);
    mockDiscardSession.mockResolvedValue(undefined);
    mockDeleteDrawingDocument.mockResolvedValue(undefined);
    mockResumeDrawing.mockImplementation(async (id: string) => ({ id }));
    mockGetDrawingThumbnail.mockResolvedValue('data:image/png;base64,cHJldmlldw==');
  });

  it('renders the app title', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByText('Anime Craft')).toBeInTheDocument();
  });

  it('loads and displays reference images immediately', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Simple Face')).toBeInTheDocument();
    });
    expect(screen.getByText('Body Pose')).toBeInTheDocument();
  });

  it('Start Session button is disabled when no reference selected', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Simple Face')).toBeInTheDocument();
    });

    const startBtn = screen.getByText('Start Session');
    expect(startBtn).toBeDisabled();
  });

  it('Start Session button is enabled after selecting a reference', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Simple Face')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Simple Face'));

    const startBtn = screen.getByText('Start Session');
    expect(startBtn).not.toBeDisabled();
  });

  it('clicking Start Session calls StartSession with line_work mode and navigates to session page', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/session/:id" element={<div data-testid="session-page">Session Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for references to load
    await waitFor(() => {
      expect(screen.getByText('Simple Face')).toBeInTheDocument();
    });

    // Select a reference
    await user.click(screen.getByTestId('reference-card-ref-001'));

    // Click Start Session
    await user.click(screen.getByTestId('start-session-btn'));

    // Verify StartSession was called with line_work mode
    expect(mockStartSession).toHaveBeenCalledWith('line_work', 'ref-001');

    // Verify navigation to session page
    await waitFor(() => {
      expect(screen.getByTestId('session-page')).toBeInTheDocument();
    });
  });

  it('shows error message when StartSession fails', async () => {
    mockStartSession.mockRejectedValue(new Error('Server error'));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    // Wait for references to load
    await waitFor(() => {
      expect(screen.getByText('Simple Face')).toBeInTheDocument();
    });

    // Select a reference
    await user.click(screen.getByTestId('reference-card-ref-001'));

    // Click Start Session
    await user.click(screen.getByTestId('start-session-btn'));

    // Verify error message is displayed
    await waitFor(() => {
      expect(screen.getByTestId('home-error')).toBeInTheDocument();
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  function savedDrawing(overrides: Record<string, unknown> = {}) {
    return {
      id: 'session-042',
      referenceImageId: 'ref-001',
      referenceTitle: 'Simple Face',
      exerciseMode: 'line_work',
      status: 'in_progress',
      drawingStartedAt: new Date().toISOString(),
      lastSavedAt: new Date().toISOString(),
      operationCount: 12,
      lastResultSessionId: '',
      lastScore: 0,
      resultCount: 0,
      ...overrides,
    };
  }

  function renderWithSessionRoute() {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/session/:id" element={<div data-testid="session-page">Session Page</div>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('offers unfinished sessions to pick back up', async () => {
    mockListResumableSessions.mockResolvedValue([savedDrawing()]);
    const user = userEvent.setup();
    renderWithSessionRoute();

    await waitFor(() => {
      expect(screen.getByTestId('resume-item-session-042')).toBeInTheDocument();
    });
    expect(screen.getByText(/12 changes/)).toBeInTheDocument();
    expect(screen.getByTestId('resume-status-session-042')).toHaveTextContent('Unfinished');
    expect(screen.getByTestId('resume-btn-session-042')).toHaveTextContent('Resume');

    await user.click(screen.getByTestId('resume-btn-session-042'));

    expect(mockResumeDrawing).toHaveBeenCalledWith('session-042');
    await waitFor(() => {
      expect(screen.getByTestId('session-page')).toBeInTheDocument();
    });
  });

  // Submitting used to make a drawing unreachable from here, which left no
  // way back to a whole session's work.
  it('lists a submitted drawing and carries on from it in a new session', async () => {
    mockListResumableSessions.mockResolvedValue([
      savedDrawing({ status: 'completed' }),
    ]);
    mockResumeDrawing.mockResolvedValue({ id: 'session-099' });
    const user = userEvent.setup();
    renderWithSessionRoute();

    await waitFor(() => {
      expect(screen.getByTestId('resume-item-session-042')).toBeInTheDocument();
    });
    expect(screen.getByTestId('resume-status-session-042')).toHaveTextContent('Submitted');
    expect(screen.getByTestId('resume-btn-session-042')).toHaveTextContent('Keep drawing');
    // A submitted drawing can be deleted too — its score and feedback stay.
    expect(screen.getByTestId('resume-delete-session-042')).toBeInTheDocument();

    await user.click(screen.getByTestId('resume-btn-session-042'));

    expect(mockResumeDrawing).toHaveBeenCalledWith('session-042');
    await waitFor(() => {
      expect(screen.getByTestId('session-page')).toBeInTheDocument();
    });
  });

  it('says so when a saved drawing will not open', async () => {
    mockListResumableSessions.mockResolvedValue([savedDrawing()]);
    mockResumeDrawing.mockRejectedValue(new Error('load saved drawing: not found'));
    const user = userEvent.setup();
    renderWithSessionRoute();

    await waitFor(() => {
      expect(screen.getByTestId('resume-item-session-042')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('resume-btn-session-042'));

    await waitFor(() => {
      expect(screen.getByTestId('resume-sessions-error')).toHaveTextContent(
        'load saved drawing: not found'
      );
    });
    expect(screen.queryByTestId('session-page')).not.toBeInTheDocument();
  });

  it('drops a drawing from the list when it is deleted', async () => {
    mockListResumableSessions.mockResolvedValueOnce([savedDrawing({ operationCount: 1 })]);
    mockListResumableSessions.mockResolvedValue([]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('resume-item-session-042')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('resume-delete-session-042'));
    await user.click(screen.getByTestId('resume-delete-confirm-session-042'));

    expect(mockDiscardSession).toHaveBeenCalledWith('session-042');
    await waitFor(() => expect(mockDeleteDrawingDocument).toHaveBeenCalledWith('session-042'));
    await waitFor(() => {
      expect(screen.queryByTestId('resume-sessions')).not.toBeInTheDocument();
    });
  });

  it('says nothing about resuming when there is nothing to resume', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Simple Face')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('resume-sessions')).not.toBeInTheDocument();
  });

  // Reference titles repeat across sessions, so the drawing itself is what
  // tells one attempt from another.
  it('shows a preview of each drawing', async () => {
    mockListResumableSessions.mockResolvedValue([savedDrawing()]);
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('resume-preview-session-042')).toBeInTheDocument();
    });
    const preview = screen.getByTestId('resume-preview-session-042') as HTMLImageElement;
    expect(preview.src).toBe('data:image/png;base64,cHJldmlldw==');
    expect(mockGetDrawingThumbnail).toHaveBeenCalledWith('session-042');
  });

  it('keeps a placeholder for a drawing with no preview yet', async () => {
    mockListResumableSessions.mockResolvedValue([savedDrawing()]);
    mockGetDrawingThumbnail.mockResolvedValue('');
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('resume-item-session-042')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('resume-preview-session-042')).not.toBeInTheDocument();
    // The row still works without one.
    expect(screen.getByTestId('resume-btn-session-042')).toBeInTheDocument();
  });

  // Deleting a drawing is not recoverable, so it asks first.
  it('asks before deleting, and lets the artist back out', async () => {
    mockListResumableSessions.mockResolvedValue([savedDrawing()]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('resume-item-session-042')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('resume-delete-session-042'));
    expect(screen.getByText('Delete this drawing?')).toBeInTheDocument();
    expect(mockDeleteDrawingDocument).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('resume-delete-cancel-session-042'));
    expect(screen.queryByText('Delete this drawing?')).not.toBeInTheDocument();
    expect(mockDeleteDrawingDocument).not.toHaveBeenCalled();
    expect(screen.getByTestId('resume-btn-session-042')).toBeInTheDocument();
  });

  it('deletes a submitted drawing without touching its score or feedback', async () => {
    mockListResumableSessions.mockResolvedValueOnce([
      savedDrawing({ status: 'completed' }),
    ]);
    mockListResumableSessions.mockResolvedValue([]);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('resume-item-session-042')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('resume-delete-session-042'));
    await user.click(screen.getByTestId('resume-delete-confirm-session-042'));

    // Only the drawing goes; a submitted session is left completed.
    await waitFor(() => expect(mockDeleteDrawingDocument).toHaveBeenCalledWith('session-042'));
    await waitFor(() => {
      expect(screen.queryByTestId('resume-sessions')).not.toBeInTheDocument();
    });
  });

  // What a drawing last scored is the thing worth knowing before deciding to
  // pick it up again, and the feedback behind it has to be reachable.
  it('shows what a drawing last scored and opens the feedback behind it', async () => {
    mockListResumableSessions.mockResolvedValue([
      savedDrawing({
        status: 'completed',
        lastResultSessionId: 'session-007',
        lastScore: 72,
        resultCount: 1,
      }),
    ]);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/session/:id/feedback"
            element={<div data-testid="feedback-page">Feedback Page</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('resume-score-session-042')).toHaveTextContent(
        'last score 72'
      );
    });

    await user.click(screen.getByTestId('resume-result-session-042'));
    await waitFor(() => {
      expect(screen.getByTestId('feedback-page')).toBeInTheDocument();
    });
  });

  // Carrying on moves the drawing to a new session, so the result belongs to
  // an earlier attempt — it still has to be reachable from the row.
  it('reaches the result of the attempt a continued drawing came from', async () => {
    mockListResumableSessions.mockResolvedValue([
      savedDrawing({
        id: 'session-100',
        status: 'in_progress',
        lastResultSessionId: 'session-042',
        lastScore: 81,
        resultCount: 2,
      }),
    ]);
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('resume-score-session-100')).toHaveTextContent(
        'last score 81'
      );
    });
    expect(screen.getByText(/over 2 attempts/)).toBeInTheDocument();
    expect(screen.getByTestId('resume-result-session-100')).toBeInTheDocument();
  });

  it('offers no result for a drawing that has never been submitted', async () => {
    mockListResumableSessions.mockResolvedValue([savedDrawing()]);
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('resume-item-session-042')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('resume-result-session-042')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resume-score-session-042')).not.toBeInTheDocument();
  });

  // Two different questions: how long the artist has had this drawing, and
  // whether they have touched it lately.
  it('shows when a drawing was started and when it was last updated', async () => {
    const started = new Date('2026-03-02T09:30:00Z');
    const updated = new Date(Date.now() - 5 * 60 * 1000);
    mockListResumableSessions.mockResolvedValue([
      savedDrawing({
        drawingStartedAt: started.toISOString(),
        lastSavedAt: updated.toISOString(),
      }),
    ]);
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('resume-item-session-042')).toBeInTheDocument();
    });

    // Older than a day, so a date rather than an interval.
    expect(screen.getByTestId('resume-started-session-042')).toHaveTextContent(
      `started ${started.toLocaleDateString()}`
    );
    expect(screen.getByTestId('resume-updated-session-042')).toHaveTextContent(
      'updated 5 min ago'
    );
    // The exact moment is a hover away, since an interval alone is vague.
    expect(screen.getByTestId('resume-started-session-042')).toHaveAttribute(
      'title',
      started.toLocaleString()
    );
  });

  it('reads naturally for a drawing started moments ago', async () => {
    const now = new Date();
    mockListResumableSessions.mockResolvedValue([
      savedDrawing({
        drawingStartedAt: now.toISOString(),
        lastSavedAt: now.toISOString(),
      }),
    ]);
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('resume-started-session-042')).toHaveTextContent(
        'started just now'
      );
    });
    expect(screen.getByTestId('resume-updated-session-042')).toHaveTextContent(
      'updated just now'
    );
  });
});
