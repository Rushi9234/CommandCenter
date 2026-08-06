import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { dbService } from '../services/databaseService';
import { sendTeamInviteEmail } from '../services/emailService';

export const createTeam = async (req: AuthRequest, res: Response) => {
  try {
    const { teamName, description, isPublic, maxTeamSize, parentTeamId, department, teamType } = req.body;
    const userId = req.user!.userId;

    if (!teamName) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const team = await dbService.createTeam({
      team_name: teamName,
      description: description || '',
      created_by: userId,
      is_public: isPublic !== false,
      is_discoverable: isPublic !== false,
      max_team_size: parseInt(maxTeamSize) || 10,
      parent_team_id: parentTeamId,
      department,
      team_type: teamType || 'main'
    });

    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      data: team,
    });
  } catch (error: any) {
    console.error('Create team error:', error);
    res.status(400).json({ error: error.message || 'Failed to create team' });
  }
};

export const getMyTeams = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const teams = await dbService.getUserTeams(userId);

    res.json({
      success: true,
      data: teams,
    });
  } catch (error: any) {
    console.error('Get teams error:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
};

export const getAllTeams = async (req: AuthRequest, res: Response) => {
  try {
    const teams = await dbService.getAllTeams();

    res.json({
      success: true,
      data: teams,
    });
  } catch (error: any) {
    console.error('Get all teams error:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
};

export const getTeamMembers = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.params;
    const userId = req.user!.userId;

    // For now, skip permission check - add later
    const members = await dbService.getTeamMembers(teamId);

    res.json({
      success: true,
      data: members,
    });
  } catch (error: any) {
    console.error('Get team members error:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
};

export const addMember = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.params;
    const { userId, role } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    await dbService.addTeamMember(teamId, userId, role || 'member');

    res.json({
      success: true,
      message: 'Member added successfully',
    });
  } catch (error: any) {
    console.error('Add member error:', error);
    res.status(400).json({ error: error.message || 'Failed to add member' });
  }
};

export const removeMember = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId, userId } = req.params;
    const requesterId = req.user!.userId;

    const isOwnerOrAdmin = await dbService.isTeamOwnerOrAdmin(requesterId, teamId);
    if (!isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only team owner or admin can remove members' });
    }

    await dbService.removeTeamMember(teamId, userId);

    res.json({
      success: true,
      message: 'Member removed successfully',
    });
  } catch (error: any) {
    console.error('Remove member error:', error);
    res.status(400).json({ error: 'Failed to remove member' });
  }
};

export const updateMemberRole = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId, userId } = req.params;
    const { role } = req.body;
    const requesterId = req.user!.userId;

    if (!role || !['admin', 'manager', 'member', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Valid role is required (admin, manager, member, or viewer)' });
    }

    const isOwnerOrAdmin = await dbService.isTeamOwnerOrAdmin(requesterId, teamId);
    if (!isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only team owner or admin can update roles' });
    }

    await dbService.updateMemberRole(teamId, userId, role);

    res.json({
      success: true,
      message: 'Member role updated successfully',
    });
  } catch (error: any) {
    console.error('Update member role error:', error);
    res.status(400).json({ error: 'Failed to update member role' });
  }
};

export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const users = await dbService.getAllUsers();

    res.json({
      success: true,
      data: users,
    });
  } catch (error: any) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const inviteMember = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.params;
    const { email } = req.body;
    const userId = req.user!.userId;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Get team and inviter details
    const team = await dbService.getTeam(teamId);
    const inviter = await dbService.getUserById(userId);
    
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check if user can invite (admin or owner)
    const members = await dbService.getTeamMembers(teamId);
    const userMember = members.find(m => m.user_id === userId);
    
    if (!userMember || (userMember.role !== 'admin' && userMember.role !== 'owner')) {
      return res.status(403).json({ error: 'Only admins can invite members' });
    }

    const invite = await dbService.createInvite(teamId, email, userId);

    // Send invitation email
    await sendTeamInviteEmail(email, team.team_name, inviter?.full_name || 'Team Member');

    res.json({
      success: true,
      message: 'Invitation sent successfully',
      data: invite,
    });
  } catch (error: any) {
    console.error('Invite member error:', error);
    res.status(400).json({ error: error.message || 'Failed to send invitation' });
  }
};

export const getMyInvites = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await dbService.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const invites = await dbService.getUserInvites(user.email);
    
    // Get team details for each invite
    const invitesWithTeams = await Promise.all(
      invites.map(async (invite) => {
        const team = await dbService.getTeam(invite.team_id);
        const inviter = await dbService.getUserById(invite.invited_by);
        return {
          ...invite,
          team,
          inviter: inviter ? {
            full_name: inviter.full_name,
            username: inviter.username,
          } : null,
        };
      })
    );

    res.json({
      success: true,
      data: invitesWithTeams,
    });
  } catch (error: any) {
    console.error('Get invites error:', error);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
};

