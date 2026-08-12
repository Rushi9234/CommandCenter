import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok } from '../../common/http/respond';
import { contextDashboardService } from './contextDashboard.service';

export const getContextDashboard = async (req: AuthRequest, res: Response) => {
  const dashboard = await contextDashboardService.getContextDashboard(req.params.teamId);
  ok(res, dashboard);
};
