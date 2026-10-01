import { AIToolHandler, AIToolContext, aiToolRegistry } from './aiToolRegistry';
import { teamsRepository } from '../../teams/teams.repository';
import { analyticsService } from '../../analytics/analytics.service';
import { dailyWorkRepository } from '../../dailyWork/dailyWork.repository';
import { privacyService } from '../../privacy/privacy.service';
import { maskPII } from '../privacy-config';

export const getClassSummaryTool: AIToolHandler<{ classId: string }> = {
  name: 'getClassSummary',
  description: 'Summarize overall progress, sub-teams, and metrics for a classroom.',
  parameters: {
    type: 'object',
    properties: {
      classId: { type: 'string', description: 'UUID of the target classroom' },
    },
    required: ['classId'],
  },
  async authorize(ctx: AIToolContext, input: { classId: string }): Promise<boolean> {
    if (!ctx.callerUserId || !input.classId) return false;
    const aiEnabled = await privacyService.isAiEnabledForUser(ctx.callerUserId);
    if (!aiEnabled) return false;

    const role = await teamsRepository.getMemberRole(ctx.callerUserId, input.classId);
    return role === 'owner' || role === 'admin';
  },
  async execute(ctx: AIToolContext, input: { classId: string }) {
    const analytics = await analyticsService.getClassAnalytics(input.classId, ctx.callerUserId);
    const subTeams = (analytics.team_comparison || []).map((st: any) => ({
      team_id: st.team_id,
      team_name: st.team_name,
      member_count: st.member_count,
      assigned_tasks: st.assigned_tasks,
      completed_tasks: st.completed_tasks,
      open_blockers: st.open_blockers,
      progress_percent: st.progress_percent,
    }));

    return {
      class_id: input.classId,
      class_name: analytics.class_info?.class_name || 'Classroom',
      total_members: analytics.metrics?.total_members || 0,
      active_teams_count: analytics.metrics?.total_teams || 0,
      completion_rate: analytics.metrics?.overall_progress || 0,
      open_blockers_count: analytics.metrics?.open_blockers || 0,
      sub_teams: subTeams,
    };
  },
};

export const getClassMemberWorkTool: AIToolHandler<{ classId: string; targetMemberId: string }> = {
  name: 'getClassMemberWork',
  description: 'Retrieve confirmed work submissions of a specific student strictly within a classroom scope.',
  parameters: {
    type: 'object',
    properties: {
      classId: { type: 'string', description: 'UUID of the target classroom' },
      targetMemberId: { type: 'string', description: 'UUID of the target student/member' },
    },
    required: ['classId', 'targetMemberId'],
  },
  async authorize(ctx: AIToolContext, input: { classId: string; targetMemberId: string }): Promise<boolean> {
    if (!ctx.callerUserId || !input.classId || !input.targetMemberId) return false;
    const aiEnabled = await privacyService.isAiEnabledForUser(ctx.callerUserId);
    if (!aiEnabled) return false;

    // 1. Verify caller is owner or admin of class
    const callerRole = await teamsRepository.getMemberRole(ctx.callerUserId, input.classId);
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      return false;
    }

    // 2. Verify target member belongs to class or subteam of class
    return teamsRepository.isMemberOfClassOrSubteam(input.targetMemberId, input.classId);
  },
  async execute(ctx: AIToolContext, input: { classId: string; targetMemberId: string }) {
    const descendantTeamIds = await teamsRepository.getDescendantTeamIds(input.classId);
    const submissions = await dailyWorkRepository.getClassMemberSubmissions(
      descendantTeamIds,
      input.targetMemberId,
      20
    );
    return submissions.map((s: any) => ({
      work_date: s.work_date,
      team_name: s.team_name,
      confirmed_summary: maskPII(s.confirmed_summary || ''),
      confirmed_at: s.confirmed_at,
    }));
  },
};

aiToolRegistry.register(getClassSummaryTool);
aiToolRegistry.register(getClassMemberWorkTool);
