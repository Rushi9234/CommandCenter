import { teamsRepository } from './teams.repository';
import { usersRepository } from '../users/users.repository';
import { sendTeamInviteEmail } from '../../services/emailService';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../common/errors';

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
    // For now, skip permission check - add later (preserved from the
    // original implementation; not in scope for this milestone).
    return teamsRepository.getTeamMembers(teamId);
  }

  async addMember(teamId: string, targetUserId: string, role?: string) {
    await teamsRepository.addTeamMember(teamId, targetUserId, role || 'member');
  }

  async removeMember(teamId: string, targetUserId: string, requesterId: string) {
    const isOwnerOrAdmin = await teamsRepository.isTeamOwnerOrAdmin(requesterId, teamId);
    if (!isOwnerOrAdmin) {
      throw new ForbiddenError('Only team owner or admin can remove members');
    }
    await teamsRepository.removeTeamMember(teamId, targetUserId);
  }

  async updateMemberRole(teamId: string, targetUserId: string, role: string, requesterId: string) {
    const isOwnerOrAdmin = await teamsRepository.isTeamOwnerOrAdmin(requesterId, teamId);
    if (!isOwnerOrAdmin) {
      throw new ForbiddenError('Only team owner or admin can update roles');
    }
    await teamsRepository.updateMemberRole(teamId, targetUserId, role);
  }

  getAllUsers() {
    return usersRepository.getAllUsers();
  }

  async inviteMember(teamId: string, email: string, userId: string) {
    const team = await teamsRepository.getTeam(teamId);
    const inviter = await usersRepository.getUserById(userId);

    if (!team) {
      throw new NotFoundError('Team not found');
    }

    const members = await teamsRepository.getTeamMembers(teamId);
    const userMember = members.find((m: any) => m.user_id === userId);

    if (!userMember || (userMember.role !== 'admin' && userMember.role !== 'owner')) {
      throw new ForbiddenError('Only admins can invite members');
    }

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

  async acceptInvite(inviteId: string, userId: string) {
    await teamsRepository.acceptInvite(inviteId, userId);
  }

  async rejectInvite(inviteId: string) {
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
    await teamsRepository.removeTeamMember(teamId, userId);
  }

  async updateTeamSettings(teamId: string, updates: Record<string, any>, userId: string) {
    const isOwnerOrAdmin = await teamsRepository.isTeamOwnerOrAdmin(userId, teamId);
    if (!isOwnerOrAdmin) {
      throw new ForbiddenError('Only team owner or admin can update settings');
    }
    return teamsRepository.updateTeamSettings(teamId, updates);
  }

  getSubTeams(teamId: string) {
    return teamsRepository.getSubTeams(teamId);
  }

  getDepartments() {
    return teamsRepository.getDepartments();
  }

  async updateMemberPermissions(teamId: string, targetUserId: string, permissions: any, requesterId: string) {
    const isOwnerOrAdmin = await teamsRepository.isTeamOwnerOrAdmin(requesterId, teamId);
    if (!isOwnerOrAdmin) {
      throw new ForbiddenError('Only team owner or admin can update permissions');
    }
    await teamsRepository.updateMemberPermissions(teamId, targetUserId, permissions);
  }
}

export const teamsService = new TeamsService();
