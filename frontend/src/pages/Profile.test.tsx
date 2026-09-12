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
