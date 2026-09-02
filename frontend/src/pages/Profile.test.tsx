import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Profile from './Profile';
import * as api from '../services/api';

vi.mock('../services/api');

const mockApi = api as any;

const mockProfile = {
  user_id: 'user-123',
  email: 'user@example.com',
  username: 'testuser',
  full_name: 'Test User',
  bio: 'My bio',
  pronouns: 'they/them',
  location: 'San Francisco, CA',
  is_profile_public: true,
  role: 'member',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-09-02T00:00:00Z',
};

const renderProfile = () => {
  return render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.getMyProfile.mockResolvedValue({ data: mockProfile });
  mockApi.updateMyProfile.mockResolvedValue({ data: mockProfile });
  mockApi.changePassword.mockResolvedValue({});
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

      expect(screen.getByText('My bio')).toBeInTheDocument();
      expect(screen.getByText('they/them')).toBeInTheDocument();
      expect(screen.getByText('San Francisco, CA')).toBeInTheDocument();
    });

    it('displays avatar initials', async () => {
      renderProfile();

      await waitFor(() => {
        const initials = screen.getByText('TU');
        expect(initials).toBeInTheDocument();
      });
    });

    it('shows "No bio" when bio is empty', async () => {
      (api.getMyProfile as any).mockResolvedValue({
        data: { ...mockProfile, bio: null },
      });

      renderProfile();

      await waitFor(() => {
        expect(screen.getByText(/No bio/)).toBeInTheDocument();
      });
    });

    it('shows "Not set" for empty optional fields', async () => {
      (api.getMyProfile as any).mockResolvedValue({
        data: { ...mockProfile, pronouns: null, location: null },
      });

      renderProfile();

      await waitFor(() => {
        const notSetElements = screen.getAllByText(/Not set/);
        expect(notSetElements.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Edit Mode', () => {
    it('enters edit mode when Edit Profile button is clicked', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: /Edit Profile/i });
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test User')).toBeInTheDocument();
      });
    });

    it('displays form inputs in edit mode', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit Profile/i }));

      await waitFor(() => {
        const inputs = screen.getAllByDisplayValue(/Test User|My bio|they\/them|San Francisco/);
        expect(inputs.length).toBeGreaterThan(0);
      });
    });

    it('allows editing profile fields', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit Profile/i }));

      const fullNameInput = screen.getByDisplayValue('Test User') as HTMLInputElement;
      fireEvent.change(fullNameInput, { target: { value: 'New Name' } });

      expect(fullNameInput.value).toBe('New Name');
    });

    it('cancel button exits edit mode without saving', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit Profile/i }));

      const fullNameInput = screen.getByDisplayValue('Test User') as HTMLInputElement;
      fireEvent.change(fullNameInput, { target: { value: 'Hacked Name' } });

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByDisplayValue('Hacked Name')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Edit Profile/i })).toBeInTheDocument();
      });
    });
  });

  describe('Saving', () => {
    it('saves profile changes when Save Changes is clicked', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit Profile/i }));

      const fullNameInput = screen.getByDisplayValue('Test User') as HTMLInputElement;
      fireEvent.change(fullNameInput, { target: { value: 'New Name' } });

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(api.updateMyProfile).toHaveBeenCalledWith(
          expect.objectContaining({
            full_name: 'New Name',
          })
        );
      });
    });

    it('shows loading state while saving', async () => {
      let resolveUpdate: any;
      (api.updateMyProfile as any).mockReturnValue(
        new Promise((resolve) => {
          resolveUpdate = resolve;
        })
      );

      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit Profile/i }));

      const fullNameInput = screen.getByDisplayValue('Test User') as HTMLInputElement;
      fireEvent.change(fullNameInput, { target: { value: 'New Name' } });

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Saving.../ })).toBeDisabled();
      });

      resolveUpdate({ data: { ...mockProfile, full_name: 'New Name' } });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit Profile/i })).toBeInTheDocument();
      });
    });

    it('shows success message after saving', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit Profile/i }));

      const fullNameInput = screen.getByDisplayValue('Test User') as HTMLInputElement;
      fireEvent.change(fullNameInput, { target: { value: 'New Name' } });

      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(screen.getByText('Profile updated successfully!')).toBeInTheDocument();
      });
    });

    it('exits edit mode after successful save', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit Profile/i }));

      const fullNameInput = screen.getByDisplayValue('Test User') as HTMLInputElement;
      fireEvent.change(fullNameInput, { target: { value: 'New Name' } });

      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit Profile/i })).toBeInTheDocument();
      });
    });

    it('does not send update if no fields changed', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit Profile/i }));

      const saveButton = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit Profile/i })).toBeInTheDocument();
      });

      expect(api.updateMyProfile).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('displays error when profile load fails', async () => {
      (api.getMyProfile as any).mockRejectedValue({
        response: { data: { error: 'Failed to load profile' } },
      });

      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('Failed to load profile')).toBeInTheDocument();
      });
    });

    it('displays error when save fails', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit Profile/i }));

      (api.updateMyProfile as any).mockRejectedValue({
        response: { data: { error: 'Save failed' } },
      });

      const fullNameInput = screen.getByDisplayValue('Test User') as HTMLInputElement;
      fireEvent.change(fullNameInput, { target: { value: 'New Name' } });

      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(screen.getByText('Save failed')).toBeInTheDocument();
      });
    });

    it('shows retry button on load error', async () => {
      (api.getMyProfile as any).mockRejectedValue({
        response: { data: { error: 'Failed to load' } },
      });

      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      (api.getMyProfile as any).mockResolvedValue({ data: mockProfile });
      fireEvent.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(api.getMyProfile).toHaveBeenCalledTimes(2);
      });
    });

    it('preserves form state when save fails', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit Profile/i }));

      const fullNameInput = screen.getByDisplayValue('Test User') as HTMLInputElement;
      fireEvent.change(fullNameInput, { target: { value: 'New Name' } });

      (api.updateMyProfile as any).mockRejectedValue({
        response: { data: { error: 'Save failed' } },
      });

      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(screen.getByDisplayValue('New Name')).toBeInTheDocument();
      });
    });
  });

  describe('Profile Visibility', () => {
    it('displays profile visibility checkbox', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      const checkbox = screen.getByRole('checkbox', {
        name: /Make my profile visible to teammates/i,
      }) as HTMLInputElement;

      expect(checkbox).toBeInTheDocument();
      expect(checkbox.checked).toBe(true);
    });

    it('toggles profile visibility in edit mode', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit Profile/i }));

      const checkbox = screen.getByRole('checkbox', {
        name: /Make my profile visible to teammates/i,
      }) as HTMLInputElement;

      fireEvent.click(checkbox);

      expect(checkbox.checked).toBe(false);
    });

    it('sends visibility flag when saving', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit Profile/i }));

      const checkbox = screen.getByRole('checkbox', {
        name: /Make my profile visible to teammates/i,
      }) as HTMLInputElement;

      fireEvent.click(checkbox);

      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(api.updateMyProfile).toHaveBeenCalledWith(
          expect.objectContaining({
            is_profile_public: false,
          })
        );
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper form labels', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit Profile/i }));

      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Bio/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Pronouns/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Location/i)).toBeInTheDocument();
    });
  });

  describe('Change Password', () => {
    it('shows change password button in security section', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Change Password/i })).toBeInTheDocument();
    });

    it('enters change password mode when button is clicked', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change Password/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/Current Password/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^New Password$/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Confirm New Password/i)).toBeInTheDocument();
      });
    });

    it('changes password when form is submitted', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change Password/i }));

      const currentPassInput = screen.getByLabelText(/Current Password/i) as HTMLInputElement;
      const newPassInput = screen.getByLabelText(/^New Password$/i) as HTMLInputElement;
      const confirmPassInput = screen.getByLabelText(/Confirm New Password/i) as HTMLInputElement;

      fireEvent.change(currentPassInput, { target: { value: 'oldpassword123' } });
      fireEvent.change(newPassInput, { target: { value: 'newpassword456' } });
      fireEvent.change(confirmPassInput, { target: { value: 'newpassword456' } });

      fireEvent.click(screen.getByRole('button', { name: /^Change Password$/i }));

      await waitFor(() => {
        expect(mockApi.changePassword).toHaveBeenCalledWith('oldpassword123', 'newpassword456');
      });
    });

    it('shows error when passwords do not match', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change Password/i }));

      const currentPassInput = screen.getByLabelText(/Current Password/i) as HTMLInputElement;
      const newPassInput = screen.getByLabelText(/^New Password$/i) as HTMLInputElement;
      const confirmPassInput = screen.getByLabelText(/Confirm New Password/i) as HTMLInputElement;

      fireEvent.change(currentPassInput, { target: { value: 'oldpassword123' } });
      fireEvent.change(newPassInput, { target: { value: 'newpassword456' } });
      fireEvent.change(confirmPassInput, { target: { value: 'differentpassword' } });

      fireEvent.click(screen.getByRole('button', { name: /^Change Password$/i }));

      await waitFor(() => {
        expect(screen.getByText('New passwords do not match')).toBeInTheDocument();
      });

      expect(mockApi.changePassword).not.toHaveBeenCalled();
    });

    it('shows error when new password is too short', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change Password/i }));

      const currentPassInput = screen.getByLabelText(/Current Password/i) as HTMLInputElement;
      const newPassInput = screen.getByLabelText(/^New Password$/i) as HTMLInputElement;
      const confirmPassInput = screen.getByLabelText(/Confirm New Password/i) as HTMLInputElement;

      fireEvent.change(currentPassInput, { target: { value: 'oldpassword123' } });
      fireEvent.change(newPassInput, { target: { value: 'short' } });
      fireEvent.change(confirmPassInput, { target: { value: 'short' } });

      fireEvent.click(screen.getByRole('button', { name: /^Change Password$/i }));

      await waitFor(() => {
        expect(screen.getByText('New password must be at least 8 characters')).toBeInTheDocument();
      });

      expect(mockApi.changePassword).not.toHaveBeenCalled();
    });

    it('shows success message after successful password change', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change Password/i }));

      const currentPassInput = screen.getByLabelText(/Current Password/i) as HTMLInputElement;
      const newPassInput = screen.getByLabelText(/^New Password$/i) as HTMLInputElement;
      const confirmPassInput = screen.getByLabelText(/Confirm New Password/i) as HTMLInputElement;

      fireEvent.change(currentPassInput, { target: { value: 'oldpassword123' } });
      fireEvent.change(newPassInput, { target: { value: 'newpassword456' } });
      fireEvent.change(confirmPassInput, { target: { value: 'newpassword456' } });

      fireEvent.click(screen.getByRole('button', { name: /^Change Password$/i }));

      await waitFor(() => {
        expect(screen.getByText('Password changed successfully!')).toBeInTheDocument();
      });
    });

    it('clears password fields and exits change password mode after success', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change Password/i }));

      const currentPassInput = screen.getByLabelText(/Current Password/i) as HTMLInputElement;
      const newPassInput = screen.getByLabelText(/^New Password$/i) as HTMLInputElement;
      const confirmPassInput = screen.getByLabelText(/Confirm New Password/i) as HTMLInputElement;

      fireEvent.change(currentPassInput, { target: { value: 'oldpassword123' } });
      fireEvent.change(newPassInput, { target: { value: 'newpassword456' } });
      fireEvent.change(confirmPassInput, { target: { value: 'newpassword456' } });

      fireEvent.click(screen.getByRole('button', { name: /^Change Password$/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Change Password/i })).toBeInTheDocument();
      });
    });

    it('shows server error when password change fails', async () => {
      mockApi.changePassword.mockRejectedValue({
        response: { data: { error: 'Current password is incorrect' } },
      });

      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change Password/i }));

      const currentPassInput = screen.getByLabelText(/Current Password/i) as HTMLInputElement;
      const newPassInput = screen.getByLabelText(/^New Password$/i) as HTMLInputElement;
      const confirmPassInput = screen.getByLabelText(/Confirm New Password/i) as HTMLInputElement;

      fireEvent.change(currentPassInput, { target: { value: 'wrongpassword' } });
      fireEvent.change(newPassInput, { target: { value: 'newpassword456' } });
      fireEvent.change(confirmPassInput, { target: { value: 'newpassword456' } });

      fireEvent.click(screen.getByRole('button', { name: /^Change Password$/i }));

      await waitFor(() => {
        expect(screen.getByText('Current password is incorrect')).toBeInTheDocument();
      });
    });

    it('cancel button exits change password mode', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change Password/i }));

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Change Password/i })).toBeInTheDocument();
      });
    });
  });
});
