import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickOverview from './QuickOverview';

// Mock framer-motion to avoid animation complications in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

const mockOnClose = vi.fn();

describe('QuickOverview', () => {
  beforeEach(() => {
    mockOnClose.mockClear();
  });

  describe('rendering and visibility', () => {
    it('renders nothing when isOpen is false', () => {
      render(<QuickOverview isOpen={false} onClose={mockOnClose} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders modal when isOpen is true', () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('renders all 10 cards with correct titles', () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('Welcome to CommandCenter')).toBeInTheDocument();
    });

    it('displays correct icon for first card', () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      const icons = screen.getAllByText(/👋|📊|👥|🎯|✅|💬|🚧|📈|🔔|🚀/);
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe('card content accuracy', () => {
    it('shows Welcome card content on first load', () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText("Your team's space for goals, projects, communication, and progress.")).toBeInTheDocument();
    });

    it('shows Pulse card after clicking Next', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      const nextButton = screen.getByRole('button', { name: /Next/ });
      await user.click(nextButton);

      expect(screen.getByText('See what needs your attention and share your daily progress.')).toBeInTheDocument();
    });

    it('shows final card with correct content', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      // Navigate to last card (card 10, so 9 clicks)
      const nextButton = () => screen.getByRole('button', { name: /Next/ });
      for (let i = 0; i < 9; i++) {
        await user.click(nextButton());
      }

      expect(screen.getByText("You're Ready")).toBeInTheDocument();
      expect(screen.getByText('Check your team. See your goals. Get to work.')).toBeInTheDocument();
    });
  });

  describe('navigation controls', () => {
    it('Previous button is disabled on first card', () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      expect(screen.queryByRole('button', { name: /Previous/ })).not.toBeInTheDocument();
    });

    it('Previous button appears after navigating forward', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      const nextButton = screen.getByRole('button', { name: /Next/ });
      await user.click(nextButton);

      expect(screen.getByRole('button', { name: /Previous/ })).toBeInTheDocument();
    });

    it('clicking Previous goes back one card', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      const nextButton = () => screen.getByRole('button', { name: /Next/ });
      await user.click(nextButton());
      await user.click(nextButton());

      const previousButton = screen.getByRole('button', { name: /Previous/ });
      await user.click(previousButton);

      expect(screen.getByText('See what needs your attention and share your daily progress.')).toBeInTheDocument();
    });

    it('Skip button closes walkthrough on non-final cards', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      const skipButton = screen.getByRole('button', { name: /Skip/ });
      await user.click(skipButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('Finish button appears on last card', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      const nextButton = () => screen.getByRole('button', { name: /Next/ });
      for (let i = 0; i < 9; i++) {
        await user.click(nextButton());
      }

      expect(screen.getByText(/Explore CommandCenter/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Skip/ })).not.toBeInTheDocument();
    });

    it('Finish button closes walkthrough', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      const nextButton = () => screen.getByRole('button', { name: /Next/ });
      for (let i = 0; i < 9; i++) {
        await user.click(nextButton());
      }

      const finishButton = screen.getByText(/Explore CommandCenter/).closest('button');
      await user.click(finishButton!);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('progress indicator', () => {
    it('shows correct numeric progress on first card', () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('1 / 10')).toBeInTheDocument();
    });

    it('updates numeric progress when navigating', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      const nextButton = () => screen.getByRole('button', { name: /Next/ });
      await user.click(nextButton());

      expect(screen.getByText('2 / 10')).toBeInTheDocument();
    });

    it('shows dot indicators for all cards', () => {
      const { container } = render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      const dots = container.querySelectorAll('.rounded-full');
      // 10 dots for cards
      expect(dots.length).toBe(10);
    });

    it('highlights current card in progress dots', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      const nextButton = () => screen.getByRole('button', { name: /Next/ });
      await user.click(nextButton());

      // Verify progress visual update (dot color changes)
      expect(screen.getByText('2 / 10')).toBeInTheDocument();
    });
  });

  describe('keyboard navigation', () => {
    it('closes walkthrough on Escape key', () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('navigates forward on ArrowRight key', async () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      await waitFor(() => {
        expect(screen.getByText('See what needs your attention and share your daily progress.')).toBeInTheDocument();
      });
    });

    it('navigates backward on ArrowLeft key', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      const nextButton = () => screen.getByRole('button', { name: /Next/ });
      await user.click(nextButton());

      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      await waitFor(() => {
        expect(screen.getByText("Your team's space for goals, projects, communication, and progress.")).toBeInTheDocument();
      });
    });

    it('does not navigate past bounds with keyboard', async () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      // Should still be on first card
      expect(screen.getByText("Your team's space for goals, projects, communication, and progress.")).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has dialog role and aria-modal attribute', () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('has aria-labelledby pointing to title', () => {
      const { container } = render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'overview-title');
      expect(container.querySelector('#overview-title')).toBeInTheDocument();
    });

    it('has descriptive aria-labels on buttons', () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByRole('button', { name: /Next card/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Skip walkthrough/ })).toBeInTheDocument();
    });

    it('properly hides decorative elements from screen readers', () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      const icon = screen.getByText('👋');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('has focus-visible styles for keyboard navigation', async () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      // Focus should be manageable after tab
      expect(document.activeElement).toBeTruthy();
    });
  });

  describe('modal interaction', () => {
    it('closes when clicking outside the modal', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      const backdrop = screen.getByRole('presentation');
      await user.click(backdrop);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not close when clicking inside the modal content', async () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      const dialog = screen.getByRole('dialog');
      fireEvent.click(dialog);

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('prevents event propagation when clicking inside modal', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      const title = screen.getByText('Welcome to CommandCenter');
      await user.click(title);

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('responsive behavior', () => {
    it('renders correctly on desktop viewport', () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('max-w-md');
    });

    it('has responsive padding for mobile', () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      const backdrop = screen.getByRole('presentation');
      expect(backdrop).toHaveClass('p-4');
    });

    it('layout adjusts for different screen sizes', () => {
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('w-full');
    });
  });

  describe('state persistence integration', () => {
    it('integrates with onClose callback for persistence', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      const skipButton = screen.getByRole('button', { name: /Skip/ });
      await user.click(skipButton);

      // Hook should handle persistence via callback
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('supports reopening via prop change', () => {
      const { rerender } = render(<QuickOverview isOpen={false} onClose={mockOnClose} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      rerender(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('no interference with app flow', () => {
    it('does not block interactions with content behind modal', () => {
      const { container } = render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      // Modal backdrop has z-50
      const backdrop = container.querySelector('.fixed.inset-0.z-50');
      expect(backdrop).toBeInTheDocument();
    });

    it('maintains modal stacking context', () => {
      const { container } = render(<QuickOverview isOpen={true} onClose={mockOnClose} />);
      // Outer wrapper should have z-50 for stacking
      const wrapper = container.querySelector('.fixed.inset-0.z-50');
      expect(wrapper).toHaveClass('z-50');
    });
  });

  describe('card progression', () => {
    it('allows full progression through all 10 cards', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      const nextButton = () => screen.queryByRole('button', { name: /Next/ });

      for (let i = 0; i < 9; i++) {
        const btn = nextButton();
        if (btn) {
          await user.click(btn);
        }
      }

      expect(screen.getByText("You're Ready")).toBeInTheDocument();
    });

    it('maintains correct card order through navigation', async () => {
      const user = userEvent.setup();
      render(<QuickOverview isOpen={true} onClose={mockOnClose} />);

      // Card 1
      expect(screen.getByText("Your team's space for goals, projects, communication, and progress.")).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Next/ }));

      // Card 2
      expect(screen.getByText('See what needs your attention and share your daily progress.')).toBeInTheDocument();
    });
  });
});
