import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import ReferenceImageViewer from '../../components/session/ReferenceImageViewer';

const mockGetReference = vi.fn();
const mockGetReferenceImageData = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/referenceservice.js', () => ({
  GetReference: (...args: any[]) => mockGetReference(...args),
  GetReferenceImageData: (...args: any[]) => mockGetReferenceImageData(...args),
}));

describe('ReferenceImageViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReference.mockResolvedValue({
      id: 'ref-001',
      title: 'Simple Face',
      filePath: 'references/face.png',
    });
    mockGetReferenceImageData.mockResolvedValue(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
    );
  });

  it('shows loading state initially', () => {
    mockGetReference.mockReturnValue(new Promise(() => {})); // never resolves
    mockGetReferenceImageData.mockReturnValue(new Promise(() => {}));
    render(<ReferenceImageViewer referenceId="ref-001" />);

    expect(screen.getByTestId('reference-loading')).toBeInTheDocument();
    expect(screen.getByText('Loading reference...')).toBeInTheDocument();
  });

  it('displays reference image after loading', async () => {
    render(<ReferenceImageViewer referenceId="ref-001" />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-image')).toBeInTheDocument();
    });

    const img = screen.getByTestId('reference-image') as HTMLImageElement;
    expect(img.alt).toBe('Simple Face');
    expect(img.src).toContain('data:image/png;base64,');
  });

  it('shows error state on failure', async () => {
    mockGetReference.mockRejectedValue(new Error('Network error'));
    render(<ReferenceImageViewer referenceId="ref-001" />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows fallback error message for non-Error exceptions', async () => {
    mockGetReference.mockRejectedValue('unknown');
    render(<ReferenceImageViewer referenceId="ref-001" />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed to load reference')).toBeInTheDocument();
  });
});

// Zooming and panning are arithmetic against the size of the frame, and jsdom
// lays nothing out, so the frame has to be given a size for any of it to mean
// anything.
const FRAME = { width: 400, height: 300 };

function giveTheFrameASize() {
  return vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: FRAME.width,
      bottom: FRAME.height,
      width: FRAME.width,
      height: FRAME.height,
      toJSON: () => ({}),
    } as DOMRect);
}

async function renderLoaded() {
  render(<ReferenceImageViewer referenceId="ref-001" />);
  await waitFor(() => {
    expect(screen.getByTestId('reference-image')).toBeInTheDocument();
  });
  return {
    frame: screen.getByTestId('reference-viewer'),
    image: screen.getByTestId('reference-image'),
  };
}

