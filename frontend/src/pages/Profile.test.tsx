import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Profile from './Profile';
import * as api from '../services/api';
import { useAuth } from '../hooks/useAuth';

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../services/api', () => ({
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
  changePassword: vi.fn(),
  requestEmailChange: vi.fn(),
  resendEmailChangeVerification: vi.fn(),
  requestPhoneVerification: vi.fn(),
  resendPhoneVerification: vi.fn(),
  verifyPhone: vi.fn(),
  uploadAvatar: vi.fn(),
  setPresetAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
}));

const mockApi = api as any;
const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
const mockUpdateUser = vi.fn();

const mockProfile = {
  user_id: 'user-123',
  email: 'user@example.com',
  username: 'testuser',
  full_name: 'Test User',
  bio: 'My bio',
  pronouns: 'they/them',
  location: 'San Francisco, CA',
  is_profile_public: true,
  avatar_key: null,
  avatar_url: null,
  role: 'member',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-09-02T00:00:00Z',
  is_verified: true,
  pending_email: null,
  phone_number: null,
  phone_verified: false,
};

const renderProfile = () => {
  mockUseAuth.mockReturnValue({
    user: { user_id: 'user-123', full_name: 'Test User', username: 'testuser' },
    updateUser: mockUpdateUser,
    isAuthenticated: true,
    token: 'token-123',
  });

  return render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>
  );
};

const wrapped = (data: any) => ({ data: { success: true, data } });

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.getMyProfile.mockResolvedValue(wrapped(mockProfile));
  mockApi.updateMyProfile.mockResolvedValue(wrapped(mockProfile));
  mockApi.changePassword.mockResolvedValue({});
  mockApi.requestEmailChange.mockResolvedValue(wrapped({ pending_email: 'new@example.com' }));
  mockApi.resendEmailChangeVerification.mockResolvedValue(wrapped({ pending_email: 'new@example.com' }));
  mockApi.requestPhoneVerification.mockResolvedValue(wrapped({ phone_number: '+919876543210', phone_verified: false }));
  mockApi.resendPhoneVerification.mockResolvedValue(wrapped({ phone_number: '+919876543210' }));
  mockApi.verifyPhone.mockResolvedValue(wrapped({ phone_verified: true }));
  mockApi.uploadAvatar.mockResolvedValue(wrapped({ avatar_url: 'http://example.com/avatar.jpg', avatar_key: 'avatar.jpg' }));
  mockApi.setPresetAvatar.mockResolvedValue(wrapped({ avatar_url: 'http://example.com/avatar-preset.jpg', avatar_key: 'preset:people-alex' }));
  mockApi.deleteAvatar.mockResolvedValue({});
});

