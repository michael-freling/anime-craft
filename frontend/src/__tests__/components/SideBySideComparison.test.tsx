import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SideBySideComparison from '../../components/feedback/SideBySideComparison';

describe('SideBySideComparison', () => {
  const defaultProps = {
    referenceImageUrl: 'references/face.png',
    drawingImageUrl: 'drawings/drawing-001.png',
  };

  it('renders both reference and drawing images', () => {
    render(<SideBySideComparison {...defaultProps} />);

    const referenceImg = screen.getByTestId('comparison-reference') as HTMLImageElement;
    const drawingImg = screen.getByTestId('comparison-drawing') as HTMLImageElement;

    expect(referenceImg).toBeInTheDocument();
    expect(drawingImg).toBeInTheDocument();
    expect(referenceImg.src).toContain('references/face.png');
    expect(drawingImg.src).toContain('drawings/drawing-001.png');
  });

  it('shows correct labels', () => {
    render(<SideBySideComparison {...defaultProps} />);

    expect(screen.getByText('Reference')).toBeInTheDocument();
    expect(screen.getByText('Your Drawing')).toBeInTheDocument();
  });

  it('renders with correct alt text', () => {
    render(<SideBySideComparison {...defaultProps} />);

    expect(screen.getByAltText('Reference')).toBeInTheDocument();
    expect(screen.getByAltText('Your drawing')).toBeInTheDocument();
  });

  it('renders side-by-side container', () => {
    render(<SideBySideComparison {...defaultProps} />);

    expect(screen.getByTestId('side-by-side')).toBeInTheDocument();
  });
});
