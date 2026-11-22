import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Navigation from './Navigation';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

// Milestone 18: mocks the one external dependency Navigation has beyond
// react-router-dom (useAuth) so this test never depends on a real
// AuthProvider, localStorage, or backend call -- exactly the low-coupling
// pattern this milestone is establishing.
vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Notifications feature: Navigation now renders NotificationBell, which
// calls services/api and useRealtime on mount -- mocked here for the same
// reason useAuth is, so this stays a pure Navigation-shell test with no
// real network/SSE calls.
vi.mock('../services/api');
vi.mock('../hooks/useRealtime', () => ({
  useRealtime: () => undefined,
}));

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.mocked(api.getMyNotifications).mockResolvedValue({ data: { data: { notifications: [], unreadCount: 0 } } } as any);
});

const renderNavigation = (path: string, user = { full_name: 'Ada Lovelace', role: 'member' }, logout = vi.fn()) => {
  mockUseAuth.mockReturnValue({ user, logout, token: 'fake-token', isAuthenticated: true, login: vi.fn(), register: vi.fn() });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navigation />
    </MemoryRouter>
  );
};

describe('Navigation', () => {
  it('renders the minimal header with user info and notification bell', () => {
    renderNavigation('/pulse');

    // Header should show notification bell and user info
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('member')).toBeInTheDocument();
  });

  it('navigation items are no longer in the header (moved to sidebar)', () => {
    renderNavigation('/pulse');

    // Navigation labels should NOT be in the header (they're in the sidebar now)
    for (const label of ['Daily Logs', 'Projects', 'Teams', 'Goals', 'Leaderboard', 'Help Center', 'Analytics']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('renders the notification bell in the header', async () => {
    renderNavigation('/pulse');
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    await waitFor(() => expect(api.getMyNotifications).toHaveBeenCalled());
  });

  it("shows the current user's name, role, and initials", () => {
    renderNavigation('/pulse', { full_name: 'Ada Lovelace', role: 'admin' });

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('calls logout when "Sign out" is clicked', () => {
    const logout = vi.fn();
    renderNavigation('/pulse', { full_name: 'Ada Lovelace', role: 'member' }, logout);

    // Open the account menu
    fireEvent.click(screen.getByText('AL').closest('button')!);

    // Click the Sign out button in the dropdown
    fireEvent.click(screen.getByText('Sign out'));

    expect(logout).toHaveBeenCalledTimes(1);
  });
});
