import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ScoreDisplay from '../../components/feedback/ScoreDisplay';

describe('ScoreDisplay', () => {
  it('renders the score number', () => {
    render(<ScoreDisplay score={85} />);
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('Overall Score')).toBeInTheDocument();
  });

  it('applies green color for high scores (>= 80)', () => {
    render(<ScoreDisplay score={90} />);
    const scoreValue = screen.getByText('90');
    expect(scoreValue).toHaveStyle({ color: '#4caf50' });
  });

  it('applies orange color for medium scores (60-79)', () => {
    render(<ScoreDisplay score={70} />);
    const scoreValue = screen.getByText('70');
    expect(scoreValue).toHaveStyle({ color: '#ff9800' });
  });

  it('applies red color for low scores (< 60)', () => {
    render(<ScoreDisplay score={45} />);
    const scoreValue = screen.getByText('45');
    expect(scoreValue).toHaveStyle({ color: '#f44336' });
  });
});
