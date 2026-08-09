import { teamsRepository } from './teams.repository';
import { usersRepository } from '../users/users.repository';
import { sendTeamInviteEmail } from '../../services/emailService';
import { ForbiddenError, NotFoundError, BadRequestError, ConflictError } from '../../common/errors';

export class TeamsService {
  createTeam(userId: string, body: any) {
    return teamsRepository.createTeam({
      team_name: body.teamName,
      description: body.description || '',
      created_by: userId,
      is_public: body.isPublic !== false,
      is_discoverable: body.isPublic !== false,
      max_team_size: parseInt(body.maxTeamSize) || 10,
      parent_team_id: body.parentTeamId,
      department: body.department,
      team_type: body.teamType || 'main',
    });
  }

  getMyTeams(userId: string) {
    return teamsRepository.getUserTeams(userId);
  }

  getAllTeams() {
    return teamsRepository.getAllTeams();
  }

  getTeamMembers(teamId: string) {
    // Milestone 5: this used to run with no permission check at all (the
    // original code's own comment said "skip permission check - add
    // later"). Membership is now enforced by requireTeamMembership in
    // teams.routes.ts before this ever runs.
    return teamsRepository.getTeamMembers(teamId);
  }

  // Milestone 27: addMemberSchema now rejects role: 'owner' at validation,
  // but addTeamMember's ON CONFLICT ... DO UPDATE means this endpoint can
  // also silently overwrite an *existing* member's role -- including the
  // real owner's, or another admin's, if the target is already on the
  // team. Applies the same hierarchy rule removeMember/updateMemberRole
  // already enforce.
  //
  // Milestone 36: the hierarchy check used to be a separate getMemberRole
  // read followed by a separate write, with a TOCTOU gap between them --
  // a concurrent role change on the target could land in that gap and
  // make this decision on stale data. addTeamMemberIfAuthorized folds the
  // check into the same atomic statement that performs the write; if it
  // reports no row changed, a plain (now-current) read is used only to
  // pick the right error message, never to gate anything.
  async addMember(teamId: string, targetUserId: string, role: string | undefined, requesterRole: string) {
    const result = await teamsRepository.addTeamMemberIfAuthorized(teamId, targetUserId, role || 'member', requesterRole);
    if (result) {
      return;
    }

    const targetRole = await teamsRepository.getMemberRole(targetUserId, teamId);
    if (targetRole === 'owner') {
      throw new ForbiddenError("The team owner's role cannot be changed");
    }
    if (targetRole === 'admin') {
      throw new ForbiddenError("Only the team owner can change an admin's role");
    }
  }

  // Milestone 5: the base "is the caller owner/admin at all" gate moved to
  // requireTeamRole (teams.routes.ts). What's left here is the hierarchy
  // rule middleware can't express generically: an admin cannot remove the
  // owner or another admin -- only the owner can. Nothing enforced this
  // before; any admin could remove any other admin, including demoting the
  // team down to zero admins.
  //
  // Milestone 36: same TOCTOU fix as addMember above -- removeTeamMemberIfAuthorized
  // re-checks the target's role as part of the same atomic DELETE, closing
  // the gap between the old separate read and the old separate delete.
  // Milestone 40: the removal delete and the stale-invite revocation now
  // run in one transaction (teamsRepository.removeMemberAndInvalidateInvites)
  // instead of two separate calls -- see that method's comment for the
  // partial-failure window this closes. The target's email is looked up
  // first (a plain read, no side effect) only so it's available to pass
  // into the transaction; when the target user row itself doesn't exist
  // (a stale/foreign ID), there's no email to revoke invites for and the
  // plain conditional delete alone is both correct and sufficient, same
  // as it was before this milestone.
  async removeMember(teamId: string, targetUserId: string, requesterRole: string) {
    const targetUser = await usersRepository.getUserById(targetUserId);
    const removed = targetUser
      ? await teamsRepository.removeMemberAndInvalidateInvites(teamId, targetUserId, requesterRole, targetUser.email)
      : await teamsRepository.removeTeamMemberIfAuthorized(teamId, targetUserId, requesterRole);
    if (removed) {
      return;
    }

    const targetRole = await teamsRepository.getMemberRole(targetUserId, teamId);
    if (targetRole === 'owner') {
      throw new ForbiddenError('The team owner cannot be removed');
    }
    if (targetRole === 'admin') {
      throw new ForbiddenError('Only the team owner can remove an admin');
    }
    // Neither -- target simply isn't a member (matches the pre-Milestone-36
    // behavior of a no-op delete on a nonexistent row: succeed silently).
  }

