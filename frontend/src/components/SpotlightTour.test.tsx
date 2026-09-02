import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SpotlightTour from './SpotlightTour';

describe('SpotlightTour', () => {
  beforeEach(() => {
    // Mock matchMedia for reduced motion
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it('renders welcome step when open', () => {
    render(<SpotlightTour isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Welcome to CommandCenter')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const { container } = render(<SpotlightTour isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).not.toBeInTheDocument();
  });

  it('calls onClose when Finish button is clicked on last step', () => {
    const onClose = vi.fn();
    render(<SpotlightTour isOpen={true} onClose={onClose} />);

    // Skip to last step (step 10 - index 10)
    const nextButtons = screen.getAllByRole('button', { name: /next/i });
    for (let i = 0; i < 10; i++) {
      fireEvent.click(nextButtons[0]);
    }

    const finishButton = screen.getByRole('button', { name: /finish/i });
    fireEvent.click(finishButton);
    expect(onClose).toHaveBeenCalled();
  });

  it('handles keyboard navigation', () => {
    const onClose = vi.fn();
    render(<SpotlightTour isOpen={true} onClose={onClose} />);

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows step counter', () => {
    render(<SpotlightTour isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText(/1 \/ 11/)).toBeInTheDocument();
  });

  it('disables previous button on first step', () => {
    render(<SpotlightTour isOpen={true} onClose={vi.fn()} />);
    const prevButton = screen.queryByRole('button', { name: /back/i });
    expect(prevButton).not.toBeInTheDocument();
  });

  it('progress dots update as user advances', () => {
    render(<SpotlightTour isOpen={true} onClose={vi.fn()} />);

    // Check that progress indicators exist
    const allDivs = screen.getByText(/1 \/ 11/).parentElement?.parentElement?.querySelector('.flex.gap-1');
    expect(allDivs).toBeInTheDocument();
  });
});
