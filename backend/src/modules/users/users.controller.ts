import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok } from '../../common/http/respond';
import { usersService } from './users.service';

export const getAllUsers = async (req: AuthRequest, res: Response) => {
  const users = await usersService.getAllUsers();
  ok(res, users);
};
