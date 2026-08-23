import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReferenceImagePicker from '../../components/session/ReferenceImagePicker';

const mockListReferences = vi.fn();
const mockAddReferenceByFilePath = vi.fn();
const mockGetReferenceImageData = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/referenceservice.js', () => ({
  ListReferences: (...args: any[]) => mockListReferences(...args),
  AddReferenceByFilePath: (...args: any[]) => mockAddReferenceByFilePath(...args),
  GetReferenceImageData: (...args: any[]) => mockGetReferenceImageData(...args),
}));

const FACE_DATA_URL = 'data:image/png;base64,ZmFjZQ==';
const BODY_DATA_URL = 'data:image/png;base64,Ym9keQ==';

describe('ReferenceImagePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReferenceImageData.mockImplementation((id: string) =>
      Promise.resolve(id === 'ref-001' ? FACE_DATA_URL : BODY_DATA_URL),
    );
    mockListReferences.mockResolvedValue([
      {
        id: 'ref-001',
        title: 'Simple Face',
        filePath: 'references/face.png',
        exerciseMode: 'line_work',
        difficulty: 'beginner',
      },
      {
        id: 'ref-002',
        title: 'Body Pose',
        filePath: 'references/body.png',
        exerciseMode: 'line_work',
        difficulty: 'intermediate',
      },
    ]);
  });

  it('loads and displays line_work reference images on mount', async () => {
    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Simple Face')).toBeInTheDocument();
    });
    expect(screen.getByText('Body Pose')).toBeInTheDocument();
    expect(mockListReferences).toHaveBeenCalledWith('line_work');
  });

  it('highlights selected reference', async () => {
    render(
      <ReferenceImagePicker selectedRef="ref-001" onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-ref-001')).toBeInTheDocument();
    });

    expect(screen.getByTestId('reference-card-ref-001')).toHaveClass('active');
    expect(screen.getByTestId('reference-card-ref-002')).not.toHaveClass('active');
  });

  it('calls onSelectRef when clicking a reference', async () => {
    const user = userEvent.setup();
    const onSelectRef = vi.fn();

    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={onSelectRef} />
    );

    await waitFor(() => {
      expect(screen.getByText('Simple Face')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('reference-card-ref-001'));
    expect(onSelectRef).toHaveBeenCalledWith('ref-001');
  });

  it('shows only the Add Image card when reference list is empty', async () => {
    mockListReferences.mockResolvedValue([]);

    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-add')).toBeInTheDocument();
    });
    // The grid should only contain the add card, no reference cards
    expect(screen.queryByText('IMG')).not.toBeInTheDocument();
    expect(screen.getByText('Add Image')).toBeInTheDocument();
  });

  it('shows error message when ListReferences rejects with an Error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockListReferences.mockRejectedValue(new Error('Database connection lost'));

    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('reference-picker-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Database connection lost')).toBeInTheDocument();
    expect(screen.queryByText('No reference images available')).not.toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('shows fallback error message for non-Error rejections', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockListReferences.mockRejectedValue('something went wrong');

    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('reference-picker-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed to load references')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('renders an Add Image card', async () => {
    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-add')).toBeInTheDocument();
    });
    expect(screen.getByText('Add Image')).toBeInTheDocument();
    expect(screen.getByText('+')).toBeInTheDocument();
  });

  it('shows each reference image as a preview thumbnail', async () => {
    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    const thumbnail = await screen.findByTestId('reference-thumbnail-ref-001');
    expect(thumbnail).toHaveAttribute('src', FACE_DATA_URL);
    expect(thumbnail).toHaveAttribute('alt', 'Simple Face');
    expect(screen.getByTestId('reference-thumbnail-ref-002')).toHaveAttribute(
      'src',
      BODY_DATA_URL,
    );
    expect(mockGetReferenceImageData).toHaveBeenCalledWith('ref-001');
    expect(mockGetReferenceImageData).toHaveBeenCalledWith('ref-002');
    expect(screen.queryByText('IMG')).not.toBeInTheDocument();
  });

  it('keeps the placeholder when an image fails to load', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetReferenceImageData.mockImplementation((id: string) =>
      id === 'ref-001'
        ? Promise.reject(new Error('read image file'))
        : Promise.resolve(BODY_DATA_URL),
    );

    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    // The healthy reference still renders its preview...
    await waitFor(() => {
      expect(screen.getByTestId('reference-thumbnail-ref-002')).toBeInTheDocument();
    });
    // ...while the broken one falls back to the placeholder.
    expect(screen.queryByTestId('reference-thumbnail-ref-001')).not.toBeInTheDocument();
    expect(screen.getByText('IMG')).toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  // Note: upload tests (AddReferenceByFilePath) rely on Wails native file dialog
  // which cannot be tested in jsdom. These are covered by e2e tests.
});
