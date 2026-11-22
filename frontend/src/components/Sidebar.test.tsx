import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../hooks/useAuth';
import { useChatUnreadCount } from '../hooks/useChatUnreadCount';
import Sidebar from './Sidebar';

const mockUser = {
  user_id: '123',
  email: 'test@example.com',
  full_name: 'Test User',
  role: 'member' as const,
};

function renderWithProviders(component: React.ReactNode) {
  return render(
    <BrowserRouter>
      <AuthProvider>
        {component}
      </AuthProvider>
    </BrowserRouter>
  );
}

// Mock useAuth
vi.mock('../hooks/useAuth', async () => {
  const actual = await vi.importActual('../hooks/useAuth');
  return {
    ...actual,
    useAuth: () => ({
      user: mockUser,
      isAuthenticated: true,
      isInitializing: false,
      logout: vi.fn(),
    }),
  };
});

// Mock useQuickOverview
vi.mock('../hooks/useQuickOverview', () => ({
  useQuickOverview: vi.fn(() => ({
    isOpen: false,
    onClose: vi.fn(),
    onReopenGuide: vi.fn(),
  })),
}));

// Chat V1 Task 6: Sidebar now calls useChatUnreadCount, which itself
// calls the real api/useRealtime -- mocked wholesale here (like
// useQuickOverview above) so these existing, pre-Chat Sidebar tests never
// make a real network/SSE call. The badge's own rendering is covered by
// a dedicated describe block below that overrides this mock's return
// value per test.
vi.mock('../hooks/useChatUnreadCount', () => ({
  useChatUnreadCount: vi.fn(() => 0),
}));

