import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok, created } from '../../common/http/respond';
import { logsService } from './logs.service';

export const createLog = async (req: AuthRequest, res: Response) => {
  const result = await logsService.createLog(req.user!.userId, req.body.entryText);
  created(res, result, 'Log created successfully! 🔥');
};

export const getMyLogs = async (req: AuthRequest, res: Response) => {
  const limit = (req.query as any).limit as number;
  const logs = await logsService.getUserLogs(req.user!.userId, limit);
  ok(res, logs);
};

export const updateLog = async (req: AuthRequest, res: Response) => {
  const updatedLog = await logsService.updateLog(req.params.logId, req.user!.userId, req.body.entryText);
  ok(res, updatedLog, 'Log updated successfully');
};

export const getSuggestions = async (req: AuthRequest, res: Response) => {
  const suggestions = await logsService.getSuggestions(req.user!.userId);
  ok(res, suggestions);
};

export const getInsights = async (req: AuthRequest, res: Response) => {
  const insights = await logsService.getInsights(req.user!.userId);
  ok(res, insights);
};

export const getStandup = async (req: AuthRequest, res: Response) => {
  const standup = await logsService.getStandup(req.user!.userId, req.query.teamId as string | undefined);
  ok(res, standup);
};
