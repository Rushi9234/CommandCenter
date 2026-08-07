import { teamsRepository } from './teams.repository';
import { usersRepository } from '../users/users.repository';
import { sendTeamInviteEmail } from '../../services/emailService';
import { ForbiddenError, NotFoundError } from '../../common/errors';

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
  // already enforce, and checks it before the repository call since the
  // upsert would otherwise apply unconditionally.
  async addMember(teamId: string, targetUserId: string, role: string | undefined, requesterRole: string) {
    const targetRole = await teamsRepository.getMemberRole(targetUserId, teamId);

    if (targetRole === 'owner') {
      throw new ForbiddenError("The team owner's role cannot be changed");
    }
    if (targetRole === 'admin' && requesterRole !== 'owner') {
      throw new ForbiddenError("Only the team owner can change an admin's role");
    }

    await teamsRepository.addTeamMember(teamId, targetUserId, role || 'member');
  }

  // Milestone 5: the base "is the caller owner/admin at all" gate moved to
  // requireTeamRole (teams.routes.ts). What's left here is the hierarchy
  // rule middleware can't express generically: an admin cannot remove the
  // owner or another admin -- only the owner can. Nothing enforced this
  // before; any admin could remove any other admin, including demoting the
  // team down to zero admins.
  async removeMember(teamId: string, targetUserId: string, requesterRole: string) {
    const targetRole = await teamsRepository.getMemberRole(targetUserId, teamId);

    if (targetRole === 'owner') {
      throw new ForbiddenError('The team owner cannot be removed');
    }
    if (targetRole === 'admin' && requesterRole !== 'owner') {
      throw new ForbiddenError('Only the team owner can remove an admin');
    }

    await teamsRepository.removeTeamMember(teamId, targetUserId);
  }

  async updateMemberRole(teamId: string, targetUserId: string, role: string, requesterRole: string) {
    const targetRole = await teamsRepository.getMemberRole(targetUserId, teamId);

    if (targetRole === 'owner') {
      throw new ForbiddenError("The team owner's role cannot be changed");
    }
    if (targetRole === 'admin' && requesterRole !== 'owner') {
      throw new ForbiddenError("Only the team owner can change an admin's role");
    }

    await teamsRepository.updateMemberRole(teamId, targetUserId, role);
  }

  getAllUsers() {
    return usersRepository.getAllUsers();
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

    const inviter = await usersRepository.getUserById(userId);
    const invite = await teamsRepository.createInvite(teamId, email, userId);
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
    await teamsRepository.acceptInvite(inviteId, userId);
  }

  async rejectInvite(inviteId: string, userId: string) {
    await this.assertInviteBelongsToCaller(inviteId, userId);
    await teamsRepository.rejectInvite(inviteId);
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

  requestJoin(teamId: string, userId: string) {
    return teamsRepository.createJoinRequest(teamId, userId);
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

  async approveJoinRequest(requestId: string) {
    await teamsRepository.approveJoinRequest(requestId);
  }

  async rejectJoinRequest(requestId: string) {
    await teamsRepository.rejectJoinRequest(requestId);
  }

  async leaveTeam(teamId: string, userId: string) {
    const role = await teamsRepository.getMemberRole(userId, teamId);
    if (role === 'owner') {
      throw new ForbiddenError('The team owner cannot leave the team');
    }
    await teamsRepository.removeTeamMember(teamId, userId);
  }

  // Milestone 5: base gate moved to requireTeamRole.
  updateTeamSettings(teamId: string, updates: Record<string, any>) {
    return teamsRepository.updateTeamSettings(teamId, updates);
  }

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
