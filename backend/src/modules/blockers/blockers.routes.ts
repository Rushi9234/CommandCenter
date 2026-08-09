import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate, validateUuidParams } from '../../common/middleware/validate';
import { requireAccess } from '../../common/middleware/requireAccess';
import { requireTeamRole, teamIdFromBody } from '../../common/middleware/requireTeamRole';
import { getRateLimitProvider } from '../../common/rateLimit/rateLimitProviderFactory';
import { blockersRepository } from './blockers.repository';
import { teamsRepository } from '../teams/teams.repository';
import * as blockersController from './blockers.controller';
import { createBlockerSchema, sendMessageSchema, updateBlockerSchema } from './blockers.dto';

// Milestone 5 review: viewer is documented as read-only, so it's excluded
// from creating blockers or posting messages (canWriteBlocker applies the
// same exclusion to update).
const WRITE_ROLES = ['owner', 'admin', 'manager', 'member'];

const router = Router();

// Blockers are always team-scoped (team_id is NOT NULL) -- unlike
// projects/goals, there's no "personal" case, so this is a required
// membership check, not the "if specified" variant. No check existed
// before; any authenticated user could create a blocker under any team.
router.post(
  '/blockers',
  authenticate,
  validate(createBlockerSchema),
  requireTeamRole(teamIdFromBody, WRITE_ROLES),
  asyncHandler(blockersController.createBlocker)
);

router.get(
  '/teams/:teamId/blockers',
  authenticate,
  validateUuidParams('teamId'),
  requireAccess((req) => teamsRepository.canAccessTeam(req.user!.userId, req.params.teamId), 'Access denied to this team'),
  asyncHandler(blockersController.getTeamBlockers)
);

// Previously unprotected -- any authenticated user could update a blocker,
// post messages to it, read its messages, or request AI advice on it by ID
// regardless of team membership.
router.put(
  '/blockers/:blockerId',
  authenticate,
  validateUuidParams('blockerId'),
  requireAccess((req) => blockersRepository.canWriteBlocker(req.user!.userId, req.params.blockerId), 'Access denied to this blocker'),
  validate(updateBlockerSchema),
  asyncHandler(blockersController.updateBlocker)
);
router.post(
  '/blockers/:blockerId/messages',
  authenticate,
  validateUuidParams('blockerId'),
  requireAccess((req) => blockersRepository.canWriteBlocker(req.user!.userId, req.params.blockerId), 'Access denied to this blocker'),
  validate(sendMessageSchema),
  asyncHandler(blockersController.sendMessage)
);
router.get(
  '/blockers/:blockerId/messages',
  authenticate,
  validateUuidParams('blockerId'),
  requireAccess((req) => blockersRepository.canAccessBlocker(req.user!.userId, req.params.blockerId), 'Access denied to this blocker'),
  asyncHandler(blockersController.getMessages)
);
// Milestone 42: same unrated, repeatable AI-provider-call shape closed
// for logs.routes.ts's suggestions/insights/standup this milestone --
// re-reading a blocker's AI advice has no natural cap the way creating a
// blocker does.
router.get(
  '/blockers/:blockerId/ai-advice',
  authenticate,
  getRateLimitProvider().createApiLimiter(),
  validateUuidParams('blockerId'),
  requireAccess((req) => blockersRepository.canAccessBlocker(req.user!.userId, req.params.blockerId), 'Access denied to this blocker'),
  asyncHandler(blockersController.getAIMentorAdvice)
);

export default router;
