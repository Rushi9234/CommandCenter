import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { worklogService } from './worklog.service';
import { ok } from '../../common/http/respond';

export async function getWorklog(req: AuthRequest, res: Response) {
  const teamId = req.params.teamId;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const data = await worklogService.getWorklog(teamId, limit);
  return ok(res, data, 'Worklog fetched successfully');
}
