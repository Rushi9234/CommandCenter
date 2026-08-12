import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ForgotPassword from './ForgotPassword';
import * as api from '../services/api';

vi.mock('../services/api');

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('ForgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits the email and shows the generic success message', async () => {
    vi.mocked(api.forgotPassword).mockResolvedValue({} as any);
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'me@test.local' } });
    fireEvent.click(screen.getByText('Send reset link'));

    await waitFor(() => expect(api.forgotPassword).toHaveBeenCalledWith('me@test.local'));
    expect(await screen.findByText('If that email is registered, a reset link has been sent.')).toBeInTheDocument();
  });

  it('shows an error message on API failure', async () => {
    vi.mocked(api.forgotPassword).mockRejectedValue({ response: { data: { error: 'Something broke' } } });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('you@company.com'), { target: { value: 'me@test.local' } });
    fireEvent.click(screen.getByText('Send reset link'));

    expect(await screen.findByText('Something broke')).toBeInTheDocument();
  });
});
