import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validateUuidParams } from '../../common/middleware/validate';
import { requireTeamRole, requireTeamMembership, teamIdFromParams } from '../../common/middleware/requireTeamRole';
import * as pulseController from './pulse.controller';

const router = Router();

router.get(
  '/me',
  authenticate,
  asyncHandler(pulseController.getIndividualPulse)
);

router.get(
  '/teams/:teamId',
  authenticate,
  validateUuidParams('teamId'),
  requireTeamMembership(teamIdFromParams),
  asyncHandler(pulseController.getTeamPulse)
);

router.get(
  '/classrooms/:teamId',
  authenticate,
  validateUuidParams('teamId'),
  requireTeamRole(teamIdFromParams, ['owner', 'admin', 'manager']),
  asyncHandler(pulseController.getClassroomPulse)
);

export default router;
