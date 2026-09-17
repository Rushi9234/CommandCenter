import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate, validateUuidParams } from '../../common/middleware/validate';
import { requireAccess } from '../../common/middleware/requireAccess';
import { requireTeamRoleIfSpecified, teamIdFromBody, teamIdFromQuery } from '../../common/middleware/requireTeamRole';
import { goalsRepository } from './goals.repository';
import * as goalsController from './goals.controller';
import { createGoalSchema, updateGoalSchema, returnGoalSchema, submitReviewSchema } from './goals.dto';

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
router.get(
  '/goals/:goalId/evidence',
  authenticate,
  validateUuidParams('goalId'),
  requireAccess((req) => goalsRepository.canAccessGoal(req.user!.userId, req.params.goalId), 'Access denied to this goal'),
  asyncHandler(goalsController.getGoalEvidence)
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

// Review workflow -- any writer can submit; only a team leader (owner or
// admin of the goal's OWN team, per isTeamLeader) can approve or return.
router.post(
  '/goals/:goalId/submit-review',
  authenticate,
  validateUuidParams('goalId'),
  requireAccess((req) => goalsRepository.canWriteGoal(req.user!.userId, req.params.goalId), 'Access denied to this goal'),
  validate(submitReviewSchema),
  asyncHandler(goalsController.submitGoalForReview)
);
router.post(
  '/goals/:goalId/approve',
  authenticate,
  validateUuidParams('goalId'),
  requireAccess((req) => goalsRepository.isTeamLeader(req.user!.userId, req.params.goalId), 'Only a team owner or admin can approve goal completion'),
  asyncHandler(goalsController.approveGoal)
);
router.post(
  '/goals/:goalId/return',
  authenticate,
  validateUuidParams('goalId'),
  requireAccess((req) => goalsRepository.isTeamLeader(req.user!.userId, req.params.goalId), 'Only a team owner or admin can return a goal for changes'),
  validate(returnGoalSchema),
  asyncHandler(goalsController.returnGoal)
);

// Creation-governance workflow -- distinct from the completion-review
// endpoints above (/approve, /return govern completion; these two govern
// whether a proposed team goal becomes official at all). Same leadership
// gate (isTeamLeader -- owner/admin of the goal's own team) as the
// completion workflow: a normal member can never approve their own or
// anyone else's team-goal proposal, and a leader can only approve/reject
// proposals on their own team (isTeamLeader joins on the goal's team_id).
router.post(
  '/goals/:goalId/approve-creation',
  authenticate,
  validateUuidParams('goalId'),
  requireAccess((req) => goalsRepository.isTeamLeader(req.user!.userId, req.params.goalId), 'Only a team owner or admin can approve a team-goal proposal'),
  asyncHandler(goalsController.approveGoalCreation)
);
router.post(
  '/goals/:goalId/reject-creation',
  authenticate,
  validateUuidParams('goalId'),
  requireAccess((req) => goalsRepository.isTeamLeader(req.user!.userId, req.params.goalId), 'Only a team owner or admin can reject a team-goal proposal'),
  asyncHandler(goalsController.rejectGoalCreation)
);

export default router;
