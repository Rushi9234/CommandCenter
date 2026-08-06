import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok, created } from '../../common/http/respond';
import { blockersService } from './blockers.service';

export const createBlocker = async (req: AuthRequest, res: Response) => {
  const blocker = await blockersService.createBlocker(req.user!.userId, req.body);
  created(res, blocker, 'Blocker created successfully');
};

export const getTeamBlockers = async (req: AuthRequest, res: Response) => {
  const blockers = await blockersService.getTeamBlockers(req.params.teamId);
  ok(res, blockers);
};

export const updateBlocker = async (req: AuthRequest, res: Response) => {
  const blocker = await blockersService.updateBlocker(req.params.blockerId, req.body, req.user!.userId);
  ok(res, blocker, 'Blocker updated successfully');
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
  const message = await blockersService.sendMessage(req.params.blockerId, req.user!.userId, req.body.messageText);
  created(res, message);
};

export const getMessages = async (req: AuthRequest, res: Response) => {
  const messages = await blockersService.getMessages(req.params.blockerId);
  ok(res, messages);
};

export const getAIMentorAdvice = async (req: AuthRequest, res: Response) => {
  const advice = await blockersService.getAIMentorAdvice(req.params.blockerId);
  ok(res, advice);
};
