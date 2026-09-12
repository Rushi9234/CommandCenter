import bcrypt from 'bcrypt';
import { usersRepository } from './users.repository';
import { authRepository } from '../auth/auth.repository';
import { BadRequestError, UnauthorizedError } from '../../common/errors';
import { avatarStorageService } from '../avatars/avatars.storage';

const BCRYPT_COST = 12;

export class UsersService {
  // Milestone 41: the repository's SELECT DISTINCT ... ORDER BY requires
  // created_at in the select list (Postgres rule), but that column was
  // never part of this endpoint's response before -- stripped here so the
  // response shape is unchanged for every field that already existed.
  async getAllUsers(callerId: string) {
    const users = await usersRepository.getAllUsers(callerId);
    return users.map(({ created_at, ...rest }: any) => rest);
  }

  getUserById(userId: string) {
    return usersRepository.getUserById(userId);
  }

  async getProfile(userId: string) {
    const profile = await usersRepository.getProfileById(userId);
    if (!profile) return null;

    // Add avatar_url if avatar_key exists
    const profileWithUrl = { ...profile };
    if (profile.avatar_key) {
      profileWithUrl.avatar_url = avatarStorageService.getAvatarUrl(profile.avatar_key);
    } else {
      profileWithUrl.avatar_url = null;
    }

    return profileWithUrl;
  }

  async updateProfile(userId: string, updates: Record<string, any>) {
    // updateUser's `RETURNING *` includes password_hash and every other raw
    // column -- fine for the two other callers (notifications/privacy
    // services), which each extract exactly one safe field before this ever
    // reaches an HTTP response, but this was the one call site that handed
    // the entire raw row straight to the controller's ok(res, updated),
    // exposing the bcrypt hash directly in PUT /api/users/me/profile's
    // response body. Re-fetching the safe profile shape afterward matches
    // the exact pattern changePassword already uses for the same reason.
    await usersRepository.updateUser(userId, updates);
    return this.getProfile(userId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    // Verify new password is different from current
    const currentHash = await usersRepository.getPasswordHashById(userId);
    if (!currentHash) {
      throw new UnauthorizedError('User not found');
    }

    // Verify current password is correct
    const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, currentHash);
    if (!isCurrentPasswordCorrect) {
      throw new BadRequestError('Current password is incorrect');
    }

    // Verify new password is not the same as current
    const isSamePassword = await bcrypt.compare(newPassword, currentHash);
    if (isSamePassword) {
      throw new BadRequestError('New password must be different from current password');
    }

    // Hash the new password
    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

    // Update password and revoke all sessions atomically
    await authRepository.resetPasswordAndRevokeSessions(userId, newPasswordHash, new Date());

    // Return updated profile (without password hash)
    return usersRepository.getProfileById(userId);
  }
}

export const usersService = new UsersService();
