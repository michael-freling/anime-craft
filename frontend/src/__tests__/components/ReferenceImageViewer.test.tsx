import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
