import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok } from '../../common/http/respond';
import { leaderboardService } from './leaderboard.service';

export const getLeaderboard = async (req: AuthRequest, res: Response) => {
  const leaderboard = await leaderboardService.getLeaderboard();
  ok(res, leaderboard);
};
