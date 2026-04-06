import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FeedbackScores from '../../components/feedback/FeedbackScores';

describe('FeedbackScores', () => {
  it('renders all four score bars when all scores are provided', () => {
    render(
      <FeedbackScores
        overallScore={75}
        proportionsScore={80}
        lineQualityScore={60}
        accuracyScore={45}
      />
    );

    expect(screen.getByTestId('score-bar-overall')).toBeInTheDocument();
    expect(screen.getByTestId('score-bar-proportions')).toBeInTheDocument();
    expect(screen.getByTestId('score-bar-line-quality')).toBeInTheDocument();
    expect(screen.getByTestId('score-bar-accuracy')).toBeInTheDocument();
  });

  it('displays correct score values', () => {
    render(
      <FeedbackScores
        overallScore={75}
        proportionsScore={80}
        lineQualityScore={60}
        accuracyScore={45}
      />
    );

    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
  });

  it('displays score labels', () => {
    render(
      <FeedbackScores
        overallScore={75}
        proportionsScore={80}
        lineQualityScore={60}
        accuracyScore={45}
      />
    );

    expect(screen.getByText('Overall')).toBeInTheDocument();
    expect(screen.getByText('Proportions')).toBeInTheDocument();
    expect(screen.getByText('Line Quality')).toBeInTheDocument();
    expect(screen.getByText('Accuracy')).toBeInTheDocument();
  });

  it('shows "Analyzing..." when all scores are 0', () => {
    render(
      <FeedbackScores
        overallScore={0}
        proportionsScore={0}
        lineQualityScore={0}
        accuracyScore={0}
      />
    );

    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
    expect(screen.queryByTestId('score-bar-overall')).not.toBeInTheDocument();
  });

  it('shows "Analyzing..." when all scores are undefined', () => {
    render(<FeedbackScores />);

    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
  });

  it('applies green color class for scores >= 70', () => {
    const { container } = render(<FeedbackScores overallScore={85} />);

    const fill = container.querySelector('.score-fill');
    expect(fill).toHaveClass('score-fill-green');
  });

  it('applies yellow color class for scores 40-69', () => {
    const { container } = render(<FeedbackScores overallScore={55} />);

    const fill = container.querySelector('.score-fill');
    expect(fill).toHaveClass('score-fill-yellow');
  });

  it('applies red color class for scores < 40', () => {
    const { container } = render(<FeedbackScores overallScore={20} />);

    const fill = container.querySelector('.score-fill');
    expect(fill).toHaveClass('score-fill-red');
  });

  it('sets correct bar fill width based on score', () => {
    const { container } = render(<FeedbackScores overallScore={75} />);

    const fill = container.querySelector('.score-fill');
    expect(fill).toHaveStyle({ width: '75%' });
  });

  it('hides bars for undefined scores while showing defined ones', () => {
    render(
      <FeedbackScores
        overallScore={75}
        proportionsScore={undefined}
        lineQualityScore={undefined}
        accuracyScore={undefined}
      />
    );

    expect(screen.getByTestId('score-bar-overall')).toBeInTheDocument();
    expect(screen.queryByTestId('score-bar-proportions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('score-bar-line-quality')).not.toBeInTheDocument();
    expect(screen.queryByTestId('score-bar-accuracy')).not.toBeInTheDocument();
  });
});
