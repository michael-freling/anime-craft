import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReferenceImagePicker from '../../components/session/ReferenceImagePicker';

const mockListReferences = vi.fn();
const mockAddReference = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/referenceservice.js', () => ({
  ListReferences: (...args: any[]) => mockListReferences(...args),
  AddReference: (...args: any[]) => mockAddReference(...args),
}));

describe('ReferenceImagePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('uploads a reference image when file is selected', async () => {
    const uploadedRef = {
      id: 'ref-uploaded',
      title: 'my-drawing',
      filePath: 'references/uploads/my-drawing.png',
      exerciseMode: 'line_work',
      difficulty: 'beginner',
    };

    mockAddReference.mockResolvedValue(uploadedRef);

    // After upload, the refreshed list includes the new image
    let callCount = 0;
    mockListReferences.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([
          {
            id: 'ref-001',
            title: 'Simple Face',
            filePath: 'references/face.png',
            exerciseMode: 'line_work',
            difficulty: 'beginner',
          },
        ]);
      }
      // After upload, return list with the new image included
      return Promise.resolve([
        {
          id: 'ref-001',
          title: 'Simple Face',
          filePath: 'references/face.png',
          exerciseMode: 'line_work',
          difficulty: 'beginner',
        },
        uploadedRef,
      ]);
    });

    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Simple Face')).toBeInTheDocument();
    });

    // Create a mock file
    const file = new File(['fake-image-data'], 'my-drawing.png', {
      type: 'image/png',
    });

    // Simulate file selection
    const fileInput = screen.getByTestId('reference-file-input') as HTMLInputElement;
    await userEvent.upload(fileInput, file);

    // Wait for AddReference to be called
    await waitFor(() => {
      expect(mockAddReference).toHaveBeenCalledWith(
        'my-drawing',
        'beginner',
        expect.any(String)
      );
    });

    // After upload, the list should be refreshed and show the new image
    await waitFor(() => {
      expect(screen.getByText('my-drawing')).toBeInTheDocument();
    });
  });

  it('shows error when upload fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAddReference.mockRejectedValue(new Error('Upload failed: file too large'));

    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-add')).toBeInTheDocument();
    });

    const file = new File(['fake-image-data'], 'big-image.png', {
      type: 'image/png',
    });

    const fileInput = screen.getByTestId('reference-file-input') as HTMLInputElement;
    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByTestId('reference-picker-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Upload failed: file too large')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
