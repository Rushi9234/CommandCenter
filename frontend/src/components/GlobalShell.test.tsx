import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProtectedLayoutWithWalkthrough } from '../App';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

const mockUser = {
  user_id: 'usr_shell_100',
  email: 'coordinator@example.com',
  full_name: 'Coordinator Jane',
  role: 'coordinator' as const,
  avatar_url: null,
};

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../hooks/useQuickOverview', () => ({
  useQuickOverview: () => ({
    isOpen: false,
    onClose: vi.fn(),
    onReopenGuide: vi.fn(),
  }),
}));

vi.mock('../hooks/useChatUnreadCount', () => ({
  useChatUnreadCount: () => 2,
}));

vi.mock('../services/api');

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

describe('GlobalShell Phase 1 Repair Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    mockUseAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isInitializing: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.mocked(api.getMyNotifications).mockResolvedValue({
      data: { data: { notifications: [], unreadCount: 0 } },
    } as any);
  });

  function renderShellAtRoute(route = '/pulse') {
    return render(
      <MemoryRouter initialEntries={[route]}>
        <ProtectedLayoutWithWalkthrough>
          <div data-testid="page-content">Page Content Here</div>
        </ProtectedLayoutWithWalkthrough>
      </MemoryRouter>
    );
  }

  it('renders desktop shell layout structure without top nav overlap', () => {
    const { container } = renderShellAtRoute('/pulse');

    // Sidebar navigation semantic element exists
    const nav = container.querySelector('nav');
    expect(nav).toBeInTheDocument();

    // Main content area has lg:ml-64 wrapper
    const mainWrapper = container.querySelector('div.lg\\:ml-64');
    expect(mainWrapper).toBeInTheDocument();

    // Header sits inside main wrapper above main content
    const header = container.querySelector('header');
    expect(header).toBeInTheDocument();
    expect(mainWrapper).toContainElement(header);

    // Header contains mobile hamburger button with aria-label
    const hamburgerBtn = screen.getByRole('button', { name: /toggle navigation menu|toggle sidebar/i });
    expect(hamburgerBtn).toBeInTheDocument();

    // Child content renders inside main
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('renders primary branding in sidebar and compact branding on mobile header', () => {
    renderShellAtRoute('/pulse');

    // Branding elements exist
    const brandElements = screen.getAllByText('CommandCenter');
    expect(brandElements.length).toBeGreaterThanOrEqual(2);

    // Sidebar brand is inside <aside>
    const aside = screen.getByRole('complementary');
    expect(aside).toHaveTextContent('CommandCenter');
  });

  it('opens and closes mobile drawer on hamburger click', () => {
    renderShellAtRoute('/pulse');

    const hamburgerBtn = screen.getByRole('button', { name: /toggle navigation menu|toggle sidebar/i });
    expect(hamburgerBtn).toHaveAttribute('aria-expanded', 'false');

    // Click to open
    fireEvent.click(hamburgerBtn);

    // Backdrop should be rendered
    const backdrop = screen.getByTestId('sidebar-backdrop');
    expect(backdrop).toBeInTheDocument();

    // Close button inside drawer should exist
    const closeBtn = screen.getByRole('button', { name: /close sidebar/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId('sidebar-backdrop')).not.toBeInTheDocument();
  });

  it('closes mobile drawer when backdrop is clicked', () => {
    renderShellAtRoute('/pulse');

    const hamburgerBtn = screen.getByRole('button', { name: /toggle navigation menu|toggle sidebar/i });
    fireEvent.click(hamburgerBtn);

    const backdrop = screen.getByTestId('sidebar-backdrop');
    expect(backdrop).toBeInTheDocument();

    fireEvent.click(backdrop);
    expect(screen.queryByTestId('sidebar-backdrop')).not.toBeInTheDocument();
  });

  it('closes mobile drawer when ESC key is pressed', () => {
    renderShellAtRoute('/pulse');

    const hamburgerBtn = screen.getByRole('button', { name: /toggle navigation menu|toggle sidebar/i });
    fireEvent.click(hamburgerBtn);

    expect(screen.getByTestId('sidebar-backdrop')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('sidebar-backdrop')).not.toBeInTheDocument();
  });

  it('closes mobile drawer when navigating via link click', () => {
    renderShellAtRoute('/pulse');

    const hamburgerBtn = screen.getByRole('button', { name: /toggle navigation menu|toggle sidebar/i });
    fireEvent.click(hamburgerBtn);

    expect(screen.getByTestId('sidebar-backdrop')).toBeInTheDocument();

    // Click Teams nav link inside sidebar
    const teamsLink = screen.getByRole('link', { name: /teams/i });
    fireEvent.click(teamsLink);

    expect(screen.queryByTestId('sidebar-backdrop')).not.toBeInTheDocument();
  });

  it('has valid accessibility attributes on interactive controls', () => {
    renderShellAtRoute('/pulse');

    const hamburgerBtn = screen.getByRole('button', { name: /toggle navigation menu|toggle sidebar/i });
    expect(hamburgerBtn).toHaveAttribute('aria-label');
    expect(hamburgerBtn).toHaveAttribute('aria-expanded', 'false');

    const userMenuBtn = screen.getByRole('button', { name: /account menu/i });
    expect(userMenuBtn).toHaveAttribute('aria-label', 'Account menu');
    expect(userMenuBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('navigates seamlessly across primary shell views', () => {
    renderShellAtRoute('/pulse');

    const goalsLink = screen.getByRole('link', { name: /goals/i });
    expect(goalsLink).toHaveAttribute('href', '/goals');

    const projectsLink = screen.getByRole('link', { name: /projects/i });
    expect(projectsLink).toHaveAttribute('href', '/projects');

    const chatLink = screen.getByRole('link', { name: /chat/i });
    expect(chatLink).toHaveAttribute('href', '/chat');
    expect(screen.getByLabelText('2 unread')).toBeInTheDocument();
  });
});