// A reference is looked at closely, so seeing it whole is where it starts, not
// where it ends.
describe('ReferenceImageViewer zooming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReference.mockResolvedValue({
      id: 'ref-001',
      title: 'Simple Face',
      filePath: 'references/face.png',
    });
    mockGetReferenceImageData.mockResolvedValue(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
    );
    giveTheFrameASize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts showing the whole reference, with nothing to pan', async () => {
    const { image } = await renderLoaded();

    expect(screen.getByTestId('reference-zoom-level')).toHaveTextContent('100%');
    expect(image).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });
    // Nowhere to go and no way back: both are already true.
    expect(screen.getByTestId('reference-zoom-out')).toBeDisabled();
    expect(screen.getByTestId('reference-zoom-fit')).toBeDisabled();
  });

  it('zooms in from the middle when asked', async () => {
    const user = userEvent.setup();
    const { image } = await renderLoaded();

    await user.click(screen.getByTestId('reference-zoom-in'));

    expect(screen.getByTestId('reference-zoom-level')).toHaveTextContent('140%');
    // The centre of the frame stays the centre of what is shown.
    expect(image).toHaveStyle({ transform: 'translate(-80px, -60px) scale(1.4)' });
  });

  it('zooms the wheel towards the pointer, not the middle', async () => {
    const { image } = await renderLoaded();

    fireEvent.wheel(screen.getByTestId('reference-viewer'), {
      deltaY: -200,
      clientX: 0,
      clientY: 0,
    });

    // Zoomed about the top-left corner, so the corner does not move.
    expect(screen.getByTestId('reference-zoom-level')).not.toHaveTextContent(
      '100%'
    );
    expect(image.style.transform).toMatch(/^translate\(0px, 0px\) scale\(1\.49/);
  });

  it('moves the picture when it is bigger than the frame', async () => {
    const user = userEvent.setup();
    const { frame, image } = await renderLoaded();

    await user.click(screen.getByTestId('reference-zoom-in'));
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 130, clientY: 120 });
    fireEvent.pointerUp(frame, { pointerId: 1 });

    expect(image).toHaveStyle({ transform: 'translate(-50px, -40px) scale(1.4)' });
  });

  it('will not let the picture be dragged off the edge', async () => {
    const user = userEvent.setup();
    const { frame, image } = await renderLoaded();

    await user.click(screen.getByTestId('reference-zoom-in'));
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 5000, clientY: 5000 });
    fireEvent.pointerUp(frame, { pointerId: 1 });

    // Stopped at the picture's own left and top edges rather than sailing past.
    expect(image).toHaveStyle({ transform: 'translate(0px, 0px) scale(1.4)' });
  });

  it('stays put while it fits, so a stray drag cannot lose it', async () => {
    const { frame, image } = await renderLoaded();

    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 300, clientY: 250 });
    fireEvent.pointerUp(frame, { pointerId: 1 });

    expect(image).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });
  });

  it('gives the whole reference back on a double click', async () => {
    const user = userEvent.setup();
    const { frame, image } = await renderLoaded();

    await user.click(screen.getByTestId('reference-zoom-in'));
    fireEvent.doubleClick(frame);

    expect(image).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });
    expect(screen.getByTestId('reference-zoom-level')).toHaveTextContent('100%');
  });

  it('answers the keyboard too', async () => {
    const { frame, image } = await renderLoaded();

    fireEvent.keyDown(frame, { key: '+' });
    expect(screen.getByTestId('reference-zoom-level')).toHaveTextContent('140%');

    fireEvent.keyDown(frame, { key: 'ArrowRight' });
    expect(image).toHaveStyle({
      transform: 'translate(-128px, -60px) scale(1.4)',
    });

    fireEvent.keyDown(frame, { key: '0' });
    expect(image).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' });
  });

  // A reference rarely has the frame's proportions, so it is letterboxed. The
  // empty band beside it is not somewhere the picture should be draggable into.
  it('will not let the picture be dragged into the empty band beside it', async () => {
    const user = userEvent.setup();
    const { frame, image } = await renderLoaded();

    // Twice as wide as the frame's proportions, so it letterboxes top and bottom.
    Object.defineProperty(image, 'naturalWidth', { value: 800, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 300, configurable: true });
    fireEvent.load(image);

    await user.click(screen.getByTestId('reference-zoom-in'));
    // Still shorter than the frame once zoomed, so there is no room to move
    // down into — only the letterbox, and it stays out of it.
    expect(image).toHaveStyle({ transform: 'translate(-80px, -60px) scale(1.4)' });

    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(frame, { pointerId: 1 });

    // Sideways it reached its own left edge; downwards it never moved at all.
    expect(image).toHaveStyle({ transform: 'translate(0px, -60px) scale(1.4)' });
  });

  it('starts a different reference whole again', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ReferenceImageViewer referenceId="ref-001" />);
    await waitFor(() => {
      expect(screen.getByTestId('reference-image')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('reference-zoom-in'));

    mockGetReference.mockResolvedValue({
      id: 'ref-002',
      title: 'Another Face',
      filePath: 'references/other.png',
    });
    rerender(<ReferenceImageViewer referenceId="ref-002" />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-image')).toHaveAttribute(
        'alt',
        'Another Face'
      );
    });
    expect(screen.getByTestId('reference-zoom-level')).toHaveTextContent('100%');
  });
});
