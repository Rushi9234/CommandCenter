import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { teamsRepository } from '../../modules/teams/teams.repository';

export interface TeamRoleRequest extends AuthRequest {
  teamRole?: string;
}

// Role-gated team middleware: resolves which team the request concerns
// (`resolveTeamId`, since some routes have :teamId directly and others need
// a lookup -- e.g. approving a join request only has :requestId), looks up
// the caller's actual role in that team, and requires it to be one of
// `allowedRoles`. Replaces every ad-hoc `isTeamOwnerOrAdmin` check that used
// to live inline in teams.service.ts, and adds the check entirely new to
// routes that had none (addMember, getJoinRequests, approveJoinRequest,
// rejectJoinRequest).
export const requireTeamRole = (
  resolveTeamId: (req: AuthRequest) => Promise<string | null>,
  allowedRoles: string[]
) => {
  return async (req: TeamRoleRequest, res: Response, next: NextFunction) => {
    try {
      const teamId = await resolveTeamId(req);
      if (!teamId) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const role = await teamsRepository.getMemberRole(req.user!.userId, teamId);

      if (!role) {
        return res.status(403).json({ error: 'Not a member of this team' });
      }

      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.teamRole = role;
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Membership-only variant (any role passes) -- for routes that need "is a
// member" without a role tier, e.g. viewing the member list.
export const requireTeamMembership = (resolveTeamId: (req: AuthRequest) => Promise<string | null>) => {
  return async (req: TeamRoleRequest, res: Response, next: NextFunction) => {
    try {
      const teamId = await resolveTeamId(req);
      if (!teamId) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const role = await teamsRepository.getMemberRole(req.user!.userId, teamId);

      if (!role) {
        return res.status(403).json({ error: 'Not a member of this team' });
      }

      req.teamRole = role;
      next();
    } catch (error) {
      next(error);
    }
  };
};

// For create endpoints where team scoping is optional (a project or goal
// can be personal or team-owned): if the caller didn't specify a team,
// there's nothing to check -- let the request through. If they did, they
// must actually belong to it. Without this, createProject/createGoal would
// let any authenticated user insert a resource into a team they don't
// belong to just by naming that team's ID in the request body.
export const requireTeamRoleIfSpecified = (
  resolveTeamId: (req: AuthRequest) => Promise<string | null>,
  allowedRoles: string[]
) => {
  return async (req: TeamRoleRequest, res: Response, next: NextFunction) => {
    try {
      const teamId = await resolveTeamId(req);
      if (!teamId) {
        return next();
      }

      const role = await teamsRepository.getMemberRole(req.user!.userId, teamId);

      if (!role) {
        return res.status(403).json({ error: 'Not a member of this team' });
      }
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.teamRole = role;
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Common resolvers -- most routes just need :teamId from the URL; a few
// (join-request/invite actions) need to look the team up from a different
// resource ID first.
export const teamIdFromParams = (req: AuthRequest) => Promise.resolve(req.params.teamId || null);
export const teamIdFromBody = (req: AuthRequest) => Promise.resolve((req.body as any).teamId || null);
export const teamIdFromQuery = (req: AuthRequest) => Promise.resolve((req.query.teamId as string) || null);

// projects.repository.ts's update path uses raw column names (team_id, not
// teamId) since updateProjectSchema accepts the update payload verbatim --
// this resolver matches that shape.
export const teamIdFromBodySnakeCase = (req: AuthRequest) => Promise.resolve((req.body as any).team_id || null);
