import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import FeedbackDetails from '../../components/feedback/FeedbackDetails';

describe('FeedbackDetails', () => {
  const defaultProps = {
    summary: 'Good attempt with room for improvement.',
    details: 'Your line work shows promise and consistency.',
    strengths: ['Clean line strokes', 'Good proportions'],
    improvements: ['Work on line confidence', 'Practice curves'],
  };

  it('renders summary text', () => {
    render(<FeedbackDetails {...defaultProps} />);

    expect(screen.getByTestId('feedback-summary')).toBeInTheDocument();
    expect(screen.getByText('Good attempt with room for improvement.')).toBeInTheDocument();
  });

  it('renders details text', () => {
    render(<FeedbackDetails {...defaultProps} />);

    expect(screen.getByTestId('feedback-details-text')).toBeInTheDocument();
    expect(screen.getByText('Your line work shows promise and consistency.')).toBeInTheDocument();
  });

  it('renders strengths list with correct heading', () => {
    render(<FeedbackDetails {...defaultProps} />);

    expect(screen.getByTestId('feedback-strengths')).toBeInTheDocument();
    expect(screen.getByText('What you did well')).toBeInTheDocument();
    expect(screen.getByText('Clean line strokes')).toBeInTheDocument();
    expect(screen.getByText('Good proportions')).toBeInTheDocument();
  });

  it('renders improvements list with correct heading', () => {
    render(<FeedbackDetails {...defaultProps} />);

    expect(screen.getByTestId('feedback-improvements')).toBeInTheDocument();
    expect(screen.getByText('Areas to improve')).toBeInTheDocument();
    expect(screen.getByText('Work on line confidence')).toBeInTheDocument();
    expect(screen.getByText('Practice curves')).toBeInTheDocument();
  });

  it('returns null when all props are empty/missing', () => {
    const { container } = render(
      <FeedbackDetails
        summary=""
        details=""
        strengths={[]}
        improvements={[]}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('returns null when no props are provided', () => {
    const { container } = render(<FeedbackDetails />);

    expect(container.firstChild).toBeNull();
  });

  it('hides strengths section when list is empty', () => {
    render(
      <FeedbackDetails
        summary="Summary."
        strengths={[]}
        improvements={['Fix something']}
      />
    );

    expect(screen.queryByTestId('feedback-strengths')).not.toBeInTheDocument();
    expect(screen.getByTestId('feedback-improvements')).toBeInTheDocument();
  });

  it('hides improvements section when list is empty', () => {
    render(
      <FeedbackDetails
        summary="Summary."
        strengths={['Great job']}
        improvements={[]}
      />
    );

    expect(screen.getByTestId('feedback-strengths')).toBeInTheDocument();
    expect(screen.queryByTestId('feedback-improvements')).not.toBeInTheDocument();
  });

  it('hides details section when details is empty', () => {
    render(
      <FeedbackDetails
        summary="Summary."
        details=""
        strengths={['Great job']}
        improvements={[]}
      />
    );

    expect(screen.queryByTestId('feedback-details-text')).not.toBeInTheDocument();
  });

  it('hides summary section when summary is empty', () => {
    render(
      <FeedbackDetails
        summary=""
        details="Some details."
        strengths={[]}
        improvements={[]}
      />
    );

    expect(screen.queryByTestId('feedback-summary')).not.toBeInTheDocument();
    expect(screen.getByTestId('feedback-details-text')).toBeInTheDocument();
  });

  it('renders only provided sections', () => {
    render(
      <FeedbackDetails
        summary="Just a summary."
      />
    );

    expect(screen.getByTestId('feedback-summary')).toBeInTheDocument();
    expect(screen.queryByTestId('feedback-strengths')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feedback-improvements')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feedback-details-text')).not.toBeInTheDocument();
  });
});
