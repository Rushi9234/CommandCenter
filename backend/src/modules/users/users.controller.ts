import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok } from '../../common/http/respond';
import { usersService } from './users.service';

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

  // Return 204 No Content on success
  res.status(204).send();
};
