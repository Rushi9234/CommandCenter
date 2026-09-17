import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validateUuidParams } from '../../common/middleware/validate';
import { requireAccess } from '../../common/middleware/requireAccess';
import { teamsRepository } from '../teams/teams.repository';
import * as attentionController from './attention.controller';

const router = Router();

// Individual Scope Attention / Action Center
router.get(
  '/attention/me',
  authenticate,
  asyncHandler(attentionController.getIndividualAttention)
);

// Team Scope Attention / Action Center
router.get(
  '/teams/:teamId/attention',
  authenticate,
  validateUuidParams('teamId'),
  requireAccess(
    (req) => teamsRepository.canAccessTeam(req.user!.userId, req.params.teamId),
    'Access denied to this team attention data'
  ),
  asyncHandler(attentionController.getTeamAttention)
);

router.get(
  '/attention/teams/:teamId',
  authenticate,
  validateUuidParams('teamId'),
  requireAccess(
    (req) => teamsRepository.canAccessTeam(req.user!.userId, req.params.teamId),
    'Access denied to this team attention data'
  ),
  asyncHandler(attentionController.getTeamAttention)
);

// Classroom Scope Attention / Action Center
router.get(
  '/attention/classrooms/:teamId',
  authenticate,
  validateUuidParams('teamId'),
  requireAccess(
    async (req) => {
      const role = await teamsRepository.getMemberRole(req.user!.userId, req.params.teamId);
      return role === 'owner' || role === 'admin';
    },
    'Access denied to classroom coordinator attention data'
  ),
  asyncHandler(attentionController.getClassroomAttention)
);


export default router;
