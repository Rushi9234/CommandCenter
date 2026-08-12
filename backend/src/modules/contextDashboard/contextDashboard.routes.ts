import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validateUuidParams } from '../../common/middleware/validate';
import { requireTeamRole, teamIdFromParams } from '../../common/middleware/requireTeamRole';
import * as contextDashboardController from './contextDashboard.controller';

const router = Router();

// Milestone 51: gated exactly like every other owner/admin-only team
// route (requireTeamRole on the team's OWN id, from :teamId) -- no new
// middleware primitive. See contextDashboard.service.ts's own comment for
// why what this endpoint returns about the team's CHILDREN is still safe
// despite the caller only being an explicit member of the parent.
router.get(
  '/teams/:teamId/context-dashboard',
  authenticate,
  validateUuidParams('teamId'),
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  asyncHandler(contextDashboardController.getContextDashboard)
);

export default router;
