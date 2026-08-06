import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate } from '../../common/middleware/validate';
import * as teamsController from './teams.controller';
import {
  createTeamSchema,
  addMemberSchema,
  updateMemberRoleSchema,
  updateMemberPermissionsSchema,
  inviteMemberSchema,
  searchTeamsQuerySchema,
  updateTeamSettingsSchema,
} from './teams.dto';

// Mounted at the API root (not under /teams) so it can also own /invites/*
// and /join-requests/*, exactly matching the flat path list the old
// monolithic router used.
const router = Router();

router.post('/teams', authenticate, validate(createTeamSchema), asyncHandler(teamsController.createTeam));
router.get('/teams', authenticate, asyncHandler(teamsController.getAllTeams));
router.get('/teams/my', authenticate, asyncHandler(teamsController.getMyTeams));
router.get('/teams/search', authenticate, validate(searchTeamsQuerySchema, 'query'), asyncHandler(teamsController.searchTeams));
router.get('/teams/departments', authenticate, asyncHandler(teamsController.getDepartments));
router.get('/teams/:teamId/members', authenticate, asyncHandler(teamsController.getTeamMembers));
router.get('/teams/:teamId/sub-teams', authenticate, asyncHandler(teamsController.getSubTeams));
router.post('/teams/:teamId/members', authenticate, validate(addMemberSchema), asyncHandler(teamsController.addMember));
router.post('/teams/:teamId/invite', authenticate, validate(inviteMemberSchema), asyncHandler(teamsController.inviteMember));
router.post('/teams/:teamId/join', authenticate, asyncHandler(teamsController.requestJoin));
router.get('/teams/:teamId/join-requests', authenticate, asyncHandler(teamsController.getJoinRequests));
router.post('/teams/:teamId/leave', authenticate, asyncHandler(teamsController.leaveTeam));
router.put(
  '/teams/:teamId/settings',
  authenticate,
  validate(updateTeamSettingsSchema),
  asyncHandler(teamsController.updateTeamSettings)
);
router.delete('/teams/:teamId/members/:userId', authenticate, asyncHandler(teamsController.removeMember));
router.put(
  '/teams/:teamId/members/:userId/role',
  authenticate,
  validate(updateMemberRoleSchema),
  asyncHandler(teamsController.updateMemberRole)
);
router.put(
  '/teams/:teamId/members/:userId/permissions',
  authenticate,
  validate(updateMemberPermissionsSchema),
  asyncHandler(teamsController.updateMemberPermissions)
);
router.post('/join-requests/:requestId/approve', authenticate, asyncHandler(teamsController.approveJoinRequest));
router.post('/join-requests/:requestId/reject', authenticate, asyncHandler(teamsController.rejectJoinRequest));
router.get('/invites/my', authenticate, asyncHandler(teamsController.getMyInvites));
router.post('/invites/:inviteId/accept', authenticate, asyncHandler(teamsController.acceptInvite));
router.post('/invites/:inviteId/reject', authenticate, asyncHandler(teamsController.rejectInvite));

export default router;
