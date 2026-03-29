import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FeedbackComments from '../../components/feedback/FeedbackComments';

describe('FeedbackComments', () => {
  const defaultProps = {
    summary: 'Good attempt with room for improvement.',
    strengths: ['Clean line strokes', 'Good proportions'],
    improvements: ['Work on line confidence', 'Practice curves'],
  };

  it('renders summary text', () => {
    render(<FeedbackComments {...defaultProps} />);

    expect(screen.getByTestId('feedback-summary')).toBeInTheDocument();
    expect(screen.getByText('Good attempt with room for improvement.')).toBeInTheDocument();
  });

  it('renders strengths list', () => {
    render(<FeedbackComments {...defaultProps} />);

    expect(screen.getByTestId('feedback-strengths')).toBeInTheDocument();
    expect(screen.getByText('Clean line strokes')).toBeInTheDocument();
    expect(screen.getByText('Good proportions')).toBeInTheDocument();
  });

  it('renders improvements list', () => {
    render(<FeedbackComments {...defaultProps} />);

    expect(screen.getByTestId('feedback-improvements')).toBeInTheDocument();
    expect(screen.getByText('Work on line confidence')).toBeInTheDocument();
    expect(screen.getByText('Practice curves')).toBeInTheDocument();
  });

  it('hides strengths section when list is empty', () => {
    render(
      <FeedbackComments summary="Summary." strengths={[]} improvements={['Fix something']} />
    );

    expect(screen.queryByTestId('feedback-strengths')).not.toBeInTheDocument();
    expect(screen.getByTestId('feedback-improvements')).toBeInTheDocument();
  });

  it('hides improvements section when list is empty', () => {
    render(
      <FeedbackComments summary="Summary." strengths={['Great job']} improvements={[]} />
    );

    expect(screen.getByTestId('feedback-strengths')).toBeInTheDocument();
    expect(screen.queryByTestId('feedback-improvements')).not.toBeInTheDocument();
  });

  it('renders Summary section title', () => {
    render(<FeedbackComments {...defaultProps} />);
    expect(screen.getByText('Summary')).toBeInTheDocument();
  });

  it('renders Strengths section title', () => {
    render(<FeedbackComments {...defaultProps} />);
    expect(screen.getByText('Strengths')).toBeInTheDocument();
  });

  it('renders Areas to Improve section title', () => {
    render(<FeedbackComments {...defaultProps} />);
    expect(screen.getByText('Areas to Improve')).toBeInTheDocument();
  });
});
