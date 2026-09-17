import {
  worklogRepository,
  WorklogTaskRow,
  WorklogGoalRow,
  WorklogDailySubmissionRow,
  WorklogBlockerRow,
  WorklogTeamMemberRow,
} from './worklog.repository';
import { teamsRepository } from '../teams/teams.repository';
import { NotFoundError } from '../../common/errors';

export class WorklogService {
  async getWorklog(teamId: string, limit: number = 50) {
    const team = await teamsRepository.getTeam(teamId);
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    const maxLimit = Math.min(Math.max(1, limit), 100);

    // Bulk fetch all domain entities in parallel (no N+1 queries)
    const [teamMembers, projects, goals, dailyWorkSubmissions, blockers] = await Promise.all([
      worklogRepository.getTeamMembers(teamId),
      worklogRepository.getTeamProjects(teamId),
      worklogRepository.getTeamGoals(teamId, maxLimit),
      worklogRepository.getTeamDailySubmissions(teamId, maxLimit),
      worklogRepository.getTeamBlockers(teamId, maxLimit),
    ]);

    const projectIds = projects.map((p: any) => p.project_id);
    const tasks: WorklogTaskRow[] = projectIds.length > 0
      ? await worklogRepository.getTasksByProjectIds(projectIds, maxLimit)
      : [];

    // Task Summary Calculation
    const taskAssigned = tasks.length;
    const taskCompleted = tasks.filter((t) => t.status === 'done').length;
    const taskInProgress = tasks.filter((t) => t.status === 'in_progress' || t.status === 'review').length;
    const taskRemaining = Math.max(0, taskAssigned - taskCompleted);

    // Goals Summary Calculation
    const goalTotal = goals.length;
    const goalCompleted = goals.filter((g) => g.status === 'completed' || g.progress === 100).length;
    const goalActive = goals.filter((g) => g.status === 'active' || g.status === 'planning').length;
    const totalGoalProgress = goals.reduce((acc, g) => acc + (g.progress || 0), 0);
    const avgGoalProgress = goalTotal > 0 ? Math.round(totalGoalProgress / goalTotal) : 0;

    // Daily Work Summary Calculation
    const todayStr = new Date().toISOString().split('T')[0];
    const submissionsToday = dailyWorkSubmissions.filter((s) => {
      const workDateStr = typeof s.work_date === 'string'
        ? s.work_date.split('T')[0]
        : (s.work_date instanceof Date ? s.work_date.toISOString().split('T')[0] : '');
      return workDateStr === todayStr;
    }).length;

    // Blockers Summary Calculation
    const openBlockers = blockers.filter((b) => b.status === 'open').length;
    const inProgressBlockers = blockers.filter((b) => b.status === 'in_progress').length;
    const resolvedBlockers = blockers.filter((b) => b.status === 'resolved').length;

    // Per-Member Summary
    const memberSummary = teamMembers.map((member: WorklogTeamMemberRow) => {
      const memberTasks = tasks.filter((t) => {
        const isOwner = t.owner === member.user_id;
        const isContributor = Array.isArray(t.contributors) && t.contributors.includes(member.user_id);
        return isOwner || isContributor;
      });

      const memberAssigned = memberTasks.length;
      const memberCompleted = memberTasks.filter((t) => t.status === 'done').length;
      const memberInProgress = memberTasks.filter((t) => t.status === 'in_progress' || t.status === 'review').length;
      const memberRemaining = Math.max(0, memberAssigned - memberCompleted);

      return {
        user_id: member.user_id,
        full_name: member.full_name,
        username: member.username,
        role: member.role,
        avatar_key: member.avatar_key || null,
        tasks: {
          assigned: memberAssigned,
          in_progress: memberInProgress,
          completed: memberCompleted,
          remaining: memberRemaining,
        },
      };
    });

    // Format safe work items (omit sensitive credentials/tokens)
    const formattedTasks = tasks.map((t) => ({
      task_id: t.task_id,
      project_id: t.project_id,
      project_name: t.project_name,
      title: t.title,
      description: t.description,
      owner: t.owner,
      owner_name: t.owner_name || null,
      contributors: t.contributors || [],
      reviewer: t.reviewer,
      dependencies: t.dependencies || [],
      status: t.status,
      priority: t.priority,
      created_by: t.created_by,
      created_at: t.created_at,
      completed_at: t.completed_at,
    }));

    const formattedGoals = goals.map((g) => ({
      goal_id: g.goal_id,
      title: g.title,
      description: g.description,
      goal_type: g.goal_type,
      status: g.status,
      progress: g.progress,
      created_by: g.created_by,
      created_by_name: g.created_by_name || null,
      target_date: g.target_date,
      created_at: g.created_at,
      completed_at: g.completed_at,
    }));

    const formattedDailySubmissions = dailyWorkSubmissions.map((s) => ({
      submission_id: s.submission_id,
      user_id: s.user_id,
      user_full_name: s.user_full_name,
      user_username: s.user_username,
      work_date: s.work_date,
      ai_summary: s.ai_summary,
      confirmed_summary: s.confirmed_summary,
      confirmed_at: s.confirmed_at,
    }));

    const formattedBlockers = blockers.map((b) => ({
      blocker_id: b.blocker_id,
      title: b.title,
      description: b.description,
      blocker_type: b.blocker_type,
      urgency: b.urgency,
      impact: b.impact,
      affected_tasks: b.affected_tasks || [],
      status: b.status,
      created_by: b.created_by,
      created_by_name: b.created_by_name || null,
      resolved_by: b.resolved_by,
      created_at: b.created_at,
      resolved_at: b.resolved_at,
    }));

    return {
      team_id: teamId,
      team_name: team.team_name,
      team_summary: {
        tasks: {
          assigned: taskAssigned,
          in_progress: taskInProgress,
          completed: taskCompleted,
          remaining: taskRemaining,
        },
        goals: {
          total: goalTotal,
          active: goalActive,
          completed: goalCompleted,
          avg_progress: avgGoalProgress,
        },
        daily_work: {
          submissions_today: submissionsToday,
          total_submissions: dailyWorkSubmissions.length,
        },
        blockers: {
          open: openBlockers,
          in_progress: inProgressBlockers,
          resolved: resolvedBlockers,
          total: blockers.length,
        },
      },
      member_summary: memberSummary,
      work_items: {
        tasks: formattedTasks,
        goals: formattedGoals,
        daily_work_submissions: formattedDailySubmissions,
        blockers: formattedBlockers,
      },
    };
  }
}

export const worklogService = new WorklogService();
