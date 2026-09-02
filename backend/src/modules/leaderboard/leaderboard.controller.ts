import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok } from '../../common/http/respond';
import { leaderboardService } from './leaderboard.service';
import { LeaderboardPeriod } from './leaderboard.repository';

const VALID_PERIODS: LeaderboardPeriod[] = ['all', 'today', 'week', 'month'];

// An unrecognized/missing ?period value quietly falls back to 'all' rather
// than 400ing -- period is a display filter, not a required parameter, and
// the same pattern (parse + clamp/default, never reject) is already used
// for notifications' ?limit/?offset.
const parsePeriod = (raw: unknown): LeaderboardPeriod =>
  VALID_PERIODS.includes(raw as LeaderboardPeriod) ? (raw as LeaderboardPeriod) : 'all';

export const getLeaderboard = async (req: AuthRequest, res: Response) => {
  const period = parsePeriod(req.query.period);
  const leaderboard = await leaderboardService.getLeaderboard(period);
  ok(res, leaderboard);
};
