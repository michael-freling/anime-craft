import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import SessionControls from '../../components/session/SessionControls';

describe('SessionControls', () => {
  const defaultProps = {
    elapsedSeconds: 125,
    onSubmit: vi.fn(),
    onDiscard: vi.fn(),
    isSubmitting: false,
  };

  it('renders timer with formatted time', () => {
    render(<SessionControls {...defaultProps} />);
    expect(screen.getByText('02:05')).toBeInTheDocument();
  });

  it('renders submit and discard buttons', () => {
    render(<SessionControls {...defaultProps} />);
    expect(screen.getByText('Submit Drawing')).toBeInTheDocument();
    expect(screen.getByText('Discard')).toBeInTheDocument();
  });

  it('shows loading state when submitting', () => {
    render(<SessionControls {...defaultProps} isSubmitting={true} />);
    expect(screen.getByText('Submitting...')).toBeInTheDocument();
    expect(screen.getByText('Submitting...')).toBeDisabled();
    expect(screen.getByText('Discard')).toBeDisabled();
  });

  it('calls onSubmit when submit button is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SessionControls {...defaultProps} onSubmit={onSubmit} />);

    await user.click(screen.getByText('Submit Drawing'));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('calls onDiscard when discard button is clicked', async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    render(<SessionControls {...defaultProps} onDiscard={onDiscard} />);

    await user.click(screen.getByText('Discard'));
    expect(onDiscard).toHaveBeenCalled();
  });
});
