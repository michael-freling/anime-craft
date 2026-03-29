import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReferenceImagePicker from '../../components/session/ReferenceImagePicker';

const mockListReferences = vi.fn();

vi.mock('../../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js', () => ({
  ListReferences: (...args: any[]) => mockListReferences(...args),
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

  it('shows hint when no mode selected', () => {
    render(
      <ReferenceImagePicker mode={null} selectedRef={null} onSelectRef={vi.fn()} />
    );

    expect(screen.getByText('Select an exercise mode first')).toBeInTheDocument();
  });

  it('loads and displays reference images when mode is selected', async () => {
    render(
      <ReferenceImagePicker mode="line_work" selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('Simple Face')).toBeInTheDocument();
    });
    expect(screen.getByText('Body Pose')).toBeInTheDocument();
    expect(mockListReferences).toHaveBeenCalledWith('line_work');
  });

  it('highlights selected reference', async () => {
    render(
      <ReferenceImagePicker mode="line_work" selectedRef="ref-001" onSelectRef={vi.fn()} />
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
      <ReferenceImagePicker mode="line_work" selectedRef={null} onSelectRef={onSelectRef} />
    );

    await waitFor(() => {
      expect(screen.getByText('Simple Face')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('reference-card-ref-001'));
    expect(onSelectRef).toHaveBeenCalledWith('ref-001');
  });

  it('shows "No reference images available" when list is empty', async () => {
    mockListReferences.mockResolvedValue([]);

    render(
      <ReferenceImagePicker mode="line_work" selectedRef={null} onSelectRef={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('No reference images available')).toBeInTheDocument();
    });
  });
});
