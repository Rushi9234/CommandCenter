import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { pulseService } from './pulse.service';

export async function getIndividualPulse(req: AuthRequest, res: Response) {
  const userId = req.user!.userId;
  const category = req.query.category as string | undefined;
  const cursor = req.query.cursor as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

  const result = await pulseService.getIndividualPulse(userId, { category, cursor, limit });
  return res.json({
    status: 'success',
    data: result,
  });
}

export async function getTeamPulse(req: AuthRequest, res: Response) {
  const userId = req.user!.userId;
  const teamId = req.params.teamId;
  const category = req.query.category as string | undefined;
  const cursor = req.query.cursor as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

  const result = await pulseService.getTeamPulse(userId, teamId, { category, cursor, limit });
  return res.json({
    status: 'success',
    data: result,
  });
}

export async function getClassroomPulse(req: AuthRequest, res: Response) {
  const userId = req.user!.userId;
  const teamId = req.params.teamId;
  const category = req.query.category as string | undefined;
  const cursor = req.query.cursor as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

  const result = await pulseService.getClassroomPulse(userId, teamId, { category, cursor, limit });
  return res.json({
    status: 'success',
    data: result,
  });
}
