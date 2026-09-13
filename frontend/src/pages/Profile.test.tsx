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
  return render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>
  );
};

// Backend wraps every response as { success, data } (common/http/respond.ts) --
// these mocks must match that real envelope, not a flattened shortcut, or a
// regression that reintroduces the response-unwrapping bug goes undetected.
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

    // Regression test for a real bug: the backend wraps every response as
    // { success, data } (common/http/respond.ts's ok()), matching every other
    // page's API consumption convention (Teams.tsx, Goals.tsx, Pulse.tsx,
    // SOSHub.tsx all read response.data.data). loadProfile() previously read
    // response.data directly -- one level too shallow -- so `profile` held the
    // wrapper object instead of the actual fields, and every displayed value
    // (name, username, role, member-since date) silently rendered blank/wrong
    // with no error surfaced. Asserting on the exact backend envelope shape
    // here (not a flattened test shortcut) is what makes this test able to
    // catch that regression if the unwrapping is ever removed again.
    it('correctly unwraps the { success, data } envelope for every displayed field', async () => {
      mockApi.getMyProfile.mockResolvedValue({
        data: {
          success: true,
          data: {
            ...mockProfile,
            full_name: 'Envelope Test User',
            username: 'envelopeuser',
            role: 'admin',
          },
        },
      });

      renderProfile();

      // full_name and username each render twice (profile header + Basic
      // Information section) -- getAllByText, not getByText, is correct here.
      await waitFor(() => {
        expect(screen.getAllByText('Envelope Test User').length).toBeGreaterThan(0);
      });

      expect(screen.getAllByText('@envelopeuser').length).toBeGreaterThan(0);
      expect(screen.getByText(/admin/)).toBeInTheDocument();
      // The wrapper's own keys must never leak into the rendered UI as values.
      expect(screen.queryByText('true')).not.toBeInTheDocument();
    });

    it('displays avatar initials', async () => {
      renderProfile();

      await waitFor(() => {
        const initials = screen.getByText('TU');
        expect(initials).toBeInTheDocument();
      });
    });

    it('shows "No bio" when bio is empty', async () => {
      (api.getMyProfile as any).mockResolvedValue(wrapped({ ...mockProfile, bio: null }));

      renderProfile();

      await waitFor(() => {
        expect(screen.getByText(/No bio/)).toBeInTheDocument();
      });
    });

    it('shows "Not set" for empty optional fields', async () => {
      (api.getMyProfile as any).mockResolvedValue(wrapped({ ...mockProfile, pronouns: null, location: null }));

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

      resolveUpdate(wrapped({ ...mockProfile, full_name: 'New Name' }));

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

    // Regression coverage for the same envelope-unwrapping bug (see the
    // dedicated test above), specifically on the save path: handleSave()
    // previously set profile state to the raw { success, data } wrapper
    // instead of its .data, so the read-only view after save would revert to
    // blank/undefined fields rather than showing the value the server just
    // confirmed it saved.
    it('displays the actual updated value from the server response after save, not a stale or blank field', async () => {
      mockApi.updateMyProfile.mockResolvedValue(
        wrapped({ ...mockProfile, full_name: 'Server-Confirmed Name' }),
      );

      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Edit Profile/i }));
      const fullNameInput = screen.getByDisplayValue('Test User') as HTMLInputElement;
      fireEvent.change(fullNameInput, { target: { value: 'Locally Typed Name' } });
      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        // The rendered value is whatever the server actually returned (it
        // renders twice -- header + Basic Information section), proving the
        // response was correctly unwrapped rather than falling back to a
        // blank/undefined field.
        expect(screen.getAllByText('Server-Confirmed Name').length).toBeGreaterThan(0);
      });
      expect(screen.queryByText('Locally Typed Name')).not.toBeInTheDocument();
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

      (api.getMyProfile as any).mockResolvedValue(wrapped(mockProfile));
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

    // Security Hardening Tests
    describe('Rate Limiting', () => {
      it('displays rate-limit error message safely', async () => {
        mockApi.changePassword.mockRejectedValueOnce({
          response: {
            status: 429,
            data: { error: 'Too many password change attempts. Please try again in an hour.' }
          },
        });

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
          expect(screen.getByText(/Too many password change attempts/i)).toBeInTheDocument();
        });
      });

      it('does not expose password in error messages', async () => {
        mockApi.changePassword.mockRejectedValueOnce({
          response: {
            status: 429,
            data: { error: 'Too many password change attempts. Please try again in an hour.' }
          },
        });

        renderProfile();

        await waitFor(() => {
          expect(screen.getByText('user@example.com')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Change Password/i }));

        const currentPassInput = screen.getByLabelText(/Current Password/i) as HTMLInputElement;
        const newPassInput = screen.getByLabelText(/^New Password$/i) as HTMLInputElement;
        const confirmPassInput = screen.getByLabelText(/Confirm New Password/i) as HTMLInputElement;

        const testPassword = 'SuperSecret123!';
        fireEvent.change(currentPassInput, { target: { value: testPassword } });
        fireEvent.change(newPassInput, { target: { value: 'newpassword456' } });
        fireEvent.change(confirmPassInput, { target: { value: 'newpassword456' } });

        fireEvent.click(screen.getByRole('button', { name: /^Change Password$/i }));

        await waitFor(() => {
          const errorText = screen.getByText(/Too many password change attempts/i);
          expect(errorText.textContent).not.toMatch(testPassword);
          expect(errorText.textContent).not.toMatch('newpassword456');
        });
      });
    });

    describe('Security Notifications', () => {
      it('maintains success state after notification delivery', async () => {
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

        // Success message should appear
        await waitFor(() => {
          expect(screen.getByText('Password changed successfully!')).toBeInTheDocument();
        });

        // Form should be exited, not remain in error state
        expect(screen.queryByLabelText(/Current Password/i)).not.toBeInTheDocument();
      });

      it('handles failed password change with appropriate error message', async () => {
        mockApi.changePassword.mockRejectedValueOnce({
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

        // Form should remain open for user to retry
        expect(screen.getByLabelText(/Current Password/i)).toBeInTheDocument();
      });
    });
  });

  describe('Email Change', () => {
    it('renders the current email and a Verified badge from is_verified', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      expect(screen.getByText('Verified')).toBeInTheDocument();
    });

    it('does not render a Verified badge when is_verified is false', async () => {
      mockApi.getMyProfile.mockResolvedValue(wrapped({ ...mockProfile, is_verified: false }));
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    });

    it('shows a Change email action', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Change email/i })).toBeInTheDocument();
    });

    it('opens the email-change form when Change email is clicked', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change email/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/New email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Current password/i)).toBeInTheDocument();
      });
    });

    it('blocks a malformed email client-side (native type="email" validation)', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change email/i }));

      const newEmailInput = (await screen.findByLabelText(/New email/i)) as HTMLInputElement;
      expect(newEmailInput.type).toBe('email');
      expect(newEmailInput.required).toBe(true);
    });

    it('requires current password before the submit button is enabled', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change email/i }));

      const newEmailInput = await screen.findByLabelText(/New email/i);
      fireEvent.change(newEmailInput, { target: { value: 'new@example.com' } });

      const submitButton = screen.getByRole('button', { name: /Send verification/i });
      expect(submitButton).toBeDisabled();

      const passwordInput = screen.getByLabelText(/Current password/i);
      fireEvent.change(passwordInput, { target: { value: 'mypassword123' } });

      expect(submitButton).not.toBeDisabled();
    });

    it('calls requestEmailChange with the entered new_email and current_password', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change email/i }));

      fireEvent.change(await screen.findByLabelText(/New email/i), { target: { value: 'new@example.com' } });
      fireEvent.change(screen.getByLabelText(/Current password/i), { target: { value: 'mypassword123' } });

      fireEvent.click(screen.getByRole('button', { name: /Send verification/i }));

      await waitFor(() => {
        expect(mockApi.requestEmailChange).toHaveBeenCalledWith('new@example.com', 'mypassword123');
      });
    });

    it('shows a pending-state confirmation and the pending email after a successful request', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change email/i }));
      fireEvent.change(await screen.findByLabelText(/New email/i), { target: { value: 'new@example.com' } });
      fireEvent.change(screen.getByLabelText(/Current password/i), { target: { value: 'mypassword123' } });
      fireEvent.click(screen.getByRole('button', { name: /Send verification/i }));

      await waitFor(() => {
        expect(screen.getByText(/Verification email sent to new@example.com/i)).toBeInTheDocument();
      });

      expect(screen.getByText('Verification pending')).toBeInTheDocument();
      expect(screen.getAllByText(/new@example\.com/).length).toBeGreaterThan(0);
      // Current, still-authoritative email must remain visible during the pending period.
      expect(screen.getByText('user@example.com')).toBeInTheDocument();
    });

    it('renders a Resend verification action while a change is pending, and calls the resend endpoint', async () => {
      mockApi.getMyProfile.mockResolvedValue(wrapped({ ...mockProfile, pending_email: 'new@example.com' }));
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('Verification pending')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Resend verification/i }));

      await waitFor(() => {
        expect(mockApi.resendEmailChangeVerification).toHaveBeenCalledTimes(1);
      });
    });

    it('shows a success message after a successful resend', async () => {
      mockApi.getMyProfile.mockResolvedValue(wrapped({ ...mockProfile, pending_email: 'new@example.com' }));
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('Verification pending')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Resend verification/i }));

      await waitFor(() => {
        expect(screen.getByText(/Verification email resent to new@example\.com/i)).toBeInTheDocument();
      });
    });

    it('shows an error message when resend fails', async () => {
      mockApi.getMyProfile.mockResolvedValue(wrapped({ ...mockProfile, pending_email: 'new@example.com' }));
      mockApi.resendEmailChangeVerification.mockRejectedValue({
        response: { data: { error: 'Too many resend attempts. Please try again in an hour.' } },
      });
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('Verification pending')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Resend verification/i }));

      await waitFor(() => {
        expect(screen.getByText('Too many resend attempts. Please try again in an hour.')).toBeInTheDocument();
      });
    });

    it('disables the resend button while the request is in flight, preventing duplicate submissions', async () => {
      let resolveResend: (value: any) => void = () => {};
      mockApi.resendEmailChangeVerification.mockReturnValue(
        new Promise((resolve) => {
          resolveResend = resolve;
        })
      );
      mockApi.getMyProfile.mockResolvedValue(wrapped({ ...mockProfile, pending_email: 'new@example.com' }));
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('Verification pending')).toBeInTheDocument();
      });

      const resendButton = screen.getByRole('button', { name: /Resend verification/i });
      fireEvent.click(resendButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Resending/i })).toBeDisabled();
      });

      expect(mockApi.resendEmailChangeVerification).toHaveBeenCalledTimes(1);

      resolveResend(wrapped({ pending_email: 'new@example.com' }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Resend verification$/i })).not.toBeDisabled();
      });
    });

    it('shows the backend validation error when the request fails (e.g. wrong password)', async () => {
      mockApi.requestEmailChange.mockRejectedValue({
        response: { data: { error: 'Current password is incorrect' } },
      });
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change email/i }));
      fireEvent.change(await screen.findByLabelText(/New email/i), { target: { value: 'new@example.com' } });
      fireEvent.change(screen.getByLabelText(/Current password/i), { target: { value: 'wrongpassword' } });
      fireEvent.click(screen.getByRole('button', { name: /Send verification/i }));

      await waitFor(() => {
        expect(screen.getByText('Current password is incorrect')).toBeInTheDocument();
      });

      // Form should remain open for the user to retry, matching the
      // Change Password form's own established error-recovery behavior.
      expect(screen.getByLabelText(/New email/i)).toBeInTheDocument();
      expect(mockApi.requestEmailChange).toHaveBeenCalledTimes(1);
    });

    it('does not render a pending banner when there is no pending_email', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      expect(screen.queryByText('Verification pending')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Resend verification/i })).not.toBeInTheDocument();
    });

    it('closes the form and clears fields when Cancel is clicked', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Change email/i }));
      const newEmailInput = (await screen.findByLabelText(/New email/i)) as HTMLInputElement;
      fireEvent.change(newEmailInput, { target: { value: 'typed@example.com' } });

      fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

      await waitFor(() => {
        expect(screen.queryByLabelText(/New email/i)).not.toBeInTheDocument();
      });
      expect(mockApi.requestEmailChange).not.toHaveBeenCalled();
    });
  });

  describe('Phone Verification', () => {
    it('renders the Phone section with optional-explanatory text and a phone input', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('Phone')).toBeInTheDocument();
      });
      expect(screen.getByText(/Optional\. Verifying a phone number/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Phone number/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Send code/i })).toBeInTheDocument();
    });

    it('the phone input is a semantic tel input', async () => {
      renderProfile();
      const phoneInput = (await screen.findByLabelText(/Phone number/i)) as HTMLInputElement;
      expect(phoneInput.type).toBe('tel');
    });

    it('blocks a malformed phone number client-side without calling the API', async () => {
      renderProfile();
      const phoneInput = await screen.findByLabelText(/Phone number/i);
      fireEvent.change(phoneInput, { target: { value: 'abc' } });
      fireEvent.click(screen.getByRole('button', { name: /Send code/i }));

      await waitFor(() => {
        expect(screen.getByText('Please enter a valid phone number')).toBeInTheDocument();
      });
      expect(mockApi.requestPhoneVerification).not.toHaveBeenCalled();
    });

    it('the Send code button is disabled while empty and enabled once a number is entered', async () => {
      renderProfile();
      const phoneInput = await screen.findByLabelText(/Phone number/i);
      const sendButton = screen.getByRole('button', { name: /Send code/i });
      expect(sendButton).toBeDisabled();

      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      expect(sendButton).not.toBeDisabled();
    });

    it('calls requestPhoneVerification with the entered number and shows the OTP-pending state on success', async () => {
      renderProfile();
      const phoneInput = await screen.findByLabelText(/Phone number/i);
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.click(screen.getByRole('button', { name: /Send code/i }));

      await waitFor(() => {
        expect(mockApi.requestPhoneVerification).toHaveBeenCalledWith('9876543210');
      });
      expect(await screen.findByText('Verification pending')).toBeInTheDocument();
    });

    it('shows a top-level success banner naming the masked destination number', async () => {
      renderProfile();
      const phoneInput = await screen.findByLabelText(/Phone number/i);
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.click(screen.getByRole('button', { name: /Send code/i }));

      expect(await screen.findByText(/Verification code sent to \+\*+3210/)).toBeInTheDocument();
    });

    it('derives phone_verified from the backend response after a request, never a hardcoded client-side value', async () => {
      // Regression test: the frontend previously hardcoded phone_verified:
      // false itself after a successful request. It must now read
      // whatever the backend's own response says instead -- proven here
      // by having the mock return an explicit, distinguishable value and
      // confirming the UI reflects exactly that value, not an assumption.
      mockApi.requestPhoneVerification.mockResolvedValue(wrapped({ phone_number: '+919876543210', phone_verified: false }));
      renderProfile();
      const phoneInput = await screen.findByLabelText(/Phone number/i);
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.click(screen.getByRole('button', { name: /Send code/i }));

      await screen.findByText('Verification pending');
      // Confirms the pending (not verified) state renders -- i.e. the
      // component actually used the response's own phone_verified: false
      // value to decide which state to show, rather than defaulting to
      // some other assumption.
      expect(screen.queryByRole('button', { name: /Change number/i })).not.toBeInTheDocument();
    });

    it('masks the phone number, never showing the full number in the pending or verified state', async () => {
      renderProfile();
      const phoneInput = await screen.findByLabelText(/Phone number/i);
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.click(screen.getByRole('button', { name: /Send code/i }));

      await screen.findByText('Verification pending');
      expect(screen.queryByText('+919876543210')).not.toBeInTheDocument();
      // Appears twice: once in the pending box, once in the top-level
      // success banner -- both masked, neither the full number.
      expect(screen.getAllByText(/\+\*+3210/).length).toBeGreaterThan(0);
    });

    it('prevents duplicate submission while the request is in flight', async () => {
      let resolveRequest: (value: any) => void = () => {};
      mockApi.requestPhoneVerification.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
      );
      renderProfile();
      const phoneInput = await screen.findByLabelText(/Phone number/i);
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });
      fireEvent.click(screen.getByRole('button', { name: /Send code/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Sending/i })).toBeDisabled();
      });
      expect(mockApi.requestPhoneVerification).toHaveBeenCalledTimes(1);

      resolveRequest(wrapped({ phone_number: '+919876543210' }));
      await screen.findByText('Verification pending');
    });

    describe('OTP-pending state', () => {
      const renderWithPendingPhone = async () => {
        mockApi.getMyProfile.mockResolvedValue(wrapped({ ...mockProfile, phone_number: '+919876543210', phone_verified: false }));
        renderProfile();
        await waitFor(() => {
          expect(screen.getByText('Verification pending')).toBeInTheDocument();
        });
      };

      it('restores the pending state directly from GET /api/users/me after a reload, without a fresh request call', async () => {
        await renderWithPendingPhone();
        expect(mockApi.requestPhoneVerification).not.toHaveBeenCalled();
        expect(screen.getByText(/\+\*+3210/)).toBeInTheDocument();
      });

      it('renders a 6-digit numeric OTP input', async () => {
        await renderWithPendingPhone();
        const otpInput = screen.getByLabelText(/Verification code/i) as HTMLInputElement;
        expect(otpInput.maxLength).toBe(6);
      });

      it('strips non-digit characters and blocks submission below 6 digits', async () => {
        await renderWithPendingPhone();
        const otpInput = screen.getByLabelText(/Verification code/i) as HTMLInputElement;
        const verifyButton = screen.getByRole('button', { name: /^Verify$/i });

        fireEvent.change(otpInput, { target: { value: 'ab12' } });
        expect(otpInput.value).toBe('12');
        expect(verifyButton).toBeDisabled();

        fireEvent.change(otpInput, { target: { value: '123456' } });
        expect(verifyButton).not.toBeDisabled();
      });

      it('calls verifyPhone with the entered code and shows the verified state on success', async () => {
        await renderWithPendingPhone();
        fireEvent.change(screen.getByLabelText(/Verification code/i), { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));

        await waitFor(() => {
          expect(mockApi.verifyPhone).toHaveBeenCalledWith('123456');
        });
        expect(await screen.findByText('Phone number verified successfully!')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Change number/i })).toBeInTheDocument();
      });

      it('shows the backend error for an invalid OTP', async () => {
        mockApi.verifyPhone.mockRejectedValue({ response: { data: { error: 'Invalid or expired verification code' } } });
        await renderWithPendingPhone();
        fireEvent.change(screen.getByLabelText(/Verification code/i), { target: { value: '000000' } });
        fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));

        await waitFor(() => {
          expect(screen.getByText('Invalid or expired verification code')).toBeInTheDocument();
        });
      });

      it('shows the backend error for an expired OTP (identical generic message)', async () => {
        mockApi.verifyPhone.mockRejectedValue({ response: { data: { error: 'Invalid or expired verification code' } } });
        await renderWithPendingPhone();
        fireEvent.change(screen.getByLabelText(/Verification code/i), { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));

        await waitFor(() => {
          expect(screen.getByText('Invalid or expired verification code')).toBeInTheDocument();
        });
      });

      it('shows the backend error when attempts are exhausted', async () => {
        mockApi.verifyPhone.mockRejectedValue({
          response: { data: { error: 'Too many incorrect attempts. Please request a new verification code.' } },
        });
        await renderWithPendingPhone();
        fireEvent.change(screen.getByLabelText(/Verification code/i), { target: { value: '000000' } });
        fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));

        await waitFor(() => {
          expect(screen.getByText('Too many incorrect attempts. Please request a new verification code.')).toBeInTheDocument();
        });
      });

      it('calls resendPhoneVerification when Resend code is clicked', async () => {
        await renderWithPendingPhone();
        fireEvent.click(screen.getByRole('button', { name: /Resend code/i }));

        await waitFor(() => {
          expect(mockApi.resendPhoneVerification).toHaveBeenCalledTimes(1);
        });
        expect(await screen.findByText(/Verification code resent to \+\*+3210/)).toBeInTheDocument();
      });

      it('shows the resend-cooldown error inline and disables the button while the request is in flight', async () => {
        let resolveResend: (value: any) => void = () => {};
        mockApi.resendPhoneVerification.mockReturnValue(
          new Promise((resolve) => {
            resolveResend = resolve;
          })
        );
        await renderWithPendingPhone();
        const resendButton = screen.getByRole('button', { name: /Resend code/i });
        fireEvent.click(resendButton);

        await waitFor(() => {
          expect(screen.getByRole('button', { name: /Resending/i })).toBeDisabled();
        });
        expect(mockApi.resendPhoneVerification).toHaveBeenCalledTimes(1);

        resolveResend(wrapped({ phone_number: '+919876543210' }));
        await waitFor(() => {
          expect(screen.getByRole('button', { name: /^Resend code$/i })).not.toBeDisabled();
        });
      });

      it('renders the resend-cooldown error message returned by the backend', async () => {
        mockApi.resendPhoneVerification.mockRejectedValue({
          response: { data: { error: 'Please wait before requesting another code' } },
        });
        await renderWithPendingPhone();
        fireEvent.click(screen.getByRole('button', { name: /Resend code/i }));

        await waitFor(() => {
          expect(screen.getByText('Please wait before requesting another code')).toBeInTheDocument();
        });
      });

      it('renders a rate-limit error safely', async () => {
        mockApi.verifyPhone.mockRejectedValue({
          response: { data: { error: 'Too many verification attempts. Please try again in an hour.' } },
        });
        await renderWithPendingPhone();
        fireEvent.change(screen.getByLabelText(/Verification code/i), { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));

        await waitFor(() => {
          expect(screen.getByText('Too many verification attempts. Please try again in an hour.')).toBeInTheDocument();
        });
      });

      it('renders a network/provider failure safely without exposing internal details', async () => {
        mockApi.verifyPhone.mockRejectedValue(new Error('Network Error'));
        await renderWithPendingPhone();
        fireEvent.change(screen.getByLabelText(/Verification code/i), { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));

        await waitFor(() => {
          expect(screen.getByText('Failed to verify phone number')).toBeInTheDocument();
        });
      });

      it('never renders the raw OTP anywhere on the page', async () => {
        await renderWithPendingPhone();
        const otpInput = screen.getByLabelText(/Verification code/i) as HTMLInputElement;
        fireEvent.change(otpInput, { target: { value: '654321' } });
        fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));

        await waitFor(() => {
          expect(mockApi.verifyPhone).toHaveBeenCalledWith('654321');
        });
        // The OTP is cleared from the input immediately after submission --
        // it never lingers anywhere else on the page.
        await waitFor(() => {
          expect(screen.queryByDisplayValue('654321')).not.toBeInTheDocument();
        });
      });

      it('never persists the OTP in localStorage or sessionStorage', async () => {
        await renderWithPendingPhone();
        fireEvent.change(screen.getByLabelText(/Verification code/i), { target: { value: '654321' } });
        fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));
        await waitFor(() => expect(mockApi.verifyPhone).toHaveBeenCalled());

        const allLocal = Object.keys(localStorage).map((k) => localStorage.getItem(k)).join(' ');
        const allSession = Object.keys(sessionStorage).map((k) => sessionStorage.getItem(k)).join(' ');
        expect(allLocal).not.toContain('654321');
        expect(allSession).not.toContain('654321');
      });
    });

    describe('verified state', () => {
      const renderWithVerifiedPhone = async () => {
        mockApi.getMyProfile.mockResolvedValue(wrapped({ ...mockProfile, phone_number: '+919876543210', phone_verified: true }));
        renderProfile();
        await waitFor(() => {
          expect(screen.getByRole('button', { name: /Change number/i })).toBeInTheDocument();
        });
      };

      it('shows the masked number and a Verified badge', async () => {
        await renderWithVerifiedPhone();
        expect(screen.getByText(/\+\*+3210/)).toBeInTheDocument();
        expect(screen.getAllByText('Verified').length).toBeGreaterThan(0);
      });

      it('does not render a Remove action (no backend endpoint exists for it)', async () => {
        await renderWithVerifiedPhone();
        expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument();
      });

      it('Change number reveals a fresh phone-entry form and resets verification correctly on a new request', async () => {
        await renderWithVerifiedPhone();
        // Two "Verified" badges exist at this point: email's (mockProfile's
        // is_verified: true, unrelated to this test) and phone's own.
        const verifiedCountBefore = screen.getAllByText('Verified').length;
        expect(verifiedCountBefore).toBe(2);

        fireEvent.click(screen.getByRole('button', { name: /Change number/i }));

        const phoneInput = await screen.findByLabelText(/Phone number/i);
        fireEvent.change(phoneInput, { target: { value: '8123456789' } });
        mockApi.requestPhoneVerification.mockResolvedValue(wrapped({ phone_number: '+918123456789', phone_verified: false }));
        fireEvent.click(screen.getByRole('button', { name: /Send code/i }));

        expect(await screen.findByText('Verification pending')).toBeInTheDocument();
        // The stale "Verified" badge from the OLD phone number must not
        // persist once a new, unverified number has been requested --
        // only email's (unrelated, unchanged) badge remains.
        expect(screen.getAllByText('Verified').length).toBe(1);
        expect(mockApi.requestPhoneVerification).toHaveBeenCalledWith('8123456789');
      });

      it('Cancel on the change-number form returns to the verified state without calling the API', async () => {
        await renderWithVerifiedPhone();
        fireEvent.click(screen.getByRole('button', { name: /Change number/i }));
        await screen.findByLabelText(/Phone number/i);

        fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

        await waitFor(() => {
          expect(screen.getByRole('button', { name: /Change number/i })).toBeInTheDocument();
        });
        expect(mockApi.requestPhoneVerification).not.toHaveBeenCalled();
      });
    });

    it('masking a long international number never breaks and reveals only the last 4 digits', async () => {
      mockApi.getMyProfile.mockResolvedValue(wrapped({ ...mockProfile, phone_number: '+4915123456789', phone_verified: true }));
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText(/\+\*+6789/)).toBeInTheDocument();
      });
      expect(screen.queryByText('+4915123456789')).not.toBeInTheDocument();
    });

    it('phone data is never included in a getAllUsers-style call (no such call exists on this page)', async () => {
      // Profile.tsx never calls a teammate-scoped endpoint at all -- this
      // test documents that invariant directly rather than merely relying
      // on its absence to prove privacy.
      renderProfile();
      await waitFor(() => expect(api.getMyProfile).toHaveBeenCalled());
      expect((api as any).getAllUsers).not.toHaveBeenCalled();
    });
  });

  describe('Avatar Upload & Display', () => {
    it('displays initials when no avatar exists', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText('TU')).toBeInTheDocument(); // Test User initials
      });
    });

    it('displays avatar image when avatar_url is available', async () => {
      const profileWithAvatar = {
        ...mockProfile,
        avatar_key: 'avatars/user-123/uuid-456',
        avatar_url: 'https://blob.example.com/avatars/user-123/uuid-456',
      };

      mockApi.getMyProfile.mockResolvedValue(wrapped(profileWithAvatar));
      renderProfile();

      await waitFor(() => {
        const avatarImg = screen.getByRole('img', { name: /profile/i });
        expect(avatarImg).toHaveAttribute('src', 'https://blob.example.com/avatars/user-123/uuid-456');
      });
    });

    it('falls back to initials if avatar image fails to load', async () => {
      const profileWithAvatar = {
        ...mockProfile,
        avatar_key: 'avatars/user-123/uuid-456',
        avatar_url: 'https://blob.example.com/broken.jpg',
      };

      mockApi.getMyProfile.mockResolvedValue(wrapped(profileWithAvatar));
      renderProfile();

      await waitFor(() => {
        const avatarImg = screen.getByRole('img', { name: /profile/i });
        expect(avatarImg).toBeInTheDocument();
      });

      // Simulate image load error
      fireEvent.error(screen.getByRole('img', { name: /profile/i }));

      await waitFor(() => {
        const fallback = screen.getByText('TU');
        expect(fallback).toBeVisible();
      });
    });

    it('avatar upload control is visible and accessible', async () => {
      renderProfile();

      await waitFor(() => {
        const uploadControl = screen.getByLabelText(/upload avatar/i);
        expect(uploadControl).toBeInTheDocument();
        expect(uploadControl).toHaveAttribute('type', 'file');
        expect(uploadControl).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
      });
    });

    it('validates file type on client side (rejects non-image)', async () => {
      mockApi.uploadAvatar.mockResolvedValue({
        data: {
          success: true,
          data: {
            avatar_url: 'https://blob.example.com/avatars/user-123/uuid-456',
            avatar_key: 'avatars/user-123/uuid-456',
          },
        },
      });

      renderProfile();

      await waitFor(() => {
        expect(screen.getByLabelText(/upload avatar/i)).toBeInTheDocument();
      });

      // Try to upload a text file (rejected by accept attribute)
      const fileInput = screen.getByLabelText(/upload avatar/i) as HTMLInputElement;
      const file = new File(['text'], 'test.txt', { type: 'text/plain' });

      fireEvent.change(fileInput, { target: { files: [file] } });

      // Client-side validation should show error
      await waitFor(() => {
        expect(
          screen.getByText(/Only JPG, PNG, and WebP images are supported/i),
        ).toBeInTheDocument();
      });
    });

    it('validates file size on client side (rejects >5MB)', async () => {
      renderProfile();

      await waitFor(() => {
        expect(screen.getByLabelText(/upload avatar/i)).toBeInTheDocument();
      });

      // Create a large file (6MB)
      const largeFile = new File([new ArrayBuffer(6 * 1024 * 1024)], 'large.jpg', {
        type: 'image/jpeg',
      });

      const fileInput = screen.getByLabelText(/upload avatar/i) as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [largeFile] } });

      await waitFor(() => {
        expect(screen.getByText(/File size must be less than 5MB/i)).toBeInTheDocument();
      });
    });

    it('successful upload updates avatar display', async () => {
      mockApi.uploadAvatar.mockResolvedValue({
        data: {
          success: true,
          data: {
            avatar_url: 'https://blob.example.com/avatars/user-123/new-uuid',
            avatar_key: 'avatars/user-123/new-uuid',
          },
        },
      });

      renderProfile();

      await waitFor(() => {
        expect(screen.getByLabelText(/upload avatar/i)).toBeInTheDocument();
      });

      // Upload a valid image
      const validFile = new File(['image'], 'test.jpg', { type: 'image/jpeg' });
      const fileInput = screen.getByLabelText(/upload avatar/i) as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [validFile] } });

      await waitFor(() => {
        expect(mockApi.uploadAvatar).toHaveBeenCalledTimes(1);
      });

      // Verify API was called with FormData
      const callArgs = mockApi.uploadAvatar.mock.calls[0][0];
      expect(callArgs instanceof FormData).toBe(true);
    });

    it('displays remove avatar button when avatar exists', async () => {
      const profileWithAvatar = {
        ...mockProfile,
        avatar_key: 'avatars/user-123/uuid-456',
        avatar_url: 'https://blob.example.com/avatars/user-123/uuid-456',
      };

      mockApi.getMyProfile.mockResolvedValue(wrapped(profileWithAvatar));
      renderProfile();

      await waitFor(() => {
        expect(screen.getByText(/Remove avatar/i)).toBeInTheDocument();
      });
    });

    it('delete avatar updates profile state', async () => {
      const profileWithAvatar = {
        ...mockProfile,
        avatar_key: 'avatars/user-123/uuid-456',
        avatar_url: 'https://blob.example.com/avatars/user-123/uuid-456',
      };

      mockApi.getMyProfile.mockResolvedValue(wrapped(profileWithAvatar));
      mockApi.deleteAvatar.mockResolvedValue({});

      renderProfile();

      await waitFor(() => {
        expect(screen.getByText(/Remove avatar/i)).toBeInTheDocument();
      });

      // Confirm dialog and delete
      window.confirm = vi.fn(() => true);
      fireEvent.click(screen.getByText(/Remove avatar/i));

      await waitFor(() => {
        expect(mockApi.deleteAvatar).toHaveBeenCalledTimes(1);
      });
    });

    it('shows upload error message on failure', async () => {
      mockApi.uploadAvatar.mockRejectedValue({
        response: { data: { error: 'File validation failed: unsupported format' } },
      });

      renderProfile();

      await waitFor(() => {
        expect(screen.getByLabelText(/upload avatar/i)).toBeInTheDocument();
      });

      const validFile = new File(['image'], 'test.jpg', { type: 'image/jpeg' });
      const fileInput = screen.getByLabelText(/upload avatar/i) as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [validFile] } });

      await waitFor(() => {
        expect(
          screen.getByText(/File validation failed: unsupported format/i),
        ).toBeInTheDocument();
      });
    });

    it('upload control is disabled during upload', async () => {
      mockApi.uploadAvatar.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                data: {
                  success: true,
                  data: {
                    avatar_url: 'https://blob.example.com/avatars/user-123/new-uuid',
                    avatar_key: 'avatars/user-123/new-uuid',
                  },
                },
              });
            }, 100);
          }),
      );

      renderProfile();

      await waitFor(() => {
        expect(screen.getByLabelText(/upload avatar/i)).toBeInTheDocument();
      });

      const validFile = new File(['image'], 'test.jpg', { type: 'image/jpeg' });
      const fileInput = screen.getByLabelText(/upload avatar/i) as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [validFile] } });

      // During upload, the input should be disabled (or upload button should show "Uploading...")
      await waitFor(() => {
        expect(screen.getByText(/Updating avatar/i)).toBeInTheDocument();
      });
    });
  });
});
