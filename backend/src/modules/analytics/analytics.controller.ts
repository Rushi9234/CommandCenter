import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok } from '../../common/http/respond';
import { analyticsService } from './analytics.service';

export const getUserScopes = async (req: AuthRequest, res: Response) => {
  const scopes = await analyticsService.getUserScopes(req.user!.userId);
  ok(res, scopes);
};

export const getClassAnalytics = async (req: AuthRequest, res: Response) => {
  const analytics = await analyticsService.getClassAnalytics(req.params.classId, req.user!.userId);
  ok(res, analytics);
};

export const getTeamAnalytics = async (req: AuthRequest, res: Response) => {
  const classId = (req.params.classId || req.query.classId) as string | undefined;
  const analytics = await analyticsService.getTeamAnalytics(req.params.teamId, req.user!.userId, classId);
  ok(res, analytics);
};

export const getMemberAnalytics = async (req: AuthRequest, res: Response) => {
  const teamId = (req.params.teamId || req.query.teamId) as string | undefined;
  const classId = (req.params.classId || req.query.classId) as string | undefined;
  const analytics = await analyticsService.getMemberAnalytics(
    req.params.memberId,
    req.user!.userId,
    teamId,
    classId
  );
  ok(res, analytics);
};
