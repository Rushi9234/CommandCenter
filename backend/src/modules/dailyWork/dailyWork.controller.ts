import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok, created } from '../../common/http/respond';
import { dailyWorkService } from './dailyWork.service';

export const createEntry = async (req: AuthRequest, res: Response) => {
  const entry = await dailyWorkService.createEntry(req.user!.userId, req.body.teamId, req.body.entryText);
  created(res, entry, 'Entry added');
};

export const getTodaysEntries = async (req: AuthRequest, res: Response) => {
  const entries = await dailyWorkService.getTodaysEntries(req.user!.userId, req.query.teamId as string);
  ok(res, entries);
};

export const summarizeToday = async (req: AuthRequest, res: Response) => {
  const draft = await dailyWorkService.summarizeToday(req.user!.userId, req.body.teamId);
  ok(res, draft);
};

export const submitWork = async (req: AuthRequest, res: Response) => {
  const submission = await dailyWorkService.submitWork(req.user!.userId, req.body.teamId, req.body.confirmedSummary, req.body.aiSummary);
  created(res, submission, "Today's work submitted");
};

export const getTeamSubmissions = async (req: AuthRequest, res: Response) => {
  const submissions = await dailyWorkService.getTeamSubmissionsForDate(req.params.teamId, req.query.date as string | undefined);
  ok(res, submissions);
};

export const getMyHistory = async (req: AuthRequest, res: Response) => {
  const { teamId, limit } = req.query as unknown as { teamId: string; limit: number };
  const history = await dailyWorkService.getMyHistory(req.user!.userId, teamId, limit);
  ok(res, history);
};