describe('Profile Page', () => {
  describe('Loading and Display', () => {
    it('loads profile data on mount', async () => {
      renderProfile();
      expect(screen.getByText('Loading profile...')).toBeInTheDocument();
      await waitFor(() => {
        expect(api.getMyProfile).toHaveBeenCalledTimes(1);
      });
    });

    it('displays profile data after loading', async () => {
      renderProfile();
      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });
      expect(screen.getAllByText('My bio')[0]).toBeInTheDocument();
      expect(screen.getAllByText('they/them')[0]).toBeInTheDocument();
      expect(screen.getAllByText('San Francisco, CA')[0]).toBeInTheDocument();
    });
  });

  describe('Change Password & Security Pass', () => {
    it('opens Change Password section with ALL fields 100% EMPTY', async () => {
      renderProfile();
      await screen.findByText('user@example.com');

      fireEvent.click(screen.getByRole('button', { name: /Change Password/i }));

      const currentPass = await screen.findByLabelText(/Current Password \*/i) as HTMLInputElement;
      const newPass = screen.getByLabelText(/^New Password \*/i) as HTMLInputElement;
      const confirmPass = screen.getByLabelText(/Confirm New Password \*/i) as HTMLInputElement;

      expect(currentPass.value).toBe('');
      expect(newPass.value).toBe('');
      expect(confirmPass.value).toBe('');
    });

    it('validates password mismatch and shows toast error', async () => {
      renderProfile();
      await screen.findByText('user@example.com');

      fireEvent.click(screen.getByRole('button', { name: /Change Password/i }));

      fireEvent.change(screen.getByLabelText(/Current Password \*/i), { target: { value: 'oldpass123' } });
      fireEvent.change(screen.getByLabelText(/^New Password \*/i), { target: { value: 'newpass123' } });
      fireEvent.change(screen.getByLabelText(/Confirm New Password \*/i), { target: { value: 'mismatch123' } });

      fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

      expect(await screen.findByText('New passwords do not match')).toBeInTheDocument();
      expect(api.changePassword).not.toHaveBeenCalled();
    });

    it('successfully changes password, shows success toast, and clears password fields', async () => {
      renderProfile();
      await screen.findByText('user@example.com');

      fireEvent.click(screen.getByRole('button', { name: /Change Password/i }));

      fireEvent.change(screen.getByLabelText(/Current Password \*/i), { target: { value: 'oldpass123' } });
      fireEvent.change(screen.getByLabelText(/^New Password \*/i), { target: { value: 'newpass123' } });
      fireEvent.change(screen.getByLabelText(/Confirm New Password \*/i), { target: { value: 'newpass123' } });

      fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

      await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith('oldpass123', 'newpass123'));
      expect(await screen.findByText('Password changed successfully!')).toBeInTheDocument();
      expect(screen.queryByLabelText(/Current Password \*/i)).not.toBeInTheDocument();
    });

    it('handles wrong current password with toast error', async () => {
      mockApi.changePassword.mockRejectedValue({ response: { data: { error: 'Current password is incorrect' } } });
      renderProfile();
      await screen.findByText('user@example.com');

      fireEvent.click(screen.getByRole('button', { name: /Change Password/i }));

      fireEvent.change(screen.getByLabelText(/Current Password \*/i), { target: { value: 'wrongpass' } });
      fireEvent.change(screen.getByLabelText(/^New Password \*/i), { target: { value: 'newpass123' } });
      fireEvent.change(screen.getByLabelText(/Confirm New Password \*/i), { target: { value: 'newpass123' } });

      fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

      expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
    });
  });

  describe('Avatar Crop, Upload & Presets', () => {
    it('validates file type and shows toast error for non-image files', async () => {
      renderProfile();
      await screen.findByText('user@example.com');

      const fileInput = screen.getByLabelText('Upload Avatar Input') as HTMLInputElement;
      const file = new File(['text'], 'doc.pdf', { type: 'application/pdf' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(await screen.findByText('Only JPG, PNG, and WebP images are supported')).toBeInTheDocument();
    });

    it('opens preset avatar gallery and saves selected preset avatar', async () => {
      renderProfile();
      await screen.findByText('user@example.com');

      fireEvent.click(screen.getByRole('button', { name: '🎨 Choose Avatar' }));

      expect(await screen.findByText('Select an avatar or upload a custom photo for CommandCenter')).toBeInTheDocument();
      expect(screen.getAllByText('Alex (Tech)')[0]).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Save Avatar' }));

      await waitFor(() => expect(api.setPresetAvatar).toHaveBeenCalledWith('people-alex'));
      expect(mockUpdateUser).toHaveBeenCalledWith({
        avatar_url: 'http://example.com/avatar-preset.jpg',
        avatar_key: 'preset:people-alex',
      });
      expect(await screen.findByText('Avatar updated successfully!')).toBeInTheDocument();
    });

    it('deletes avatar and updates global auth context', async () => {
      mockApi.getMyProfile.mockResolvedValue(wrapped({ ...mockProfile, avatar_url: 'http://example.com/avatar.jpg' }));
      renderProfile();
      await screen.findByText('user@example.com');

      fireEvent.click(screen.getByRole('button', { name: 'Remove Photo' }));

      await waitFor(() => expect(api.deleteAvatar).toHaveBeenCalled());
      expect(mockUpdateUser).toHaveBeenCalledWith({ avatar_url: undefined, avatar_key: undefined });
      expect(await screen.findByText('Avatar removed')).toBeInTheDocument();
    });
  });
});
