import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate } from '../../common/middleware/validate';
import { requireAccess } from '../../common/middleware/requireAccess';
import { requireTeamRole, teamIdFromBody } from '../../common/middleware/requireTeamRole';
import { blockersRepository } from './blockers.repository';
import { teamsRepository } from '../teams/teams.repository';
import * as blockersController from './blockers.controller';
import { createBlockerSchema, sendMessageSchema, updateBlockerSchema } from './blockers.dto';

const ALL_ROLES = ['owner', 'admin', 'manager', 'member', 'viewer'];

const router = Router();

// Blockers are always team-scoped (team_id is NOT NULL) -- unlike
// projects/goals, there's no "personal" case, so this is a required
// membership check, not the "if specified" variant. No check existed
// before; any authenticated user could create a blocker under any team.
router.post(
  '/blockers',
  authenticate,
  validate(createBlockerSchema),
  requireTeamRole(teamIdFromBody, ALL_ROLES),
  asyncHandler(blockersController.createBlocker)
);

router.get(
  '/teams/:teamId/blockers',
  authenticate,
  requireAccess((req) => teamsRepository.canAccessTeam(req.user!.userId, req.params.teamId), 'Access denied to this team'),
  asyncHandler(blockersController.getTeamBlockers)
);

// Previously unprotected -- any authenticated user could update a blocker,
// post messages to it, read its messages, or request AI advice on it by ID
// regardless of team membership.
router.put(
  '/blockers/:blockerId',
  authenticate,
  requireAccess((req) => blockersRepository.canAccessBlocker(req.user!.userId, req.params.blockerId), 'Access denied to this blocker'),
  validate(updateBlockerSchema),
  asyncHandler(blockersController.updateBlocker)
);
router.post(
  '/blockers/:blockerId/messages',
  authenticate,
  requireAccess((req) => blockersRepository.canAccessBlocker(req.user!.userId, req.params.blockerId), 'Access denied to this blocker'),
  validate(sendMessageSchema),
  asyncHandler(blockersController.sendMessage)
);
router.get(
  '/blockers/:blockerId/messages',
  authenticate,
  requireAccess((req) => blockersRepository.canAccessBlocker(req.user!.userId, req.params.blockerId), 'Access denied to this blocker'),
  asyncHandler(blockersController.getMessages)
);
router.get(
  '/blockers/:blockerId/ai-advice',
  authenticate,
  requireAccess((req) => blockersRepository.canAccessBlocker(req.user!.userId, req.params.blockerId), 'Access denied to this blocker'),
  asyncHandler(blockersController.getAIMentorAdvice)
);

export default router;
