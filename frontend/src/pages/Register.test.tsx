import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Register from './Register';
import { useAuth } from '../hooks/useAuth';

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const fillForm = () => {
  fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'Ada Lovelace' } });
  fireEvent.change(screen.getByPlaceholderText('johndoe'), { target: { value: 'ada' } });
  fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'ada@test.local' } });
  fireEvent.change(screen.getByPlaceholderText('Minimum 6 characters'), { target: { value: 'Passw0rd!123' } });
};

const renderRegister = (register: ReturnType<typeof vi.fn>) => {
  mockUseAuth.mockReturnValue({ register, user: null, token: null, isAuthenticated: false, login: vi.fn(), logout: vi.fn(), completeEmailVerification: vi.fn() });
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/pulse" element={<div>Pulse Page</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Milestone 55: register() never returns a session -- these two cases
  // (auto-verified vs. verification-pending) are the exact defect this
  // milestone fixed; both must be exercised, not just the happy path.
  it('navigates to /pulse when registration returns an auto-verified (session-established) result', async () => {
    const register = vi.fn().mockResolvedValue({ email: 'ada@test.local', username: 'ada', is_verified: true });
    renderRegister(register);
    fillForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(await screen.findByText('Pulse Page')).toBeInTheDocument();
  });

  it('shows a "check your email" state, and does not navigate, when verification is pending', async () => {
    const register = vi.fn().mockResolvedValue({ email: 'ada@test.local', username: 'ada', is_verified: false });
    renderRegister(register);
    fillForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText('ada@test.local')).toBeInTheDocument();
    expect(screen.queryByText('Pulse Page')).not.toBeInTheDocument();
  });

  it('shows an error message when registration fails', async () => {
    const register = vi.fn().mockRejectedValue({ response: { data: { error: 'Email or username already exists' } } });
    renderRegister(register);
    fillForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(await screen.findByText('Email or username already exists')).toBeInTheDocument();
  });
});
