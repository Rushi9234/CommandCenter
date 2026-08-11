import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate, validateUuidParams } from '../../common/middleware/validate';
import {
  requireTeamRole,
  requireTeamRoleIfSpecified,
  requireTeamMembership,
  teamIdFromParams,
  parentTeamIdFromBody,
  parentTeamIdFromCreateBody,
} from '../../common/middleware/requireTeamRole';
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

// Milestone 42: PUT /teams/:teamId/settings has always guarded a
// client-supplied parent_team_id via requireTeamRoleIfSpecified (M35) --
// this sibling create route never got the same guard, so any
// authenticated user could create a new team nested under an arbitrary
// EXISTING team (including one they have no access to at all) just by
// naming its ID, the same cross-reference-authorization class M29/M30/M35
// already closed elsewhere, missed here on the create path.
router.post(
  '/teams',
  authenticate,
  validate(createTeamSchema),
  requireTeamRoleIfSpecified(parentTeamIdFromCreateBody, ['owner', 'admin']),
  asyncHandler(teamsController.createTeam)
);
router.get('/teams', authenticate, asyncHandler(teamsController.getAllTeams));
router.get('/teams/my', authenticate, asyncHandler(teamsController.getMyTeams));
router.get('/teams/search', authenticate, validate(searchTeamsQuerySchema, 'query'), asyncHandler(teamsController.searchTeams));
router.get('/teams/departments', authenticate, asyncHandler(teamsController.getDepartments));

// Any team member can view the roster and sub-teams -- membership only, no
// role tier required.
router.get(
  '/teams/:teamId/members',
  authenticate,
  validateUuidParams('teamId'),
  requireTeamMembership(teamIdFromParams),
  asyncHandler(teamsController.getTeamMembers)
);
// Milestone 37: this route's own comment above always documented
// "membership only, no role tier required" for BOTH /members and
// /sub-teams -- /members got requireTeamMembership, this one never did,
// letting any authenticated user retrieve any team's sub-team hierarchy
// (names, descriptions, department, is_public/is_discoverable, etc.) just
// by knowing or guessing its team_id, with no proof of membership at all.
// getAllTeams/searchTeams's separate is_public+is_discoverable filter is
// a different feature (browsing/discovering teams you're NOT a member
// of) and deliberately doesn't apply here -- this endpoint answers "what
// are THIS team's sub-teams," the same membership-gated shape as
// /members, not "what teams can anyone discover."
router.get(
  '/teams/:teamId/sub-teams',
  authenticate,
  validateUuidParams('teamId'),
  requireTeamMembership(teamIdFromParams),
  asyncHandler(teamsController.getSubTeams)
);

// Team-management actions: owner or admin only. Previously addMember had no
// check at all; the rest replace the ad-hoc isTeamOwnerOrAdmin calls that
// used to live inline in teams.service.ts.
router.post(
  '/teams/:teamId/members',
  authenticate,
  validateUuidParams('teamId'),
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  validate(addMemberSchema),
  asyncHandler(teamsController.addMember)
);
router.post(
  '/teams/:teamId/invite',
  authenticate,
  validateUuidParams('teamId'),
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  validate(inviteMemberSchema),
  asyncHandler(teamsController.inviteMember)
);
// Milestone 48: deliberately no requireTeamMembership/requireTeamRole and
// no is_public/is_discoverable check -- see getTeamPreview's own comment
// for why this doesn't create new exposure (requestJoin below already
// accepts any team_id with no such gate; this just lets the caller see a
// few safe fields about it first instead of joining blind).
router.get('/teams/:teamId/preview', authenticate, validateUuidParams('teamId'), asyncHandler(teamsController.getTeamPreview));
router.post('/teams/:teamId/join', authenticate, validateUuidParams('teamId'), asyncHandler(teamsController.requestJoin));

// Previously unprotected -- any authenticated user could view any team's
// pending join requests or approve/reject them.
router.get(
  '/teams/:teamId/join-requests',
  authenticate,
  validateUuidParams('teamId'),
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  asyncHandler(teamsController.getJoinRequests)
);

router.post('/teams/:teamId/leave', authenticate, validateUuidParams('teamId'), asyncHandler(teamsController.leaveTeam));
// Milestone 35: if the caller names a parent_team_id, they must actually
// have owner/admin access to THAT team too -- no check existed before,
// so any team's owner/admin could re-parent their team under one they
// have no access to, just by naming that team's ID (the same "unchecked
// cross-reference" class M29/M30 already closed for other modules).
router.put(
  '/teams/:teamId/settings',
  authenticate,
  validateUuidParams('teamId'),
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  validate(updateTeamSettingsSchema),
  requireTeamRoleIfSpecified(parentTeamIdFromBody, ['owner', 'admin']),
  asyncHandler(teamsController.updateTeamSettings)
);
router.delete(
  '/teams/:teamId/members/:userId',
  authenticate,
  validateUuidParams('teamId', 'userId'),
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  asyncHandler(teamsController.removeMember)
);
router.put(
  '/teams/:teamId/members/:userId/role',
  authenticate,
  validateUuidParams('teamId', 'userId'),
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  validate(updateMemberRoleSchema),
  asyncHandler(teamsController.updateMemberRole)
);
router.put(
  '/teams/:teamId/members/:userId/permissions',
  authenticate,
  validateUuidParams('teamId', 'userId'),
  requireTeamRole(teamIdFromParams, ['owner', 'admin']),
  validate(updateMemberPermissionsSchema),
  asyncHandler(teamsController.updateMemberPermissions)
);

// Previously unprotected -- any authenticated user could approve/reject any
// team's join requests, admitting themselves or anyone else.
router.post(
  '/join-requests/:requestId/approve',
  authenticate,
  validateUuidParams('requestId'),
  requireTeamRole(teamIdFromJoinRequest, ['owner', 'admin']),
  asyncHandler(teamsController.approveJoinRequest)
);
router.post(
  '/join-requests/:requestId/reject',
  authenticate,
  validateUuidParams('requestId'),
  requireTeamRole(teamIdFromJoinRequest, ['owner', 'admin']),
  asyncHandler(teamsController.rejectJoinRequest)
);

router.get('/invites/my', authenticate, asyncHandler(teamsController.getMyInvites));
// Milestone 50: self-scoped (WHERE user_id = caller) -- no membership or
// role gate needed, the same shape /invites/my already uses for the
// identical "my own pending action, not a team's" question.
router.get('/join-requests/my', authenticate, asyncHandler(teamsController.getMyJoinRequests));
router.post('/invites/:inviteId/accept', authenticate, validateUuidParams('inviteId'), asyncHandler(teamsController.acceptInvite));
router.post('/invites/:inviteId/reject', authenticate, validateUuidParams('inviteId'), asyncHandler(teamsController.rejectInvite));

export default router;
