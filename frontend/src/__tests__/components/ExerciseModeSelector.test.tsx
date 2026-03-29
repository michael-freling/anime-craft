import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ExerciseModeSelector from '../../components/session/ExerciseModeSelector';

describe('ExerciseModeSelector', () => {
  it('renders three mode buttons', () => {
    render(<ExerciseModeSelector selectedMode={null} onSelectMode={vi.fn()} />);

    expect(screen.getByText('Line Work')).toBeInTheDocument();
    expect(screen.getByText('Coloring')).toBeInTheDocument();
    expect(screen.getByText('Full Drawing')).toBeInTheDocument();
  });

  it('calls onSelectMode when a mode button is clicked', async () => {
    const user = userEvent.setup();
    const onSelectMode = vi.fn();
    render(<ExerciseModeSelector selectedMode={null} onSelectMode={onSelectMode} />);

    await user.click(screen.getByText('Line Work'));
    expect(onSelectMode).toHaveBeenCalledWith('line_work');

    await user.click(screen.getByText('Coloring'));
    expect(onSelectMode).toHaveBeenCalledWith('coloring');

    await user.click(screen.getByText('Full Drawing'));
    expect(onSelectMode).toHaveBeenCalledWith('full_drawing');
  });

  it('highlights the selected mode', () => {
    render(<ExerciseModeSelector selectedMode="coloring" onSelectMode={vi.fn()} />);

    const coloringBtn = screen.getByText('Coloring');
    expect(coloringBtn).toHaveClass('active');

    const lineWorkBtn = screen.getByText('Line Work');
    expect(lineWorkBtn).not.toHaveClass('active');
  });
});
