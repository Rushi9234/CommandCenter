import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validateUuidParams } from '../../common/middleware/validate';
import { requireTeamMembership, teamIdFromParams } from '../../common/middleware/requireTeamRole';
import * as workStateHistoryController from './workStateHistory.controller';

const router = Router();

router.get(
  '/teams/:teamId/work-history',
  authenticate,
  validateUuidParams('teamId'),
  requireTeamMembership(teamIdFromParams),
  asyncHandler(workStateHistoryController.getTeamHistory)
);

router.get(
  '/timeline/:artifactType/:artifactId',
  authenticate,
  validateUuidParams('artifactId'),
  asyncHandler(workStateHistoryController.getArtifactTimeline)
);

export default router;
