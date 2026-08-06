import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate } from '../../common/middleware/validate';
import { requireTeamRole, requireTeamMembership, teamIdFromParams } from '../../common/middleware/requireTeamRole';
import { teamsRepository } from './teams.repository';
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

// Resolves the team a join request belongs to, so requireTeamRole can check
// the caller's role in THAT team, not a team ID that isn't in the URL.
const teamIdFromJoinRequest = async (req: any) => {
  const request = await teamsRepository.getJoinRequestById(req.params.requestId);
  return request?.team_id || null;
};

router.post('/teams', authenticate, validate(createTeamSchema), asyncHandler(teamsController.createTeam));
router.get('/teams', authenticate, asyncHandler(teamsController.getAllTeams));
router.get('/teams/my', authenticate, asyncHandler(teamsController.getMyTeams));
router.get('/teams/search', authenticate, validate(searchTeamsQuerySchema, 'query'), asyncHandler(teamsController.searchTeams));
router.get('/teams/departments', authenticate, asyncHandler(teamsController.getDepartments));

// Any team member can view the roster and sub-teams -- membership only, no
// role tier required.
router.get(
  '/teams/:teamId/members',
  authenticate,
  requireTeamMembership(teamIdFromParams),
  asyncHandler(teamsController.getTeamMembers)
);
router.get('/teams/:teamId/sub-teams', authenticate, asyncHandler(teamsController.getSubTeams));

// Team-management actions: owner or admin only. Previously addMember had no
// check at all; the rest replace the ad-hoc isTeamOwnerOrAdmin calls that
// used to live inline in teams.service.ts.
router.post(
  '/teams/:teamId/members',
  authenticate,
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  validate(addMemberSchema),
  asyncHandler(teamsController.addMember)
);
router.post(
  '/teams/:teamId/invite',
  authenticate,
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  validate(inviteMemberSchema),
  asyncHandler(teamsController.inviteMember)
);
router.post('/teams/:teamId/join', authenticate, asyncHandler(teamsController.requestJoin));

// Previously unprotected -- any authenticated user could view any team's
// pending join requests or approve/reject them.
router.get(
  '/teams/:teamId/join-requests',
  authenticate,
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  asyncHandler(teamsController.getJoinRequests)
);

router.post('/teams/:teamId/leave', authenticate, asyncHandler(teamsController.leaveTeam));
router.put(
  '/teams/:teamId/settings',
  authenticate,
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  validate(updateTeamSettingsSchema),
  asyncHandler(teamsController.updateTeamSettings)
);
router.delete(
  '/teams/:teamId/members/:userId',
  authenticate,
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  asyncHandler(teamsController.removeMember)
);
router.put(
  '/teams/:teamId/members/:userId/role',
  authenticate,
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  validate(updateMemberRoleSchema),
  asyncHandler(teamsController.updateMemberRole)
);
router.put(
  '/teams/:teamId/members/:userId/permissions',
  authenticate,
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  validate(updateMemberPermissionsSchema),
  asyncHandler(teamsController.updateMemberPermissions)
);

// Previously unprotected -- any authenticated user could approve/reject any
// team's join requests, admitting themselves or anyone else.
router.post(
  '/join-requests/:requestId/approve',
  authenticate,
  requireTeamRole(teamIdFromJoinRequest, ['owner', 'admin']),
  asyncHandler(teamsController.approveJoinRequest)
);
router.post(
  '/join-requests/:requestId/reject',
  authenticate,
  requireTeamRole(teamIdFromJoinRequest, ['owner', 'admin']),
  asyncHandler(teamsController.rejectJoinRequest)
);

router.get('/invites/my', authenticate, asyncHandler(teamsController.getMyInvites));
router.post('/invites/:inviteId/accept', authenticate, asyncHandler(teamsController.acceptInvite));
router.post('/invites/:inviteId/reject', authenticate, asyncHandler(teamsController.rejectInvite));

export default router;
