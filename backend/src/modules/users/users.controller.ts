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

  // Send security notification after successful password change (fire-and-forget)
  // Notification failure must not fail the password change itself
  notificationsService.notifyUser({
    recipientUserId: req.user!.userId,
    category: 'password_change',
    preferenceGroup: 'password_change',
    title: 'Password Changed',
    message: 'Your password was changed successfully. If you did not make this change, please contact support immediately.',
  }).catch((error) => {
    // Logged but not thrown -- password change succeeded regardless
    console.error('[users.controller] Failed to send password change notification (non-fatal):', error);
  });

  // Return 204 No Content on success
  res.status(204).send();
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
