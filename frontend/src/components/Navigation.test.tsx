import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import Navigation from './Navigation';
import { useAuth } from '../hooks/useAuth';

// Milestone 18: mocks the one external dependency Navigation has beyond
// react-router-dom (useAuth) so this test never depends on a real
// AuthProvider, localStorage, or backend call -- exactly the low-coupling
// pattern this milestone is establishing.
vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const renderNavigation = (path: string, user = { full_name: 'Ada Lovelace', role: 'member' }, logout = vi.fn()) => {
  mockUseAuth.mockReturnValue({ user, logout, token: 'fake-token', isAuthenticated: true, login: vi.fn(), register: vi.fn() });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navigation />
    </MemoryRouter>
  );
};

describe('Navigation', () => {
  it('renders every nav item label', () => {
    renderNavigation('/pulse');

    for (const label of ['Daily Logs', 'Projects', 'Teams', 'Goals', 'Leaderboard', 'Help Center', 'Analytics']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
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

    fireEvent.click(screen.getByText('Sign out'));

    expect(logout).toHaveBeenCalledTimes(1);
  });
});
