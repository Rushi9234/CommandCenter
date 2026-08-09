import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate, validateUuidParams } from '../../common/middleware/validate';
import { requireAccess } from '../../common/middleware/requireAccess';
import { requireTeamRoleIfSpecified, teamIdFromBody, teamIdFromQuery } from '../../common/middleware/requireTeamRole';
import { goalsRepository } from './goals.repository';
import * as goalsController from './goals.controller';
import { createGoalSchema, updateGoalSchema } from './goals.dto';

// Milestone 5 review: viewer is documented as read-only -- READ_ROLES
// covers list/hierarchy GETs, WRITE_ROLES gates creation (canWriteGoal
// applies the same exclusion to update/delete).
const READ_ROLES = ['owner', 'admin', 'manager', 'member', 'viewer'];
const WRITE_ROLES = ['owner', 'admin', 'manager', 'member'];

const router = Router();

// If the caller names a teamId, they must belong to it -- no check existed
// before, so any authenticated user could insert a goal into a team they
// don't belong to.
router.post(
  '/goals',
  authenticate,
  validate(createGoalSchema),
  requireTeamRoleIfSpecified(teamIdFromBody, WRITE_ROLES),
  asyncHandler(goalsController.createGoal)
);

router.get('/goals', authenticate, requireTeamRoleIfSpecified(teamIdFromQuery, READ_ROLES), asyncHandler(goalsController.getGoals));
router.get(
  '/goals/hierarchy',
  authenticate,
  requireTeamRoleIfSpecified(teamIdFromQuery, READ_ROLES),
  asyncHandler(goalsController.getGoalHierarchy)
);

// Previously unprotected -- any authenticated user could view, edit, or
// delete any goal by ID regardless of team membership or ownership.
router.get(
  '/goals/:goalId/progress',
  authenticate,
  validateUuidParams('goalId'),
  requireAccess((req) => goalsRepository.canAccessGoal(req.user!.userId, req.params.goalId), 'Access denied to this goal'),
  asyncHandler(goalsController.getGoalProgress)
);
router.put(
  '/goals/:goalId',
  authenticate,
  validateUuidParams('goalId'),
  requireAccess((req) => goalsRepository.canWriteGoal(req.user!.userId, req.params.goalId), 'Access denied to this goal'),
  validate(updateGoalSchema),
  asyncHandler(goalsController.updateGoal)
);
router.delete(
  '/goals/:goalId',
  authenticate,
  validateUuidParams('goalId'),
  requireAccess((req) => goalsRepository.canWriteGoal(req.user!.userId, req.params.goalId), 'Access denied to this goal'),
  asyncHandler(goalsController.deleteGoal)
);

export default router;
