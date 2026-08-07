import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './useAuth';
import * as api from '../services/api';

// Milestone 18: mocks the only external dependency AuthProvider has
// (services/api, a thin axios wrapper) so this test never makes a real
// network call or depends on a running backend.
vi.mock('../services/api');

const FAKE_USER = { user_id: '1', email: 'ada@example.com', username: 'ada', full_name: 'Ada Lovelace', role: 'member', impact_score: 0, streak_count: 0 };

// A tiny consumer component -- AuthProvider only exposes its state through
// the useAuth() hook, so a component is the natural way to exercise it via
// React Testing Library rather than reaching into React internals directly.
const Consumer = () => {
  const { user, isAuthenticated, login, logout } = useAuth();
  return (
    <div>
      <div data-testid="auth-state">{isAuthenticated ? 'authenticated' : 'anonymous'}</div>
      <div data-testid="user-name">{user?.full_name ?? 'none'}</div>
      <button onClick={() => login('ada@example.com', 'password123')}>Log in</button>
      <button onClick={logout}>Log out</button>
    </div>
  );
};

describe('useAuth / AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('throws when used outside an AuthProvider', () => {
    // Swallow the expected React error-boundary console.error noise for
    // this one assertion -- the throw itself is what's under test.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Consumer />)).toThrow('useAuth must be used within AuthProvider');
    errorSpy.mockRestore();
  });

  it('starts anonymous, then reflects a successful login', async () => {
    vi.mocked(api.login).mockResolvedValue({ data: { data: { user: FAKE_USER, token: 'fake-jwt' } } } as any);

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('auth-state')).toHaveTextContent('anonymous');

    fireEvent.click(screen.getByText('Log in'));

    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('user-name')).toHaveTextContent('Ada Lovelace');
    expect(localStorage.getItem('token')).toBe('fake-jwt');
  });

  it('restores a previously logged-in user from localStorage on mount', () => {
    localStorage.setItem('token', 'stored-jwt');
    localStorage.setItem('user', JSON.stringify(FAKE_USER));

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user-name')).toHaveTextContent('Ada Lovelace');
  });
});