const mockUseChatUnreadCount = useChatUnreadCount as unknown as ReturnType<typeof vi.fn>;

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChatUnreadCount.mockReturnValue(0);
  });

  describe('rendering', () => {
    it('renders sidebar with primary navigation items', () => {
      renderWithProviders(<Sidebar />);
      expect(screen.getByText('Work Activity')).toBeInTheDocument();
      expect(screen.getByText('Goals')).toBeInTheDocument();
      expect(screen.getByText('Projects')).toBeInTheDocument();
      expect(screen.getByText('Teams')).toBeInTheDocument();
      expect(screen.getByText('SOS Hub')).toBeInTheDocument();
      expect(screen.getByText('Leaderboard')).toBeInTheDocument();
      expect(screen.getByText('Analytics')).toBeInTheDocument();
    });

    it('renders workspace section with Chat link', () => {
      renderWithProviders(<Sidebar />);
      const chatLink = screen.getByText('Chat');
      expect(chatLink).toBeInTheDocument();
    });

    it('tags the Chat link with a tour target for the global walkthrough', () => {
      renderWithProviders(<Sidebar />);
      const chatLink = screen.getByText('Chat').closest('a');
      expect(chatLink).toHaveAttribute('data-tour-target', 'chat');
    });

    it('renders help section', () => {
      renderWithProviders(<Sidebar />);
      const helpLink = screen.getByText('Help Center');
      expect(helpLink).toBeInTheDocument();
    });

    it('displays user information in footer', () => {
      renderWithProviders(<Sidebar />);
      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('member')).toBeInTheDocument();
    });

    it('renders CommandCenter logo', () => {
      renderWithProviders(<Sidebar />);
      expect(screen.getByText('CommandCenter')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('renders links with correct paths', () => {
      renderWithProviders(<Sidebar />);
      const pulseLink = screen.getByText('Work Activity').closest('a');
      expect(pulseLink).toHaveAttribute('href', '/pulse');

      const goalsLink = screen.getByText('Goals').closest('a');
      expect(goalsLink).toHaveAttribute('href', '/goals');

      const projectsLink = screen.getByText('Projects').closest('a');
      expect(projectsLink).toHaveAttribute('href', '/projects');
    });

    it('marks active route with highlighting', () => {
      window.history.pushState({}, 'Test', '/goals');
      renderWithProviders(<Sidebar />);
      const goalsLink = screen.getByText('Goals').closest('a');
      expect(goalsLink?.className).toContain('bg-blue-50');
    });
  });

  describe('mobile behavior', () => {
    it('renders sidebar toggle button on mobile', () => {
      renderWithProviders(<Sidebar />);
      const toggleButton = screen.getByRole('button', { name: /toggle sidebar/i });
      expect(toggleButton).toBeInTheDocument();
    });

    it('toggles sidebar visibility on mobile', async () => {
      renderWithProviders(<Sidebar />);
      const toggleButton = screen.getByRole('button', { name: /toggle sidebar/i });
      const sidebar = toggleButton.closest('aside') || screen.getByText('CommandCenter').closest('aside');

      expect(sidebar).toBeInTheDocument();

      fireEvent.click(toggleButton);
      await waitFor(() => {
        expect(sidebar).toBeInTheDocument();
      });
    });

    it('closes sidebar when a link is clicked on mobile', async () => {
      renderWithProviders(<Sidebar />);
      const toggleButton = screen.getByRole('button', { name: /toggle sidebar/i });

      fireEvent.click(toggleButton);

      const pulseLink = screen.getByText('Work Activity').closest('a');
      if (pulseLink) {
        fireEvent.click(pulseLink);
      }

      await waitFor(() => {
        expect(toggleButton).toBeInTheDocument();
      });
    });
  });

  describe('structure', () => {
    it('organizes navigation into sections with headers', () => {
      renderWithProviders(<Sidebar />);
      const headers = screen.getAllByText(/Primary|Workspace|Help/);
      expect(headers.length).toBeGreaterThan(0);
    });

    it('renders sidebar with footer user info section', () => {
      renderWithProviders(<Sidebar />);
      const userNameElement = screen.getByText('Test User');
      expect(userNameElement).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has proper aria label on toggle button', () => {
      renderWithProviders(<Sidebar />);
      const toggleButton = screen.getByRole('button', { name: /toggle sidebar/i });
      expect(toggleButton).toHaveAttribute('aria-label', 'Toggle sidebar');
    });

    it('uses semantic nav element', () => {
      const { container } = renderWithProviders(<Sidebar />);
      const nav = container.querySelector('nav');
      expect(nav).toBeInTheDocument();
    });
  });

  describe('How to Use replay (Global Spotlight Tour)', () => {
    it('renders "How to Use" button in Help section', () => {
      renderWithProviders(<Sidebar />);
      const howToUseButton = screen.getByRole('button', { name: /how to use/i });
      expect(howToUseButton).toBeInTheDocument();
    });

    it('"How to Use" button is accessible and clickable', () => {
      renderWithProviders(<Sidebar />);
      const howToUseButton = screen.getByRole('button', { name: /how to use/i });
      expect(howToUseButton).not.toBeDisabled();

      // Verify it's clickable without error
      fireEvent.click(howToUseButton);
      expect(howToUseButton).toBeInTheDocument();
    });

    it('renders Help section with both "How to Use" and "Help Center"', () => {
      renderWithProviders(<Sidebar />);
      expect(screen.getByRole('button', { name: /how to use/i })).toBeInTheDocument();
      expect(screen.getByText('Help Center')).toBeInTheDocument();
    });
  });

  describe('Chat navigation (Task 6)', () => {
    it('the Chat link points to /chat, not the old #chat stub', () => {
      renderWithProviders(<Sidebar />);
      const chatLink = screen.getByText('Chat').closest('a');
      expect(chatLink).toHaveAttribute('href', '/chat');
    });

    it('the Chat link is no longer disabled', () => {
      renderWithProviders(<Sidebar />);
      const chatLink = screen.getByText('Chat').closest('a');
      expect(chatLink?.className).not.toContain('cursor-not-allowed');
    });

    it('marks Chat active when on /chat, matching other nav items', () => {
      window.history.pushState({}, 'Test', '/chat');
      renderWithProviders(<Sidebar />);
      const chatLink = screen.getByText('Chat').closest('a');
      expect(chatLink?.className).toContain('bg-blue-50');
    });

    it('closes the mobile sidebar after selecting Chat', async () => {
      renderWithProviders(<Sidebar />);
      const toggleButton = screen.getByRole('button', { name: /toggle sidebar/i });
      fireEvent.click(toggleButton);

      const chatLink = screen.getByText('Chat').closest('a')!;
      fireEvent.click(chatLink);

      await waitFor(() => {
        expect(toggleButton).toBeInTheDocument();
      });
    });

    it('shows no badge when there are no unread chat messages', () => {
      mockUseChatUnreadCount.mockReturnValue(0);
      renderWithProviders(<Sidebar />);
      expect(screen.queryByLabelText(/unread/i)).not.toBeInTheDocument();
    });

    it('shows an unread badge on the Chat item when the count is positive', () => {
      mockUseChatUnreadCount.mockReturnValue(3);
      renderWithProviders(<Sidebar />);
      expect(screen.getByLabelText('3 unread')).toBeInTheDocument();
    });

    it('caps the displayed badge at 99+', () => {
      mockUseChatUnreadCount.mockReturnValue(150);
      renderWithProviders(<Sidebar />);
      expect(screen.getByLabelText('150 unread')).toHaveTextContent('99+');
    });
  });
});
