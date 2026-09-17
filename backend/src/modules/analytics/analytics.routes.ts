import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validateUuidParams } from '../../common/middleware/validate';
import * as analyticsController from './analytics.controller';

const router = Router();

router.get('/analytics/scopes', authenticate, asyncHandler(analyticsController.getUserScopes));

router.get(
  '/analytics/classes/:classId',
  authenticate,
  validateUuidParams('classId'),
  asyncHandler(analyticsController.getClassAnalytics)
);

router.get(
  '/analytics/classes/:classId/teams/:teamId',
  authenticate,
  validateUuidParams('classId', 'teamId'),
  asyncHandler(analyticsController.getTeamAnalytics)
);

router.get(
  '/analytics/classes/:classId/teams/:teamId/members/:memberId',
  authenticate,
  validateUuidParams('classId', 'teamId', 'memberId'),
  asyncHandler(analyticsController.getMemberAnalytics)
);

router.get(
  '/analytics/teams/:teamId',
  authenticate,
  validateUuidParams('teamId'),
  asyncHandler(analyticsController.getTeamAnalytics)
);

router.get(
  '/analytics/teams/:teamId/members/:memberId',
  authenticate,
  validateUuidParams('teamId', 'memberId'),
  asyncHandler(analyticsController.getMemberAnalytics)
);

router.get(
  '/analytics/members/:memberId',
  authenticate,
  validateUuidParams('memberId'),
  asyncHandler(analyticsController.getMemberAnalytics)
);

export default router;
