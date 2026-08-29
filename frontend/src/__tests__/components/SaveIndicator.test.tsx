import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SaveIndicator from '../../components/drawing/SaveIndicator';

describe('SaveIndicator', () => {
  it('promises to save before anything has been written', () => {
    render(<SaveIndicator status="idle" lastSavedAt={null} error={null} />);

    expect(screen.getByTestId('save-indicator')).toHaveTextContent(
      'Saves as you draw'
    );
  });

  it('says when a save is in progress', () => {
    render(<SaveIndicator status="saving" lastSavedAt={null} error={null} />);

    expect(screen.getByTestId('save-indicator')).toHaveTextContent('Saving');
  });

  it('says when the drawing was last written', () => {
    const at = new Date(2026, 0, 2, 14, 5).getTime();
    render(<SaveIndicator status="saved" lastSavedAt={at} error={null} />);

    expect(screen.getByTestId('save-indicator')).toHaveTextContent('Saved 14:05');
  });

  // A silent failure is the worst outcome: the artist has to know the work is
  // only in the window.
  it('says plainly when a save failed, and carries the reason', () => {
    render(
      <SaveIndicator status="error" lastSavedAt={Date.now()} error="disk full" />
    );

    const indicator = screen.getByTestId('save-indicator');
    expect(indicator).toHaveTextContent('Not saved');
    expect(indicator).toHaveClass('save-indicator-error');
    expect(indicator).toHaveAttribute('title', 'disk full');
  });
});
