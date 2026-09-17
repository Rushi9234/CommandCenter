import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validateUuidParams } from '../../common/middleware/validate';
import { requireTeamOrParentAccess, teamIdFromParams } from '../../common/middleware/requireTeamRole';
import * as worklogController from './worklog.controller';

const router = Router();

router.get(
  '/teams/:teamId/worklog',
  authenticate,
  validateUuidParams('teamId'),
  requireTeamOrParentAccess(teamIdFromParams),
  asyncHandler(worklogController.getWorklog)
);

export default router;
