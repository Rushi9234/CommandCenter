import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ResetPassword from './ResetPassword';
import * as api from '../services/api';

vi.mock('../services/api');

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/forgot-password" element={<div>Forgot Password Page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('ResetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an invalid-link state when the token is missing', () => {
    renderAt('/reset-password');

    expect(screen.getByText('Invalid link')).toBeInTheDocument();
    expect(screen.getByText('Request a new link')).toBeInTheDocument();
  });

  it('renders a password form when a token is present', () => {
    renderAt('/reset-password?token=abc123');

    expect(screen.getByText('Set a new password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Minimum 8 characters')).toBeInTheDocument();
  });

  it('submits the new password and shows a success state with a link to /login (no auto-login)', async () => {
    vi.mocked(api.resetPassword).mockResolvedValue({} as any);
    renderAt('/reset-password?token=abc123');

    fireEvent.change(screen.getByPlaceholderText('Minimum 8 characters'), { target: { value: 'NewPassw0rd!' } });
    fireEvent.click(screen.getByText('Reset password'));

    await waitFor(() => expect(api.resetPassword).toHaveBeenCalledWith('abc123', 'NewPassw0rd!'));
    expect(await screen.findByText('Password reset')).toBeInTheDocument();
    expect(screen.getByText('Go to sign in')).toBeInTheDocument();
  });

  it('shows an error message when the reset request fails', async () => {
    vi.mocked(api.resetPassword).mockRejectedValue({ response: { data: { error: 'Invalid or expired reset token' } } });
    renderAt('/reset-password?token=abc123');

    fireEvent.change(screen.getByPlaceholderText('Minimum 8 characters'), { target: { value: 'NewPassw0rd!' } });
    fireEvent.click(screen.getByText('Reset password'));

    expect(await screen.findByText('Invalid or expired reset token')).toBeInTheDocument();
  });
});
