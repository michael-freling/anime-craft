import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SideBySideComparison from '../../components/feedback/SideBySideComparison';

describe('SideBySideComparison', () => {
  const defaultProps = {
    referenceImageUrl: 'references/face.png',
    drawingImageUrl: 'drawings/drawing-001.png',
  };

  it('renders reference in main comparison and drawing when no line art', () => {
    render(<SideBySideComparison {...defaultProps} />);

    const referenceImg = screen.getByTestId('comparison-reference') as HTMLImageElement;
    const drawingImg = screen.getByTestId('comparison-drawing') as HTMLImageElement;

    expect(referenceImg).toBeInTheDocument();
    expect(drawingImg).toBeInTheDocument();
    expect(referenceImg.src).toContain('references/face.png');
    expect(drawingImg.src).toContain('drawings/drawing-001.png');
  });

  it('renders reference in details section', () => {
    render(<SideBySideComparison {...defaultProps} />);

    const detailRef = screen.getByTestId('comparison-reference-detail') as HTMLImageElement;
    expect(detailRef).toBeInTheDocument();
    expect(detailRef.src).toContain('references/face.png');
  });

  it('shows correct labels', () => {
    render(<SideBySideComparison {...defaultProps} />);

    // Main comparison falls back to "Reference" when no line art
    expect(screen.getByText('Reference')).toBeInTheDocument();
    expect(screen.getByText('Your Drawing')).toBeInTheDocument();
    // Details section always shows "Reference (Original)"
    expect(screen.getByText('Reference (Original)')).toBeInTheDocument();
  });

  it('shows section headings', () => {
    render(<SideBySideComparison {...defaultProps} />);

    expect(screen.getByText('Comparison')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('renders side-by-side container', () => {
    render(<SideBySideComparison {...defaultProps} />);

    expect(screen.getByTestId('side-by-side')).toBeInTheDocument();
  });

  it('shows line art in main comparison when provided', () => {
    render(
      <SideBySideComparison
        {...defaultProps}
        lineArtUrl="lineart/face-lineart.png"
      />
    );

    const lineArtImg = screen.getByTestId('comparison-lineart') as HTMLImageElement;
    expect(lineArtImg).toBeInTheDocument();
    expect(lineArtImg.src).toContain('lineart/face-lineart.png');
    expect(screen.getByText('Reference Line Art')).toBeInTheDocument();
    // Reference still visible in details
    expect(screen.getByTestId('comparison-reference-detail')).toBeInTheDocument();
  });
});
