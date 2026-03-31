import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReferenceImageViewer from '../../components/session/ReferenceImageViewer';

const mockGetReference = vi.fn();
const mockGetReferenceImageData = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js', () => ({
  GetReference: (...args: any[]) => mockGetReference(...args),
  GetReferenceImageData: (...args: any[]) => mockGetReferenceImageData(...args),
}));

const FAKE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

describe('ReferenceImageViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReference.mockResolvedValue({
      id: 'ref-001',
      title: 'Simple Face',
      filePath: 'references/face.png',
    });
    mockGetReferenceImageData.mockResolvedValue(FAKE_DATA_URL);
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
    expect(img.src).toBe(FAKE_DATA_URL);
    expect(img.alt).toBe('Simple Face');
    expect(img.className).toContain('session-reference-img');
  });

  it('shows error state on failure', async () => {
    mockGetReference.mockRejectedValue(new Error('Network error'));
    render(<ReferenceImageViewer referenceId="ref-001" />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows error state when image data fails to load', async () => {
    mockGetReferenceImageData.mockRejectedValue(new Error('File not found'));
    render(<ReferenceImageViewer referenceId="ref-001" />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-error')).toBeInTheDocument();
    });
    expect(screen.getByText('File not found')).toBeInTheDocument();
  });

  it('shows fallback error message for non-Error exceptions', async () => {
    mockGetReference.mockRejectedValue('unknown');
    render(<ReferenceImageViewer referenceId="ref-001" />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed to load reference')).toBeInTheDocument();
  });

  it('re-fetches and displays new image when referenceId prop changes', async () => {
    const { rerender } = render(<ReferenceImageViewer referenceId="ref-001" />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-image')).toBeInTheDocument();
    });

    const img = screen.getByTestId('reference-image') as HTMLImageElement;
    expect(img.alt).toBe('Simple Face');

    // Set up mocks for second reference
    mockGetReference.mockResolvedValue({
      id: 'ref-002',
      title: 'Body Pose',
      filePath: 'references/body.png',
    });
    const secondDataUrl = 'data:image/png;base64,SECOND_IMAGE_DATA';
    mockGetReferenceImageData.mockResolvedValue(secondDataUrl);

    // Change the prop
    rerender(<ReferenceImageViewer referenceId="ref-002" />);

    await waitFor(() => {
      const updatedImg = screen.getByTestId('reference-image') as HTMLImageElement;
      expect(updatedImg.alt).toBe('Body Pose');
      expect(updatedImg.src).toBe(secondDataUrl);
    });

    expect(mockGetReference).toHaveBeenCalledWith('ref-002');
    expect(mockGetReferenceImageData).toHaveBeenCalledWith('ref-002');
  });

  it('shows error when GetReference succeeds but GetReferenceImageData fails', async () => {
    mockGetReference.mockResolvedValue({
      id: 'ref-001',
      title: 'Simple Face',
      filePath: 'references/face.png',
    });
    mockGetReferenceImageData.mockRejectedValue(new Error('Image data corrupted'));

    render(<ReferenceImageViewer referenceId="ref-001" />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Image data corrupted')).toBeInTheDocument();
  });

  it('shows error when GetReference fails but GetReferenceImageData would succeed', async () => {
    mockGetReference.mockRejectedValue(new Error('Reference not found'));
    mockGetReferenceImageData.mockResolvedValue(FAKE_DATA_URL);

    render(<ReferenceImageViewer referenceId="ref-001" />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Reference not found')).toBeInTheDocument();
  });

  it('does not update state after unmount during loading', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let resolveRef!: (value: any) => void;
    let resolveImg!: (value: any) => void;
    mockGetReference.mockReturnValue(new Promise((r) => { resolveRef = r; }));
    mockGetReferenceImageData.mockReturnValue(new Promise((r) => { resolveImg = r; }));

    const { unmount } = render(<ReferenceImageViewer referenceId="ref-001" />);

    expect(screen.getByTestId('reference-loading')).toBeInTheDocument();

    // Unmount while still loading
    unmount();

    // Resolve promises after unmount
    resolveRef({ id: 'ref-001', title: 'Simple Face', filePath: 'references/face.png' });
    resolveImg(FAKE_DATA_URL);

    // Wait a tick to let any potential state updates process
    await new Promise((r) => setTimeout(r, 0));

    // No "state update on unmounted component" errors should appear
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('img element has session-reference-img CSS class', async () => {
    render(<ReferenceImageViewer referenceId="ref-001" />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-image')).toBeInTheDocument();
    });

    const img = screen.getByTestId('reference-image');
    expect(img).toHaveClass('session-reference-img');
  });

  it('does not set error state when unmounted before catch executes', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let rejectRef!: (reason: any) => void;
    mockGetReference.mockReturnValue(new Promise((_, reject) => { rejectRef = reject; }));
    mockGetReferenceImageData.mockReturnValue(new Promise(() => {}));

    const { unmount } = render(<ReferenceImageViewer referenceId="ref-001" />);

    expect(screen.getByTestId('reference-loading')).toBeInTheDocument();

    // Unmount before the rejection
    unmount();

    // Reject after unmount — the cancelled guard in catch should prevent setError
    rejectRef(new Error('Late error'));

    await new Promise((r) => setTimeout(r, 50));

    // No errors should appear since the component is unmounted and cancelled = true
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
