import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VerifyEmail from './VerifyEmail';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

// Milestone 55: mocks the two external dependencies this page has beyond
// React Router itself (useAuth, services/api) -- same pattern every other
// page test in this project already uses.
vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../services/api');

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const renderAt = (path: string) => {
  const completeEmailVerification = vi.fn();
  mockUseAuth.mockReturnValue({
    completeEmailVerification,
    user: null,
    token: null,
    isAuthenticated: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  });
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/pulse" element={<div>Pulse Page</div>} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
  return { ...result, completeEmailVerification };
};

describe('VerifyEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.resendVerification).mockResolvedValue({} as any);
  });

  it('shows an invalid-link state and makes no API call when the token is missing', () => {
    const { completeEmailVerification } = renderAt('/verify-email');

    expect(screen.getByText('Invalid link')).toBeInTheDocument();
    expect(completeEmailVerification).not.toHaveBeenCalled();
  });

  it('shows a loading state while verification is in flight', () => {
    mockUseAuth.mockReturnValue({
      completeEmailVerification: vi.fn(() => new Promise(() => {})),
      user: null,
      token: null,
      isAuthenticated: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={['/verify-email?token=abc123']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Verifying your email...')).toBeInTheDocument();
  });

  it('verifies successfully and redirects to /pulse', async () => {
    const completeEmailVerification = vi.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      completeEmailVerification,
      user: null,
      token: null,
      isAuthenticated: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={['/verify-email?token=valid-token']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/pulse" element={<div>Pulse Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(completeEmailVerification).toHaveBeenCalledWith('valid-token'));
    expect(await screen.findByText('Pulse Page')).toBeInTheDocument();
  });

  it('shows an error state for an invalid/expired/already-used token', async () => {
    const completeEmailVerification = vi.fn().mockRejectedValue({ response: { data: { error: 'Invalid or expired verification token' } } });
    mockUseAuth.mockReturnValue({
      completeEmailVerification,
      user: null,
      token: null,
      isAuthenticated: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={['/verify-email?token=bad-token']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Verification failed')).toBeInTheDocument();
    expect(screen.getByText('Invalid or expired verification token')).toBeInTheDocument();
  });

  it('offers a resend-verification form on the error state', async () => {
    const completeEmailVerification = vi.fn().mockRejectedValue({ response: { data: { error: 'Invalid or expired verification token' } } });
    mockUseAuth.mockReturnValue({
      completeEmailVerification,
      user: null,
      token: null,
      isAuthenticated: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={['/verify-email?token=bad-token']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('Verification failed');

    fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'me@test.local' } });
    fireEvent.click(screen.getByText('Resend verification email'));

    await waitFor(() => expect(api.resendVerification).toHaveBeenCalledWith('me@test.local'));
    expect(await screen.findByText(/a new verification link has been sent/)).toBeInTheDocument();
  });
});
