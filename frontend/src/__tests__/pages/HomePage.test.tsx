import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HomePage from '../../pages/HomePage';

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/sessionservice.js', () => ({
  StartSession: vi.fn().mockResolvedValue({ id: 'session-001' }),
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
}));

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the app title', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByText('Anime Craft')).toBeInTheDocument();
  });

  it('renders mode selector buttons', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByText('Line Work')).toBeInTheDocument();
    expect(screen.getByText('Coloring')).toBeInTheDocument();
    expect(screen.getByText('Full Drawing')).toBeInTheDocument();
  });

  it('Start Session button is disabled when no mode/reference selected', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    const startBtn = screen.getByText('Start Session');
    expect(startBtn).toBeDisabled();
  });

  it('clicking a mode button selects it and loads references', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await user.click(screen.getByText('Line Work'));

    await waitFor(() => {
      expect(screen.getByText('Simple Face')).toBeInTheDocument();
    });
  });

  it('Start Session button is enabled after selecting mode and reference', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await user.click(screen.getByText('Line Work'));

    await waitFor(() => {
      expect(screen.getByText('Simple Face')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Simple Face'));

    const startBtn = screen.getByText('Start Session');
    expect(startBtn).not.toBeDisabled();
  });
});
