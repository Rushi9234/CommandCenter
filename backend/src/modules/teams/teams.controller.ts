import { Response } from 'express';
import { TeamRoleRequest } from '../../common/middleware/requireTeamRole';
import { ok, created } from '../../common/http/respond';
import { teamsService } from './teams.service';
type AuthRequest = TeamRoleRequest;

export const createTeam = async (req: AuthRequest, res: Response) => {
  const team = await teamsService.createTeam(req.user!.userId, req.body);
  created(res, team, 'Team created successfully');
};

export const getMyTeams = async (req: AuthRequest, res: Response) => {
  const teams = await teamsService.getMyTeams(req.user!.userId);
  ok(res, teams);
};

export const getAllTeams = async (req: AuthRequest, res: Response) => {
  const teams = await teamsService.getAllTeams();
  ok(res, teams);
};

export const getTeamMembers = async (req: AuthRequest, res: Response) => {
  const members = await teamsService.getTeamMembers(req.params.teamId);
  ok(res, members);
};

export const addMember = async (req: AuthRequest, res: Response) => {
  await teamsService.addMember(req.params.teamId, req.body.userId, req.body.role);
  ok(res, undefined, 'Member added successfully');
};

export const removeMember = async (req: AuthRequest, res: Response) => {
  await teamsService.removeMember(req.params.teamId, req.params.userId, req.teamRole!);
  ok(res, undefined, 'Member removed successfully');
};

export const updateMemberRole = async (req: AuthRequest, res: Response) => {
  await teamsService.updateMemberRole(req.params.teamId, req.params.userId, req.body.role, req.teamRole!);
  ok(res, undefined, 'Member role updated successfully');
};

export const inviteMember = async (req: AuthRequest, res: Response) => {
  const invite = await teamsService.inviteMember(req.params.teamId, req.body.email, req.user!.userId);
  ok(res, invite, 'Invitation sent successfully');
};

export const getMyInvites = async (req: AuthRequest, res: Response) => {
  const invites = await teamsService.getMyInvites(req.user!.userId);
  ok(res, invites);
};

export const acceptInvite = async (req: AuthRequest, res: Response) => {
  await teamsService.acceptInvite(req.params.inviteId, req.user!.userId);
  ok(res, undefined, 'Invitation accepted');
};

export const rejectInvite = async (req: AuthRequest, res: Response) => {
  await teamsService.rejectInvite(req.params.inviteId, req.user!.userId);
  ok(res, undefined, 'Invitation rejected');
};

export const searchTeams = async (req: AuthRequest, res: Response) => {
  const teams = await teamsService.searchTeams(req.query.q as string);
  ok(res, teams);
};

export const requestJoin = async (req: AuthRequest, res: Response) => {
  const request = await teamsService.requestJoin(req.params.teamId, req.user!.userId);
  ok(res, request, 'Join request sent');
};

export const getJoinRequests = async (req: AuthRequest, res: Response) => {
  const requests = await teamsService.getJoinRequests(req.params.teamId);
  ok(res, requests);
};

export const approveJoinRequest = async (req: AuthRequest, res: Response) => {
  await teamsService.approveJoinRequest(req.params.requestId);
  ok(res, undefined, 'Join request approved');
};

export const rejectJoinRequest = async (req: AuthRequest, res: Response) => {
  await teamsService.rejectJoinRequest(req.params.requestId);
  ok(res, undefined, 'Join request rejected');
};

export const leaveTeam = async (req: AuthRequest, res: Response) => {
  await teamsService.leaveTeam(req.params.teamId, req.user!.userId);
  ok(res, undefined, 'Left team successfully');
};

export const updateTeamSettings = async (req: AuthRequest, res: Response) => {
  const team = await teamsService.updateTeamSettings(req.params.teamId, req.body);
  ok(res, team, 'Team settings updated');
};

export const getSubTeams = async (req: AuthRequest, res: Response) => {
  const subTeams = await teamsService.getSubTeams(req.params.teamId);
  ok(res, subTeams);
};

export const getDepartments = async (req: AuthRequest, res: Response) => {
  const departments = await teamsService.getDepartments();
  ok(res, departments);
};

export const updateMemberPermissions = async (req: AuthRequest, res: Response) => {
  await teamsService.updateMemberPermissions(req.params.teamId, req.params.userId, req.body.permissions);
  ok(res, undefined, 'Member permissions updated successfully');
};
