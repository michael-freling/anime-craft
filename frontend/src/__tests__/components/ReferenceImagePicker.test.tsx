import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReferenceImagePicker from '../../components/session/ReferenceImagePicker';

const mockListReferences = vi.fn();
const mockAddReferenceByFilePath = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js', () => ({
  ListReferences: (...args: any[]) => mockListReferences(...args),
  AddReferenceByFilePath: (...args: any[]) => mockAddReferenceByFilePath(...args),
}));

const mockOpenFile = vi.fn();

vi.mock('@wailsio/runtime', () => ({
  Dialogs: {
    OpenFile: (...args: any[]) => mockOpenFile(...args),
  },
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

  it('uploads a reference image when file is selected via dialog', async () => {
    const user = userEvent.setup();
    const uploadedRef = {
      id: 'ref-uploaded',
      title: 'my-drawing',
      filePath: 'references/uploads/my-drawing.png',
      exerciseMode: 'line_work',
      difficulty: 'beginner',
    };

    // Mock the native file dialog returning a file path
    mockOpenFile.mockResolvedValue('/home/user/Pictures/my-drawing.png');
    mockAddReferenceByFilePath.mockResolvedValue(uploadedRef);

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

    // Click the Add Image button (now triggers native dialog)
    await user.click(screen.getByTestId('reference-card-add'));

    // Verify the Go method was called with the file path (not base64)
    await waitFor(() => {
      expect(mockAddReferenceByFilePath).toHaveBeenCalledWith(
        'my-drawing',
        'beginner',
        '/home/user/Pictures/my-drawing.png'
      );
    });

    // After upload, the list should be refreshed and show the new image
    await waitFor(() => {
      expect(screen.getByText('my-drawing')).toBeInTheDocument();
    });
  });

  it('does nothing when user cancels the file dialog', async () => {
    const user = userEvent.setup();
    // User cancelled: OpenFile returns empty string
    mockOpenFile.mockResolvedValue('');

    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-add')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('reference-card-add'));

    // Should not call backend
    expect(mockAddReferenceByFilePath).not.toHaveBeenCalled();
  });

  it('full upload flow works when clicking the Add Image div', async () => {
    const user = userEvent.setup();
    const uploadedRef = {
      id: 'ref-new',
      title: 'clicked-upload',
      filePath: 'references/uploads/clicked-upload.png',
      exerciseMode: 'line_work',
      difficulty: 'beginner',
    };

    mockOpenFile.mockResolvedValue('/home/user/Documents/clicked-upload.png');
    mockAddReferenceByFilePath.mockResolvedValue(uploadedRef);

    let callCount = 0;
    mockListReferences.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve([]);
      }
      return Promise.resolve([uploadedRef]);
    });

    render(<ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-add')).toBeInTheDocument();
    });

    // Click the Add Image div to trigger the native file dialog
    await user.click(screen.getByTestId('reference-card-add'));

    await waitFor(() => {
      expect(mockAddReferenceByFilePath).toHaveBeenCalledWith(
        'clicked-upload',
        'beginner',
        '/home/user/Documents/clicked-upload.png'
      );
    });

    await waitFor(() => {
      expect(screen.getByText('clicked-upload')).toBeInTheDocument();
    });
  });

  it('extracts title correctly from file paths with directories', async () => {
    const user = userEvent.setup();

    mockOpenFile.mockResolvedValue('/home/user/Pictures/sub folder/test-image.jpg');
    mockAddReferenceByFilePath.mockResolvedValue({
      id: 'ref-path',
      title: 'test-image',
      filePath: 'references/test-image.jpg',
      exerciseMode: 'line_work',
      difficulty: 'beginner',
    });

    let callCount = 0;
    mockListReferences.mockImplementation(() => {
      callCount++;
      return Promise.resolve([]);
    });

    render(<ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-add')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('reference-card-add'));

    await waitFor(() => {
      expect(mockAddReferenceByFilePath).toHaveBeenCalledWith(
        'test-image',
        'beginner',
        '/home/user/Pictures/sub folder/test-image.jpg'
      );
    });
  });

  it('uploads a JPEG image successfully via dialog', async () => {
    const user = userEvent.setup();
    const uploadedRef = {
      id: 'ref-jpeg',
      title: 'photo',
      filePath: 'references/uploads/photo.jpg',
      exerciseMode: 'line_work',
      difficulty: 'beginner',
    };

    mockOpenFile.mockResolvedValue('/home/user/Photos/photo.jpg');
    mockAddReferenceByFilePath.mockResolvedValue(uploadedRef);

    let callCount = 0;
    mockListReferences.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve([]);
      }
      return Promise.resolve([uploadedRef]);
    });

    render(<ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-add')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('reference-card-add'));

    await waitFor(() => {
      expect(mockAddReferenceByFilePath).toHaveBeenCalledWith(
        'photo',
        'beginner',
        '/home/user/Photos/photo.jpg'
      );
    });

    // Verify the uploaded JPEG image appears in the list
    await waitFor(() => {
      expect(screen.getByText('photo')).toBeInTheDocument();
    });
  });

  it('shows error when upload fails', async () => {
    const user = userEvent.setup();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockOpenFile.mockResolvedValue('/home/user/Pictures/big-image.png');
    mockAddReferenceByFilePath.mockRejectedValue(new Error('Upload failed: file too large'));

    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-add')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('reference-card-add'));

    await waitFor(() => {
      expect(screen.getByTestId('reference-picker-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Upload failed: file too large')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('passes file dialog options with image filters', async () => {
    const user = userEvent.setup();
    mockOpenFile.mockResolvedValue('');

    render(<ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-add')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('reference-card-add'));

    expect(mockOpenFile).toHaveBeenCalledWith({
      Title: 'Select Reference Image',
      Filters: [
        {
          DisplayName: 'Images',
          Pattern: '*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.webp',
        },
      ],
    });
  });

  it('handles null result from ListReferences (treats as empty list)', async () => {
    mockListReferences.mockResolvedValue(null);

    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-add')).toBeInTheDocument();
    });

    // No reference cards should be rendered, only the add card
    expect(screen.queryByText('IMG')).not.toBeInTheDocument();
  });

  it('does not update state when component unmounts before useEffect ListReferences resolves', async () => {
    let resolveList!: (value: any) => void;
    mockListReferences.mockReturnValue(new Promise((resolve) => { resolveList = resolve; }));

    const { unmount } = render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    // Unmount before the promise resolves
    unmount();

    // Resolve after unmount — cancelled flag should prevent setImages
    resolveList([{ id: 'ref-001', title: 'Test', difficulty: 'beginner' }]);
    await new Promise((r) => setTimeout(r, 50));
    // No errors — cancelled guard prevents state updates
  });

  it('does not update error state when component unmounts before useEffect ListReferences rejects', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let rejectList!: (reason: any) => void;
    mockListReferences.mockReturnValue(new Promise((_, reject) => { rejectList = reject; }));

    const { unmount } = render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    // Unmount before the promise rejects
    unmount();

    // Reject after unmount — cancelled flag should prevent setError
    rejectList(new Error('Late error'));
    await new Promise((r) => setTimeout(r, 50));
    // No errors — cancelled guard prevents state updates
    consoleSpy.mockRestore();
  });

  it('uses "untitled" when file path has no filename', async () => {
    const user = userEvent.setup();

    // A path that ends with a separator so pop() returns empty string
    mockOpenFile.mockResolvedValue('/home/user/');
    mockAddReferenceByFilePath.mockResolvedValue({
      id: 'ref-untitled',
      title: 'untitled',
      filePath: 'references/untitled.png',
      exerciseMode: 'line_work',
      difficulty: 'beginner',
    });
    mockListReferences.mockResolvedValue([]);

    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-add')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('reference-card-add'));

    await waitFor(() => {
      expect(mockAddReferenceByFilePath).toHaveBeenCalledWith(
        'untitled',
        'beginner',
        '/home/user/'
      );
    });
  });

  it('shows error in loadReferences callback when upload triggers reload that fails with non-Error', async () => {
    const user = userEvent.setup();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Initial load (from useEffect) succeeds, reload (from loadReferences) fails
    let callCount = 0;
    mockListReferences.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve([]);
      }
      // The reload after upload fails with a non-Error
      return Promise.reject('string error from reload');
    });

    mockOpenFile.mockResolvedValue('/home/user/Pictures/image.png');
    mockAddReferenceByFilePath.mockResolvedValue({
      id: 'ref-new',
      title: 'image',
      filePath: 'references/image.png',
      exerciseMode: 'line_work',
      difficulty: 'beginner',
    });

    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-add')).toBeInTheDocument();
    });

    // Trigger upload which calls loadReferences after success
    await user.click(screen.getByTestId('reference-card-add'));

    await waitFor(() => {
      expect(screen.getByTestId('reference-picker-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed to load references')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('shows error in loadReferences callback when upload triggers reload that fails with Error', async () => {
    const user = userEvent.setup();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Initial load (from useEffect) succeeds, reload (from loadReferences) fails
    let callCount = 0;
    mockListReferences.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve([]);
      }
      // The reload after upload fails with an Error
      return Promise.reject(new Error('DB error on reload'));
    });

    mockOpenFile.mockResolvedValue('/home/user/Pictures/image.png');
    mockAddReferenceByFilePath.mockResolvedValue({
      id: 'ref-new',
      title: 'image',
      filePath: 'references/image.png',
      exerciseMode: 'line_work',
      difficulty: 'beginner',
    });

    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-add')).toBeInTheDocument();
    });

    // Trigger upload which calls loadReferences after success
    await user.click(screen.getByTestId('reference-card-add'));

    await waitFor(() => {
      expect(screen.getByTestId('reference-picker-error')).toBeInTheDocument();
    });
    expect(screen.getByText('DB error on reload')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('shows fallback error message when upload fails with non-Error', async () => {
    const user = userEvent.setup();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockOpenFile.mockResolvedValue('/home/user/Pictures/image.png');
    mockAddReferenceByFilePath.mockRejectedValue('not an error object');

    render(
      <ReferenceImagePicker selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('reference-card-add')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('reference-card-add'));

    await waitFor(() => {
      expect(screen.getByTestId('reference-picker-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed to upload image')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('reproduces bug: base64 data for real images is too large for Wails URL parameters', () => {
    // Wails sends call args as URL query parameters (runtime.js line 45):
    //   url.searchParams.append("args", JSON.stringify(args))
    // For real images, the base64 data creates URLs exceeding HTTP limits.

    // Create a realistic image file (~100KB)
    const imageSize = 100 * 1024; // 100KB
    const imageData = new Uint8Array(imageSize);
    for (let i = 0; i < imageSize; i++) {
      imageData[i] = i % 256;
    }

    // Convert to base64 like the old component did
    let binary = '';
    for (let i = 0; i < imageData.length; i++) {
      binary += String.fromCharCode(imageData[i]);
    }
    const base64Data = btoa(binary);

    // Simulate what Wails runtime does: put ALL args in URL query params
    const callArgs = JSON.stringify({
      'call-id': 'test',
      methodID: 980217922,
      args: ['large-image', 'beginner', base64Data],
    });
    const params = new URLSearchParams();
    params.set('object', '0');
    params.set('method', '0');
    params.set('args', callArgs);
    const urlLength = `http://localhost:0/wails/runtime?${params.toString()}`.length;

    // This URL far exceeds typical HTTP URL limits (8KB) and even Go's 1MB header limit
    expect(urlLength).toBeGreaterThan(8 * 1024);
    // This demonstrates why Wails returns "missing object value" - the URL is too long
    // for the HTTP transport and the request gets rejected.
    //
    // The fix: use Wails Dialog.OpenFile() to get the file path, then pass
    // only the path string (a few bytes) to AddReferenceByFilePath on the Go side.
  });
});
