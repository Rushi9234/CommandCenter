import { AIToolHandler, AIToolContext, aiToolRegistry } from './aiToolRegistry';
import { teamsRepository } from '../../teams/teams.repository';
import { analyticsService } from '../../analytics/analytics.service';
import { privacyService } from '../../privacy/privacy.service';

export const getTeamSummaryTool: AIToolHandler<{ teamId: string }> = {
  name: 'getTeamSummary',
  description: 'Retrieve status, task progress, and member submissions for a team.',
  parameters: {
    type: 'object',
    properties: {
      teamId: { type: 'string', description: 'UUID of the target team' },
    },
    required: ['teamId'],
  },
  async authorize(ctx: AIToolContext, input: { teamId: string }): Promise<boolean> {
    if (!ctx.callerUserId || !input.teamId) return false;
    const aiEnabled = await privacyService.isAiEnabledForUser(ctx.callerUserId);
    if (!aiEnabled) return false;

    const canAccess = await teamsRepository.canAccessTeam(ctx.callerUserId, input.teamId);
    if (!canAccess) return false;

    const role = await teamsRepository.getMemberRole(ctx.callerUserId, input.teamId);
    if (!role) return false;
    return ['owner', 'admin', 'manager', 'leader'].includes(String(role).toLowerCase());
  },
  async execute(ctx: AIToolContext, input: { teamId: string }) {
    const analytics = await analyticsService.getTeamAnalytics(input.teamId, ctx.callerUserId);
    const members = (analytics.members || []).map((m: any) => ({
      member_id: m.user_id,
      name: m.full_name || m.username || 'Member',
      assigned_tasks: m.assigned_tasks || 0,
      completed_tasks: m.completed_tasks || 0,
      in_progress: m.in_progress || 0,
      pending_review: m.pending_review || 0,
      progress_percent: m.progress_percent || 0,
    }));

    return {
      team_id: input.teamId,
      team_name: analytics.team_info?.team_name || 'Team',
      member_count: analytics.team_info?.member_count || 0,
      total_tasks: analytics.progress?.assigned || 0,
      completed_tasks: analytics.progress?.completed || 0,
      completion_rate: analytics.progress?.overall_progress || 0,
      open_blockers_count: analytics.progress?.open_blockers || 0,
      members,
    };
  },
};

aiToolRegistry.register(getTeamSummaryTool);
