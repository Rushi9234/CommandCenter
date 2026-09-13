import bcrypt from 'bcrypt';
import { usersRepository } from './users.repository';
import { authRepository } from '../auth/auth.repository';
import { BadRequestError, UnauthorizedError } from '../../common/errors';
import { avatarStorageService } from '../avatars/avatars.storage';
import { generateOpaqueToken, hashToken } from '../auth/jwt';
import { sendEmailChangeVerification } from '../../services/emailService';
import { notificationsService } from '../notifications/notifications.service';

const BCRYPT_COST = 12;
const EMAIL_CHANGE_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour -- matches PASSWORD_RESET_TTL_MS's precedent (auth.service.ts): a sensitive, security-adjacent action, not a routine 24-hour signup-verification window.

// Phase 4 audit §2.7: "already registered to someone else" and "identical
// to the current email" must be indistinguishable from each other in the
// response, so an attacker probing requestEmailChange with guessed
// addresses can't use a differently-worded error to enumerate which ones
// already belong to real accounts. Current-password confirmation (checked
// separately, before this) is intentionally the one distinctly-worded
// failure -- it isn't an enumeration vector (the caller already knows
// their own account exists) and matches changePassword's existing,
// established convention of naming that failure plainly.
const EMAIL_UNAVAILABLE_MESSAGE = 'Unable to change email to the address provided';

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

  // Phase 4 email-change, step 1 of 2 (see auth.service.ts's
  // verifyEmailChange for step 2). Current-password confirmation is
  // checked FIRST, before anything about new_email is even looked at --
  // matching changePassword's ordering and the audit's §3.4 rationale: a
  // stolen live session alone (no password) must not be enough to pivot
  // into a permanent account takeover via the recovery/login identifier.
  // Nothing about `users.email` is written here -- only pending_email and
  // the token/expiry columns -- the current, authoritative email remains
  // valid for login throughout the entire pending period (audit §3.1).
  async requestEmailChange(userId: string, newEmail: string, currentPassword: string) {
    const user = await usersRepository.getUserById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const isPasswordCorrect = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isPasswordCorrect) {
      throw new BadRequestError('Current password is incorrect');
    }

    if (newEmail === user.email) {
      throw new BadRequestError(EMAIL_UNAVAILABLE_MESSAGE);
    }
    const existing = await authRepository.getUserByEmail(newEmail);
    if (existing && existing.user_id !== userId) {
      throw new BadRequestError(EMAIL_UNAVAILABLE_MESSAGE);
    }

    const rawToken = generateOpaqueToken();
    await authRepository.updateUser(userId, {
      pending_email: newEmail,
      email_change_token_hash: hashToken(rawToken),
      email_change_expires: new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MS),
    });

    // Sent to the NEW address (proves possession before it becomes
    // authoritative -- audit §2.2 step 4), never to the old one.
    await sendEmailChangeVerification(newEmail, rawToken, user.full_name);

    // In-app security notice to the account itself (still reachable via
    // the OLD, still-authoritative email/login throughout the pending
    // period) -- the account owner's earliest chance to notice and react
    // to a change they didn't request (audit §3.2). Awaited, matching
    // changePassword's own notifyUser call site and the exact reasoning
    // behind it (users.controller.ts) -- never fire-and-forget against a
    // request that might be followed by a test/caller tearing down state.
    await notificationsService.notifyUser({
      recipientUserId: userId,
      category: 'email_change_requested',
      preferenceGroup: 'email_change',
      title: 'Email Change Requested',
      message: `A request was made to change your account email to ${newEmail}. If you did not request this, please contact support immediately.`,
    });

    return { pending_email: newEmail };
  }

  // Phase 4 email-change resend: re-sends the verification link to the
  // SAME pending address, generating a fresh token that overwrites (and
  // therefore invalidates) whatever token the original request issued --
  // the same single-slot-column pattern every other token pair in this
  // codebase already uses (see auth.repository.ts's AUTH_UPDATABLE_COLUMNS
  // comment). Does not re-verify the password or accept a new target
  // address -- mirrors resendVerification's shape (auth.service.ts): a
  // resend operates on an already-established pending state, not a fresh
  // request.
  async resendEmailChangeVerification(userId: string) {
    const user = await usersRepository.getUserById(userId);
    if (!user || !user.pending_email) {
      // Not an enumeration concern (audit §7's proposed-endpoint note):
      // the caller is already authenticated as themselves, so "you have
      // no pending change" reveals nothing about any other account.
      throw new BadRequestError('No pending email change to resend');
    }

    const rawToken = generateOpaqueToken();
    await authRepository.updateUser(userId, {
      email_change_token_hash: hashToken(rawToken),
      email_change_expires: new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MS),
    });

    await sendEmailChangeVerification(user.pending_email, rawToken, user.full_name);

    return { pending_email: user.pending_email };
  }
}

export const usersService = new UsersService();
