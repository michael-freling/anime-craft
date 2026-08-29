import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SessionPage from '../../pages/SessionPage';

// Autosave debounces, so an assertion about it has to outwait the debounce.
const SAVE_TIMEOUT = 4000;

const mockGetSession = vi.fn();
const mockGetReference = vi.fn();
const mockSaveDrawing = vi.fn();
const mockEndSession = vi.fn();
const mockDiscardSession = vi.fn();
const mockLoadDrawingDocument = vi.fn();
const mockSaveDrawingOperations = vi.fn();
const mockExportDrawingFile = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/sessionservice.js', () => ({
  GetSession: (...args: any[]) => mockGetSession(...args),
  EndSession: (...args: any[]) => mockEndSession(...args),
  DiscardSession: (...args: any[]) => mockDiscardSession(...args),
}));

const mockGetReferenceImageData = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/referenceservice.js', () => ({
  GetReference: (...args: any[]) => mockGetReference(...args),
  GetReferenceImageData: (...args: any[]) => mockGetReferenceImageData(...args),
}));

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/drawingservice.js', () => ({
  SaveDrawing: (...args: any[]) => mockSaveDrawing(...args),
  LoadDrawingDocument: (...args: any[]) => mockLoadDrawingDocument(...args),
  SaveDrawingOperations: (...args: any[]) => mockSaveDrawingOperations(...args),
  ExportDrawingFile: (...args: any[]) => mockExportDrawingFile(...args),
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
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
    );
    mockLoadDrawingDocument.mockResolvedValue('');
    mockSaveDrawingOperations.mockResolvedValue({ revision: 1, operationCount: 1 });
    mockSaveDrawing.mockResolvedValue({ id: 'drawing-001' });
    mockEndSession.mockResolvedValue({ id: 'session-001' });
    mockDiscardSession.mockResolvedValue(undefined);
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

  it('shows the layer panel with a starting layer', () => {
    renderSessionPage();

    expect(screen.getByTestId('layer-panel')).toBeInTheDocument();
    expect(screen.getByTestId('layer-item-layer-1')).toHaveClass('active');
    expect(screen.getByTestId('layer-canvas-layer-1')).toBeInTheDocument();
  });

  it('adds a layer and draws on it', async () => {
    const user = userEvent.setup();
    renderSessionPage();

    await user.click(screen.getByTestId('layer-add'));

    expect(screen.getByTestId('layer-canvas-layer-2')).toBeInTheDocument();
    // The new layer becomes the one strokes land on.
    expect(screen.getByTestId('layer-item-layer-2')).toHaveClass('active');
    expect(screen.getByTestId('layer-item-layer-1')).not.toHaveClass('active');
  });

  it('switches tools with the keyboard', async () => {
    const user = userEvent.setup();
    renderSessionPage();

    await user.keyboard('e');
    expect(screen.getByTestId('tool-eraser')).toHaveClass('active');

    await user.keyboard('b');
    expect(screen.getByTestId('tool-brush')).toHaveClass('active');
  });

  it('no longer offers a Clear button', () => {
    renderSessionPage();

    expect(screen.queryByTestId('btn-clear')).not.toBeInTheDocument();
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

  it('restores the saved drawing before letting anything be saved over it', async () => {
    mockLoadDrawingDocument.mockResolvedValue(
      JSON.stringify({
        version: 1,
        document: { width: 1024, height: 768 },
        activeLayerId: 'layer-2',
        cursor: 1,
        tool: { tool: 'eraser', brushSize: 10, brushColor: '#f44336' },
        operations: [
          {
            type: 'add_stroke',
            stroke: {
              id: 's1',
              layerId: 'layer-1',
              tool: 'brush',
              color: '#000000',
              size: 2,
              points: [10, 10, 200, 200],
            },
          },
          {
            type: 'add_layer',
            layer: { id: 'layer-2', name: 'Layer 2', visible: true },
          },
        ],
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByTestId('layer-canvas-layer-2')).toBeInTheDocument();
    });
    expect(mockLoadDrawingDocument).toHaveBeenCalledWith('session-001');
    // The layer that was being worked on, the tool in hand and the undo
    // history all come back with the strokes.
    expect(screen.getByTestId('layer-item-layer-2')).toHaveClass('active');
    expect(screen.getByTestId('tool-eraser')).toHaveClass('active');
    expect(screen.getByTestId('btn-undo')).not.toBeDisabled();
    expect(screen.getByTestId('btn-redo')).toBeDisabled();

    // Restoring is not itself a change, so it saves nothing back.
    expect(mockSaveDrawingOperations).not.toHaveBeenCalled();
  });

  it('carries on from a saved drawing that was left mid-undo', async () => {
    mockLoadDrawingDocument.mockResolvedValue(
      JSON.stringify({
        version: 1,
        document: { width: 1024, height: 768 },
        activeLayerId: 'layer-1',
        cursor: -1,
        operations: [
          {
            type: 'add_layer',
            layer: { id: 'layer-2', name: 'Layer 2', visible: true },
          },
        ],
      })
    );

    renderSessionPage();

    await waitFor(() => {
      expect(screen.getByTestId('btn-redo')).not.toBeDisabled();
    });
    // The undone layer is not on screen, but it is still there to redo.
    expect(screen.queryByTestId('layer-item-layer-2')).not.toBeInTheDocument();
  });

  it('saves the drawing while the artist works', async () => {
    const user = userEvent.setup();
    renderSessionPage();

    await waitFor(() => expect(mockLoadDrawingDocument).toHaveBeenCalled());
    await user.click(screen.getByTestId('layer-add'));

    // Autosave waits for a pause in the drawing before it writes.
    await waitFor(() => expect(mockSaveDrawingOperations).toHaveBeenCalled(), {
      timeout: SAVE_TIMEOUT,
    });

    const [sessionId, requestJSON] = mockSaveDrawingOperations.mock.calls[0];
    expect(sessionId).toBe('session-001');
    const request = JSON.parse(requestJSON);
    expect(request.fromIndex).toBe(0);
    expect(request.cursor).toBe(0);
    expect(request.operations).toEqual([
      { type: 'add_layer', layer: { id: 'layer-2', name: 'Layer 2', visible: true } },
    ]);
    expect(request.document).toEqual({ width: 1024, height: 768 });

    await waitFor(() =>
      expect(screen.getByTestId('save-indicator')).toHaveTextContent(/Saved/)
    );
  });

  it('sends only what the store does not have yet', async () => {
    const user = userEvent.setup();
    renderSessionPage();

    await waitFor(() => expect(mockLoadDrawingDocument).toHaveBeenCalled());
    await user.click(screen.getByTestId('layer-add'));
    await waitFor(() => expect(mockSaveDrawingOperations).toHaveBeenCalledTimes(1), {
      timeout: SAVE_TIMEOUT,
    });

    await user.click(screen.getByTestId('layer-add'));
    await waitFor(() => expect(mockSaveDrawingOperations).toHaveBeenCalledTimes(2), {
      timeout: SAVE_TIMEOUT,
    });

    const request = JSON.parse(mockSaveDrawingOperations.mock.calls[1][1]);
    expect(request.fromIndex).toBe(1);
    expect(request.operations).toHaveLength(1);
    expect(request.operations[0].layer.id).toBe('layer-3');
  });

  it('says so when a save fails, and keeps the work to try again', async () => {
    mockSaveDrawingOperations.mockRejectedValue(new Error('disk full'));
    const user = userEvent.setup();
    renderSessionPage();

    await waitFor(() => expect(mockLoadDrawingDocument).toHaveBeenCalled());
    await user.click(screen.getByTestId('layer-add'));

    await waitFor(
      () => expect(screen.getByTestId('save-indicator')).toHaveTextContent(/Not saved/),
      { timeout: SAVE_TIMEOUT }
    );
    // The layer is still there — a failed save loses nothing.
    expect(screen.getByTestId('layer-item-layer-2')).toBeInTheDocument();
  });

  it('marks the session discarded so it stops offering itself for resuming', async () => {
    const user = userEvent.setup();
    renderSessionPage();

    await waitFor(() => expect(mockLoadDrawingDocument).toHaveBeenCalled());
    await user.click(screen.getByTestId('discard-btn'));

    await waitFor(() => {
      expect(mockDiscardSession).toHaveBeenCalledWith('session-001');
    });
    await waitFor(() => {
      expect(screen.getByText('Home Page')).toBeInTheDocument();
    });
  });

  it('offers to save a copy of the drawing to a file', async () => {
    renderSessionPage();

    expect(screen.getByTestId('export-btn')).toBeInTheDocument();
  });
});
