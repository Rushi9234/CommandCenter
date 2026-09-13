import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok } from '../../common/http/respond';
import { usersService } from './users.service';
import { notificationsService } from '../notifications/notifications.service';
import { avatarService } from '../avatars/avatars.service';
import { BadRequestError } from '../../common/errors';

export const getAllUsers = async (req: AuthRequest, res: Response) => {
  const users = await usersService.getAllUsers(req.user!.userId);
  ok(res, users);
};

export const getOwnProfile = async (req: AuthRequest, res: Response) => {
  const profile = await usersService.getProfile(req.user!.userId);
  ok(res, profile);
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  const { full_name, bio, pronouns, location, is_profile_public } = req.body;

  const updates: Record<string, any> = {};
  if (full_name !== undefined) updates.full_name = full_name;
  if (bio !== undefined) updates.bio = bio;
  if (pronouns !== undefined) updates.pronouns = pronouns;
  if (location !== undefined) updates.location = location;
  if (is_profile_public !== undefined) updates.is_profile_public = is_profile_public;

  const updated = await usersService.updateProfile(req.user!.userId, updates);
  ok(res, updated);
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  const { current_password, new_password } = req.body;

  await usersService.changePassword(req.user!.userId, current_password, new_password);

  // Send security notification after successful password change. Awaited --
  // matching every other notifyUser() call site in the codebase (teams,
  // goals, projects, blockers all await it inline) -- not fire-and-forget.
  // notifyUser() already never throws (its own body is wrapped in
  // try/catch and only logs), so awaiting it cannot make this endpoint
  // fail on notification trouble; it only makes the response wait for the
  // notification's own DB write to finish first. Previously this was
  // deliberately NOT awaited, which let the HTTP response return, and the
  // test that sent it proceed to the next test's beforeEach (resetDatabase's
  // TRUNCATE ... CASCADE on users), while this INSERT into the
  // users-referencing notifications table was still in flight -- producing
  // real, reproduced-locally Postgres deadlocks and FK violations
  // ("notifications_user_id_fkey", "deadlock detected") in CI. This is the
  // only notifyUser() call site in the app that wasn't already awaited.
  await notificationsService.notifyUser({
    recipientUserId: req.user!.userId,
    category: 'password_change',
    preferenceGroup: 'password_change',
    title: 'Password Changed',
    message: 'Your password was changed successfully. If you did not make this change, please contact support immediately.',
  });

  // Return 204 No Content on success
  res.status(204).send();
};

// Phase 4 email-change request. current_password gates this (see
// users.service.ts's requestEmailChange) -- no session token is ever
// returned here, and pending_email is the only email-change-related field
// safe to echo back (never the raw token).
export const requestEmailChange = async (req: AuthRequest, res: Response) => {
  const { new_email, current_password } = req.body;
  const result = await usersService.requestEmailChange(req.user!.userId, new_email, current_password);
  ok(res, result);
};

export const resendEmailChangeVerification = async (req: AuthRequest, res: Response) => {
  const result = await usersService.resendEmailChangeVerification(req.user!.userId);
  ok(res, result);
};

// Phase 4 phone verification. All three read exclusively from
// req.user.userId (never a client-supplied id) and req.body's own,
// DTO-validated fields -- no OTP, OTP hash, or provider detail is ever
// echoed back in any response.
export const requestPhoneVerification = async (req: AuthRequest, res: Response) => {
  const { phone_number } = req.body;
  const result = await usersService.requestPhoneVerification(req.user!.userId, phone_number);
  ok(res, result);
};

export const resendPhoneVerification = async (req: AuthRequest, res: Response) => {
  const result = await usersService.resendPhoneVerification(req.user!.userId);
  ok(res, result);
};

export const verifyPhone = async (req: AuthRequest, res: Response) => {
  const { code } = req.body;
  const result = await usersService.verifyPhone(req.user!.userId, code);
  ok(res, result);
};

export const uploadAvatar = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new BadRequestError('No file uploaded');
  }

  const userId = req.user!.userId;
  const fileBuffer = req.file.buffer;
  const declaredMimeType = req.file.mimetype;

  // Validate and upload
  const result = await avatarService.uploadAvatar(userId, fileBuffer, declaredMimeType);

  ok(res, {
    avatar_url: result.avatar_url,
    avatar_key: result.avatar_key,
    user_id: userId,
    avatar_size: result.avatar_size,
    avatar_width: result.avatar_width,
    avatar_height: result.avatar_height,
  });
};

export const deleteAvatar = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  await avatarService.deleteAvatar(userId);
  res.status(204).send();
};