export const acceptInvite = async (req: AuthRequest, res: Response) => {
  try {
    const { inviteId } = req.params;
    const userId = req.user!.userId;

    await dbService.acceptInvite(inviteId, userId);

    res.json({
      success: true,
      message: 'Invitation accepted',
    });
  } catch (error: any) {
    console.error('Accept invite error:', error);
    res.status(400).json({ error: error.message || 'Failed to accept invitation' });
  }
};

export const rejectInvite = async (req: AuthRequest, res: Response) => {
  try {
    const { inviteId } = req.params;

    await dbService.rejectInvite(inviteId);

    res.json({
      success: true,
      message: 'Invitation rejected',
    });
  } catch (error: any) {
    console.error('Reject invite error:', error);
    res.status(400).json({ error: 'Failed to reject invitation' });
  }
};

export const searchTeams = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const teams = await dbService.searchTeams(q as string);
    
    // Get owner details for each team
    const teamsWithOwners = await Promise.all(
      teams.map(async (team) => {
        const owner = await dbService.getUserById(team.created_by);
        const members = await dbService.getTeamMembers(team.team_id);
        return {
          ...team,
          owner: owner ? {
            full_name: owner.full_name,
            username: owner.username,
          } : null,
          member_count: members.length,
        };
      })
    );

    res.json({
      success: true,
      data: teamsWithOwners,
    });
  } catch (error: any) {
    console.error('Search teams error:', error);
    res.status(500).json({ error: 'Failed to search teams' });
  }
};

export const requestJoin = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.params;
    const userId = req.user!.userId;

    const request = await dbService.createJoinRequest(teamId, userId);

    res.json({
      success: true,
      message: 'Join request sent',
      data: request,
    });
  } catch (error: any) {
    console.error('Request join error:', error);
    res.status(400).json({ error: error.message || 'Failed to send join request' });
  }
};

export const getJoinRequests = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.params;
    const requests = await dbService.getTeamJoinRequests(teamId);
    
    const requestsWithUsers = await Promise.all(
      requests.map(async (request) => {
        const user = await dbService.getUserById(request.user_id);
        return {
          ...request,
          user: user ? {
            user_id: user.user_id,
            username: user.username,
            full_name: user.full_name,
            email: user.email,
          } : null,
        };
      })
    );

    res.json({
      success: true,
      data: requestsWithUsers,
    });
  } catch (error: any) {
    console.error('Get join requests error:', error);
    res.status(500).json({ error: 'Failed to fetch join requests' });
  }
};

export const approveJoinRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.params;
    await dbService.approveJoinRequest(requestId);

    res.json({
      success: true,
      message: 'Join request approved',
    });
  } catch (error: any) {
    console.error('Approve join request error:', error);
    res.status(400).json({ error: error.message || 'Failed to approve request' });
  }
};

export const rejectJoinRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.params;
    await dbService.rejectJoinRequest(requestId);

    res.json({
      success: true,
      message: 'Join request rejected',
    });
  } catch (error: any) {
    console.error('Reject join request error:', error);
    res.status(400).json({ error: 'Failed to reject request' });
  }
};

export const leaveTeam = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.params;
    const userId = req.user!.userId;

    await dbService.removeTeamMember(teamId, userId);

    res.json({
      success: true,
      message: 'Left team successfully',
    });
  } catch (error: any) {
    console.error('Leave team error:', error);
    res.status(400).json({ error: 'Failed to leave team' });
  }
};

export const updateTeamSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.params;
    const updates = req.body;
    const userId = req.user!.userId;

    const isOwnerOrAdmin = await dbService.isTeamOwnerOrAdmin(userId, teamId);
    if (!isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only team owner or admin can update settings' });
    }

    const team = await dbService.updateTeamSettings(teamId, updates);

    res.json({
      success: true,
      message: 'Team settings updated',
      data: team,
    });
  } catch (error: any) {
    console.error('Update team settings error:', error);
    res.status(400).json({ error: error.message || 'Failed to update team settings' });
  }
};

export const getSubTeams = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.params;
    const subTeams = await dbService.getSubTeams(teamId);

    res.json({
      success: true,
      data: subTeams,
    });
  } catch (error: any) {
    console.error('Get sub-teams error:', error);
    res.status(500).json({ error: 'Failed to fetch sub-teams' });
  }
};

export const getDepartments = async (req: AuthRequest, res: Response) => {
  try {
    const departments = await dbService.getDepartments();

    res.json({
      success: true,
      data: departments,
    });
  } catch (error: any) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
};

export const updateMemberPermissions = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId, userId } = req.params;
    const { permissions } = req.body;
    const requesterId = req.user!.userId;

    const isOwnerOrAdmin = await dbService.isTeamOwnerOrAdmin(requesterId, teamId);
    if (!isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only team owner or admin can update permissions' });
    }

    await dbService.updateMemberPermissions(teamId, userId, permissions);

    res.json({
      success: true,
      message: 'Member permissions updated successfully',
    });
  } catch (error: any) {
    console.error('Update member permissions error:', error);
    res.status(400).json({ error: 'Failed to update member permissions' });
  }
};