  // Milestone 36: same TOCTOU fix as removeMember/addMember above.
  async updateMemberRole(teamId: string, targetUserId: string, role: string, requesterRole: string) {
    const result = await teamsRepository.updateMemberRoleIfAuthorized(teamId, targetUserId, role, requesterRole);
    if (result) {
      return;
    }

    const targetRole = await teamsRepository.getMemberRole(targetUserId, teamId);
    if (targetRole === 'owner') {
      throw new ForbiddenError("The team owner's role cannot be changed");
    }
    if (targetRole === 'admin') {
      throw new ForbiddenError("Only the team owner can change an admin's role");
    }
    // Neither -- target simply isn't a member (matches pre-Milestone-36
    // behavior: a no-op update on a nonexistent row succeeds silently).
  }

  // Milestone 5: the base "is the caller owner/admin" gate moved to
  // requireTeamRole. Membership lookup for that gate already proves the
  // caller is an admin/owner, so the manual re-check that used to live
  // here (fetching the member list and searching for the caller) is gone --
  // it was duplicate logic doing the same job the middleware now does once.
  async inviteMember(teamId: string, email: string, userId: string) {
    const team = await teamsRepository.getTeam(teamId);
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    const invite = await teamsRepository.createInvite(teamId, email, userId);
    if (!invite) {
      // Milestone 40: createInvite's ON CONFLICT DO NOTHING (backed by the
      // new partial unique index) returns no row when a pending invite for
      // this exact team+email already exists -- surfaced as a clean 409
      // rather than silently no-op-ing (which would otherwise look like
      // success while sending no email) or letting a duplicate row and a
      // duplicate email both go out.
      throw new ConflictError('An invite is already pending for this email on this team');
    }

    const inviter = await usersRepository.getUserById(userId);
    await sendTeamInviteEmail(email, team.team_name, inviter?.full_name || 'Team Member');

    return invite;
  }

  async getMyInvites(userId: string) {
    const user = await usersRepository.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const invites = await teamsRepository.getUserInvites(user.email);

    return Promise.all(
      invites.map(async (invite: any) => {
        const team = await teamsRepository.getTeam(invite.team_id);
        const inviter = await usersRepository.getUserById(invite.invited_by);
        return {
          ...invite,
          team,
          inviter: inviter ? { full_name: inviter.full_name, username: inviter.username } : null,
        };
      })
    );
  }

  // Milestone 5: previously accepted ANY pending invite by ID regardless of
  // who was calling -- an authenticated user who learned or guessed an
  // inviteId belonging to someone else could join a team they were never
  // invited to. Now verifies the invite's email matches the caller's own
  // email before accepting.
  // Shared by accept/reject -- pulled out after an independent review found
  // the same five lines duplicated in both methods.
  private async assertInviteBelongsToCaller(inviteId: string, userId: string): Promise<void> {
    const user = await usersRepository.getUserById(userId);
    const invites = user ? await teamsRepository.getUserInvites(user.email) : [];
    const matchesCaller = invites.some((invite: any) => invite.invite_id === inviteId);

    if (!matchesCaller) {
      throw new ForbiddenError('This invitation was not sent to you');
    }
  }

  async acceptInvite(inviteId: string, userId: string) {
    await this.assertInviteBelongsToCaller(inviteId, userId);
    const accepted = await teamsRepository.acceptInvite(inviteId, userId);
    if (!accepted) {
      // Milestone 39: the invite was pending when assertInviteBelongsToCaller
      // checked (moments ago), but the atomic conditional-UPDATE in
      // acceptInvite found it no longer pending -- already used, or
      // revoked by an in-between removeMember/leaveTeam. Either way,
      // membership was never inserted; this is a real error, not a
      // silent no-op.
      throw new BadRequestError('This invitation is no longer valid');
    }
  }

