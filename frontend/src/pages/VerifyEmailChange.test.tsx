import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VerifyEmailChange from './VerifyEmailChange';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

// Exposes the router's current search string on-page so the URL-cleanup
// behavior (setSearchParams({}, { replace: true }) on success) can be
// asserted directly, since MemoryRouter never touches the real
// window.location.
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

// Same two-dependency mocking pattern as VerifyEmail.test.tsx (useAuth,
// services/api) -- this page calls api.verifyEmailChange directly (not
// through a useAuth method) since, unlike signup verification, this
// endpoint never returns a session to persist.
vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../services/api');

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const wrapped = (data: any) => ({ data: { success: true, data } });

const renderAt = (path: string) => {
  const logout = vi.fn();
  mockUseAuth.mockReturnValue({
    logout,
    user: null,
    token: null,
    isAuthenticated: false,
    login: vi.fn(),
    register: vi.fn(),
    completeEmailVerification: vi.fn(),
  });
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email-change" element={<VerifyEmailChange />} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
  return { ...result, logout };
};

describe('VerifyEmailChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an invalid-link state and makes no API call when the token is missing', () => {
    renderAt('/verify-email-change');

    expect(screen.getByText('Invalid link')).toBeInTheDocument();
    expect(api.verifyEmailChange).not.toHaveBeenCalled();
  });

  it('shows a loading state while verification is in flight', () => {
    vi.mocked(api.verifyEmailChange).mockReturnValue(new Promise(() => {}) as any);

    renderAt('/verify-email-change?token=abc123');

    expect(screen.getByText('Verifying your new email address...')).toBeInTheDocument();
  });

  it('submits the token to the backend exactly once', async () => {
    vi.mocked(api.verifyEmailChange).mockResolvedValue(wrapped({ email: 'new@example.com' }) as any);

    renderAt('/verify-email-change?token=exact-once-token');

    await waitFor(() => expect(api.verifyEmailChange).toHaveBeenCalledWith('exact-once-token'));
    expect(api.verifyEmailChange).toHaveBeenCalledTimes(1);
  });

  it('shows the success state, the new email, and a prompt to log in again', async () => {
    vi.mocked(api.verifyEmailChange).mockResolvedValue(wrapped({ email: 'new@example.com' }) as any);

    renderAt('/verify-email-change?token=valid-token');

    expect(await screen.findByText('Email changed')).toBeInTheDocument();
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    expect(screen.getByText(/log in again/i)).toBeInTheDocument();
  });

  it('clears the local auth session (logout) on successful verification', async () => {
    vi.mocked(api.verifyEmailChange).mockResolvedValue(wrapped({ email: 'new@example.com' }) as any);

    const { logout } = renderAt('/verify-email-change?token=valid-token');

    await screen.findByText('Email changed');
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('provides a working link back to /login after success', async () => {
    vi.mocked(api.verifyEmailChange).mockResolvedValue(wrapped({ email: 'new@example.com' }) as any);

    renderAt('/verify-email-change?token=valid-token');

    await screen.findByText('Email changed');
    screen.getByRole('button', { name: /Go to sign in/i }).click();

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  it('shows the backend generic error for an invalid/expired/replayed token without distinguishing the cause', async () => {
    vi.mocked(api.verifyEmailChange).mockRejectedValue({
      response: { data: { error: 'Invalid or expired verification token' } },
    });

    renderAt('/verify-email-change?token=bad-token');

    expect(await screen.findByText('Verification failed')).toBeInTheDocument();
    expect(screen.getByText('Invalid or expired verification token')).toBeInTheDocument();
  });

  it('never renders the raw token anywhere on the page', async () => {
    vi.mocked(api.verifyEmailChange).mockResolvedValue(wrapped({ email: 'new@example.com' }) as any);

    renderAt('/verify-email-change?token=super-secret-raw-token-value');

    await screen.findByText('Email changed');
    expect(screen.queryByText(/super-secret-raw-token-value/)).not.toBeInTheDocument();
  });

  it('never persists the raw token in localStorage or sessionStorage', async () => {
    vi.mocked(api.verifyEmailChange).mockResolvedValue(wrapped({ email: 'new@example.com' }) as any);

    renderAt('/verify-email-change?token=must-not-be-stored');

    await screen.findByText('Email changed');

    const allLocalStorageValues = Object.keys(localStorage).map((k) => localStorage.getItem(k)).join(' ');
    const allSessionStorageValues = Object.keys(sessionStorage).map((k) => sessionStorage.getItem(k)).join(' ');
    expect(allLocalStorageValues).not.toContain('must-not-be-stored');
    expect(allSessionStorageValues).not.toContain('must-not-be-stored');
  });

  it('removes the token from the visible URL after a successful verification', async () => {
    vi.mocked(api.verifyEmailChange).mockResolvedValue(wrapped({ email: 'new@example.com' }) as any);
    const logout = vi.fn();
    mockUseAuth.mockReturnValue({
      logout,
      user: null,
      token: null,
      isAuthenticated: false,
      login: vi.fn(),
      register: vi.fn(),
      completeEmailVerification: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/verify-email-change?token=clean-me-up']}>
        <LocationProbe />
        <Routes>
          <Route path="/verify-email-change" element={<VerifyEmailChange />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('location-search').textContent).toBe('?token=clean-me-up');

    await screen.findByText('Email changed');
    await waitFor(() => expect(screen.getByTestId('location-search').textContent).toBe(''));
  });
});
