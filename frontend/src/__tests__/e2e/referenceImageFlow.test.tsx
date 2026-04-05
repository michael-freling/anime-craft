import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import HomePage from '../../pages/HomePage';
import SessionPage from '../../pages/SessionPage';

// --- Mock all service bindings ---

const mockStartSession = vi.fn();
const mockGetSession = vi.fn();
const mockEndSession = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/sessionservice.js', () => ({
  StartSession: (...args: any[]) => mockStartSession(...args),
  GetSession: (...args: any[]) => mockGetSession(...args),
  EndSession: (...args: any[]) => mockEndSession(...args),
}));

const mockListReferences = vi.fn();
const mockGetReference = vi.fn();
const mockGetReferenceImageData = vi.fn();
const mockAddReferenceByFilePath = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js', () => ({
  ListReferences: (...args: any[]) => mockListReferences(...args),
  GetReference: (...args: any[]) => mockGetReference(...args),
  GetReferenceImageData: (...args: any[]) => mockGetReferenceImageData(...args),
  AddReferenceByFilePath: (...args: any[]) => mockAddReferenceByFilePath(...args),
}));

const mockSaveDrawing = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/drawingservice.js', () => ({
  SaveDrawing: (...args: any[]) => mockSaveDrawing(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/feedbackservice.js', () => ({
  GetFeedback: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/progressservice.js', () => ({
  GetProgress: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/settingsservice.js', () => ({
  GetSettings: vi.fn().mockResolvedValue({}),
  SaveSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock('@wailsio/runtime', () => ({
  Dialogs: {
    OpenFile: vi.fn().mockResolvedValue(''),
  },
}));

// --- Test data ---

const REFERENCES = [
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
];

const FAKE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

describe('Reference image flow: HomePage -> SessionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockListReferences.mockResolvedValue(REFERENCES);

    mockStartSession.mockResolvedValue({
      id: 'session-001',
      referenceImageId: 'ref-001',
      exerciseMode: 'line_work',
    });

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

    mockGetReferenceImageData.mockResolvedValue(FAKE_DATA_URL);
  });

  it('full flow: select reference, start session, verify reference image is displayed', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/session/:id" element={<SessionPage />} />
          <Route path="/session/:id/feedback" element={<div data-testid="feedback-page">Feedback</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Step 1: HomePage renders with mocked references
    await waitFor(() => {
      expect(screen.getByText('Simple Face')).toBeInTheDocument();
    });
    expect(screen.getByText('Body Pose')).toBeInTheDocument();

    // Step 2: User selects a reference
    await user.click(screen.getByTestId('reference-card-ref-001'));

    // Step 3: User clicks "Start Session"
    const startBtn = screen.getByTestId('start-session-btn');
    expect(startBtn).not.toBeDisabled();
    await user.click(startBtn);

    // Step 4: Verify StartSession was called with correct reference ID
    expect(mockStartSession).toHaveBeenCalledWith('line_work', 'ref-001');

    // Step 5: After navigation, SessionPage renders
    await waitFor(() => {
      expect(screen.getByTestId('session-page')).toBeInTheDocument();
    });

    // Step 6: Verify GetSession is called
    await waitFor(() => {
      expect(mockGetSession).toHaveBeenCalledWith('session-001');
    });

    // Step 7: Verify GetReference is called with the referenceImageId from the session
    await waitFor(() => {
      expect(mockGetReference).toHaveBeenCalledWith('ref-001');
    });

    // Step 8: Verify GetReferenceImageData is called
    await waitFor(() => {
      expect(mockGetReferenceImageData).toHaveBeenCalledWith('ref-001');
    });

    // Step 9: Verify the reference image <img> tag appears with the correct data URL
    await waitFor(() => {
      expect(screen.getByTestId('reference-image')).toBeInTheDocument();
    });

    const img = screen.getByTestId('reference-image') as HTMLImageElement;
    expect(img.src).toBe(FAKE_DATA_URL);
    expect(img.alt).toBe('Simple Face');
  });
});
