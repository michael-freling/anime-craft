import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import HomePage from '../../pages/HomePage';

const mockStartSession = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/sessionservice.js', () => ({
  StartSession: (...args: any[]) => mockStartSession(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js', () => ({
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
}));

vi.mock('@wailsio/runtime', () => ({
  Dialogs: {
    OpenFile: vi.fn().mockResolvedValue(''),
  },
}));

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartSession.mockResolvedValue({ id: 'session-001' });
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
});
