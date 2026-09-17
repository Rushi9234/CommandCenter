import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { workStateHistoryService } from './workStateHistory.service';
import { ok } from '../../common/http/respond';
import { BadRequestError } from '../../common/errors';

export const getTeamHistory = async (req: AuthRequest, res: Response) => {
  const { teamId } = req.params;
  const { artifactType, cursor, limit } = req.query as {
    artifactType?: string;
    cursor?: string;
    limit?: string;
  };

  const parsedLimit = limit ? parseInt(limit, 10) : undefined;
  const result = await workStateHistoryService.getTeamHistory(teamId, {
    artifactType,
    cursor,
    limit: parsedLimit,
  });

  ok(res, result);
};

export const getArtifactTimeline = async (req: AuthRequest, res: Response) => {
  const { artifactType, artifactId } = req.params;
  const { beforeTimestamp, beforeHistoryId, limit } = req.query as {
    beforeTimestamp?: string;
    beforeHistoryId?: string;
    limit?: string;
  };

  if (!['task', 'goal', 'blocker'].includes(artifactType)) {
    throw new BadRequestError('Invalid artifactType. Must be task, goal, or blocker');
  }

  const parsedLimit = limit ? parseInt(limit, 10) : undefined;
  const userId = req.user!.userId;

  const result = await workStateHistoryService.getArtifactTimeline(
    userId,
    artifactType as 'task' | 'goal' | 'blocker',
    artifactId,
    {
      beforeTimestamp,
      beforeHistoryId,
      limit: parsedLimit,
    }
  );

  ok(res, result);
};
