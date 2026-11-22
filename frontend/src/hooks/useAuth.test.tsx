import { useState } from 'react';
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

// Milestone 55: register() never returns a session -- the backend's
// register() always resolves to {email, username, is_verified}, in BOTH
// the auto-verify and verification-pending cases (confirmed against
// auth.service.ts). The previous implementation here unconditionally
// destructured {user, token} from that shape, meaning every registration
// silently stored `undefined` as the session. These tests exercise the
// actual fix, not just Register.tsx's reaction to it.
const RegisterConsumer = () => {
  const { user, isAuthenticated, register } = useAuth();
  const [result, setResult] = useState<any>(null);

  return (
    <div>
      <div data-testid="auth-state">{isAuthenticated ? 'authenticated' : 'anonymous'}</div>
      <div data-testid="user-name">{user?.full_name ?? 'none'}</div>
      <div data-testid="register-result">{result ? JSON.stringify(result) : 'none'}</div>
      <button
        onClick={async () => {
          const r = await register({ email: 'ada@example.com', username: 'ada', fullName: 'Ada Lovelace', password: 'password123' });
          setResult(r);
        }}
      >
        Register
      </button>
    </div>
  );
};

describe('useAuth / AuthProvider -- register()', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('establishes a real session (via login) when registration returns is_verified: true', async () => {
    vi.mocked(api.register).mockResolvedValue({ data: { data: { email: 'ada@example.com', username: 'ada', is_verified: true } } } as any);
    vi.mocked(api.login).mockResolvedValue({ data: { data: { user: FAKE_USER, token: 'fresh-jwt' } } } as any);

    render(
      <AuthProvider>
        <RegisterConsumer />
      </AuthProvider>
    );

    fireEvent.click(screen.getByText('Register'));

    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated'));
    expect(api.login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'password123' });
    expect(localStorage.getItem('token')).toBe('fresh-jwt');
  });

  it('does NOT establish a session when registration returns is_verified: false, and returns the result to the caller', async () => {
    vi.mocked(api.register).mockResolvedValue({ data: { data: { email: 'ada@example.com', username: 'ada', is_verified: false } } } as any);

    render(
      <AuthProvider>
        <RegisterConsumer />
      </AuthProvider>
    );

    fireEvent.click(screen.getByText('Register'));

    await waitFor(() => expect(screen.getByTestId('register-result')).toHaveTextContent('is_verified'));
    expect(screen.getByTestId('auth-state')).toHaveTextContent('anonymous');
    expect(api.login).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();
  });
});