  // Milestone 43: rejectInvite's own repository call is now the same
  // atomic conditional UPDATE as acceptInvite (WHERE status='pending') --
  // a null result means the invite was already accepted/rejected/revoked
  // by the time this write ran (e.g. a concurrent accept), and must be a
  // real error, not a silent status flip.
  async rejectInvite(inviteId: string, userId: string) {
    await this.assertInviteBelongsToCaller(inviteId, userId);
    const rejected = await teamsRepository.rejectInvite(inviteId);
    if (!rejected) {
      throw new BadRequestError('This invitation is no longer valid');
    }
  }

  async searchTeams(searchQuery: string) {
    const teams = await teamsRepository.searchTeams(searchQuery);

    return Promise.all(
      teams.map(async (team: any) => {
        const owner = await usersRepository.getUserById(team.created_by);
        const members = await teamsRepository.getTeamMembers(team.team_id);
        return {
          ...team,
          owner: owner ? { full_name: owner.full_name, username: owner.username } : null,
          member_count: members.length,
        };
      })
    );
  }

  // Milestone 40: same fix as inviteMember above -- createJoinRequest's
  // ON CONFLICT DO NOTHING returns no row when this caller already has a
  // pending join request for this team, surfaced as a clean 409 instead
  // of a silent no-op or a duplicate row an admin would see twice.
  async requestJoin(teamId: string, userId: string) {
    const joinRequest = await teamsRepository.createJoinRequest(teamId, userId);
    if (!joinRequest) {
      throw new ConflictError('A join request is already pending for this team');
    }
    return joinRequest;
  }

  async getJoinRequests(teamId: string) {
    const requests = await teamsRepository.getTeamJoinRequests(teamId);

    return Promise.all(
      requests.map(async (request: any) => {
        const user = await usersRepository.getUserById(request.user_id);
        return {
          ...request,
          user: user
            ? { user_id: user.user_id, username: user.username, full_name: user.full_name, email: user.email }
            : null,
        };
      })
    );
  }

  // Milestone 43: both approveJoinRequest/rejectJoinRequest's repository
  // calls now guard on status = 'pending' (same pattern as acceptInvite/
  // rejectInvite) -- a null result means the request was already
  // approved/rejected by the time this write ran, and must be a real
  // error rather than silently re-processing (or, for reject, silently
  // flipping an already-approved request's status back with no effect
  // on the membership that approval already granted).
  async approveJoinRequest(requestId: string) {
    const approved = await teamsRepository.approveJoinRequest(requestId);
    if (!approved) {
      throw new BadRequestError('This join request has already been processed');
    }
  }

  async rejectJoinRequest(requestId: string) {
    const rejected = await teamsRepository.rejectJoinRequest(requestId);
    if (!rejected) {
      throw new BadRequestError('This join request has already been processed');
    }
  }

  // Milestone 40: same atomicity fix as removeMember above -- the leave
  // delete and the stale-invite revocation are now one transaction
  // (teamsRepository.leaveTeamAndInvalidateInvites).
  async leaveTeam(teamId: string, userId: string) {
    const role = await teamsRepository.getMemberRole(userId, teamId);
    if (role === 'owner') {
      throw new ForbiddenError('The team owner cannot leave the team');
    }
    const user = await usersRepository.getUserById(userId);
    if (user) {
      await teamsRepository.leaveTeamAndInvalidateInvites(teamId, userId, user.email);
    } else {
      await teamsRepository.removeTeamMember(teamId, userId);
    }
  }

  // Milestone 5: base gate moved to requireTeamRole.
  updateTeamSettings(teamId: string, updates: Record<string, any>) {
    return teamsRepository.updateTeamSettings(teamId, updates);
  }

  // Milestone 37: membership is enforced by requireTeamMembership in
  // teams.routes.ts before this ever runs, same as getTeamMembers above.
  getSubTeams(teamId: string) {
    return teamsRepository.getSubTeams(teamId);
  }

  getDepartments() {
    return teamsRepository.getDepartments();
  }

  // Milestone 5: base gate moved to requireTeamRole.
  async updateMemberPermissions(teamId: string, targetUserId: string, permissions: any) {
    await teamsRepository.updateMemberPermissions(teamId, targetUserId, permissions);
  }
}

export const teamsService = new TeamsService();
