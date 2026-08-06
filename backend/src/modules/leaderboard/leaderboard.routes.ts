import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import * as leaderboardController from './leaderboard.controller';

const router = Router();

router.get('/leaderboard', authenticate, asyncHandler(leaderboardController.getLeaderboard));

export default router;
