import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CategoryBreakdown from '../../components/feedback/CategoryBreakdown';

describe('CategoryBreakdown', () => {
  it('renders score bars for each category', () => {
    render(
      <CategoryBreakdown
        proportionsScore={80}
        lineQualityScore={70}
        colorAccuracyScore={90}
      />
    );

    expect(screen.getByText('Proportions')).toBeInTheDocument();
    expect(screen.getByText('Line Quality')).toBeInTheDocument();
    expect(screen.getByText('Color Accuracy')).toBeInTheDocument();
  });

  it('shows correct score values', () => {
    render(
      <CategoryBreakdown
        proportionsScore={80}
        lineQualityScore={70}
        colorAccuracyScore={90}
      />
    );

    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('70')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
  });

  it('handles null scores gracefully', () => {
    render(
      <CategoryBreakdown
        proportionsScore={80}
        lineQualityScore={null}
        colorAccuracyScore={null}
      />
    );

    expect(screen.getByText('Proportions')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.queryByText('Line Quality')).not.toBeInTheDocument();
    expect(screen.queryByText('Color Accuracy')).not.toBeInTheDocument();
  });

  it('handles undefined scores gracefully', () => {
    render(
      <CategoryBreakdown
        proportionsScore={undefined}
        lineQualityScore={undefined}
        colorAccuracyScore={undefined}
      />
    );

    expect(screen.queryByText('Proportions')).not.toBeInTheDocument();
    expect(screen.queryByText('Line Quality')).not.toBeInTheDocument();
    expect(screen.queryByText('Color Accuracy')).not.toBeInTheDocument();
  });

  it('renders the section title', () => {
    render(
      <CategoryBreakdown
        proportionsScore={80}
        lineQualityScore={70}
        colorAccuracyScore={null}
      />
    );

    expect(screen.getByText('Category Scores')).toBeInTheDocument();
  });

  it('applies correct bar fill width based on score', () => {
    const { container } = render(
      <CategoryBreakdown
        proportionsScore={75}
        lineQualityScore={null}
        colorAccuracyScore={null}
      />
    );

    const barFill = container.querySelector('.category-bar-fill');
    expect(barFill).toHaveStyle({ width: '75%' });
  });
});
