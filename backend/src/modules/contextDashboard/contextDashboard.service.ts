import { contextDashboardRepository } from './contextDashboard.repository';
import { teamsRepository } from '../teams/teams.repository';
import { NotFoundError } from '../../common/errors';

export class ContextDashboardService {
  async getContextDashboard(contextTeamId: string) {
    const context = await teamsRepository.getTeam(contextTeamId);
    if (!context) {
      throw new NotFoundError('Team not found');
    }

    const childTeams = await contextDashboardRepository.getChildTeams(contextTeamId);
    if (childTeams.length === 0) {
      return {
        context: this.toContextSummary(context),
        teams: [],
        summary: {
          total_teams: 0,
          submitted_today_count: 0,
          blocked_count: 0,
          needs_attention_count: 0,
          healthy_teams_count: 0,
          at_risk_teams_count: 0,
          total_tasks_completed_this_week: 0,
          average_velocity: 0,
        },
      };
    }

    const teamIds = childTeams.map((t: any) => t.team_id);

    // Bulk aggregation queries (bounded, zero N+1)
    const [memberCounts, submittedTodaySet, blockerHealthMap, taskProgressMap] = await Promise.all([
      contextDashboardRepository.getMemberCounts(teamIds),
      contextDashboardRepository.getTeamsWithTodaysSubmission(teamIds),
      contextDashboardRepository.getBlockerHealth(teamIds),
      contextDashboardRepository.getTaskProgress(teamIds),
    ]);

    const teams = childTeams.map((t: any) => {
      const memberCount = memberCounts[t.team_id] || 0;
      const submittedToday = submittedTodaySet.has(t.team_id);
      const blockerHealth = blockerHealthMap[t.team_id] || { open_count: 0, critical_count: 0, stale_count: 0 };
      const openBlockerCount = blockerHealth.open_count;
      const criticalBlockerCount = blockerHealth.critical_count;
      const staleBlockerCount = blockerHealth.stale_count;

      const progress = taskProgressMap[t.team_id];
      const taskTotal = progress ? progress.total : 0;
      const taskCompleted = progress ? progress.completed : 0;
      const taskInProgress = progress ? progress.in_progress : 0;
      const taskReview = progress ? progress.review : 0;
      const taskTodo = progress ? progress.todo : 0;
      const taskCompletedRecent = progress ? progress.completed_recent : 0;
      const taskPercent = taskTotal > 0 ? Math.round((taskCompleted / taskTotal) * 100) : null;

      // Risk reasons calculation
      const riskReasons: string[] = [];
      if (criticalBlockerCount > 0) {
        riskReasons.push(`${criticalBlockerCount} critical blocker${criticalBlockerCount > 1 ? 's' : ''} active`);
      } else if (openBlockerCount > 1) {
        riskReasons.push(`${openBlockerCount} open blockers pending resolution`);
      } else if (openBlockerCount === 1) {
        riskReasons.push('1 open blocker pending');
      }

      if (staleBlockerCount > 0) {
        riskReasons.push(`${staleBlockerCount} blocker${staleBlockerCount > 1 ? 's' : ''} unresolved for >24h`);
      }

      if (memberCount > 0 && !submittedToday) {
        riskReasons.push('No team member has submitted today\'s work');
      }

      if (taskTotal > 0 && taskCompleted === 0 && memberCount > 0) {
        riskReasons.push('Sprint velocity stalled (0 completed tasks)');
      }

      // Health Status classification
      let healthStatus: 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK' = 'HEALTHY';
      let healthScore = 100;

      if (criticalBlockerCount > 0 || openBlockerCount >= 2 || (memberCount > 0 && taskTotal > 0 && taskCompleted === 0 && !submittedToday)) {
        healthStatus = 'AT_RISK';
        healthScore = Math.max(10, 45 - (criticalBlockerCount * 15) - (staleBlockerCount * 10));
      } else if (openBlockerCount === 1 || (memberCount > 0 && !submittedToday)) {
        healthStatus = 'NEEDS_ATTENTION';
        healthScore = Math.max(50, 75 - (openBlockerCount * 15) - (!submittedToday ? 15 : 0));
      } else {
        healthStatus = 'HEALTHY';
        healthScore = taskPercent !== null ? Math.min(100, Math.max(80, 80 + Math.round(taskPercent * 0.2))) : 90;
      }

      // Velocity Telemetry
      let velocityLabel: 'HIGH' | 'STEADY' | 'LOW' | 'STALLED' | 'IDLE' = 'IDLE';
      if (taskCompletedRecent >= 3) {
        velocityLabel = 'HIGH';
      } else if (taskCompletedRecent >= 1) {
        velocityLabel = 'STEADY';
      } else if (taskCompleted > 0) {
        velocityLabel = 'LOW';
      } else if (taskTotal > 0 && taskCompleted === 0) {
        velocityLabel = 'STALLED';
      } else {
        velocityLabel = 'IDLE';
      }

      const velocityScore = Math.round((taskCompletedRecent / Math.max(1, memberCount)) * 10) / 10;

      // Retain backward-compatible needsAttention boolean
      const needsAttention = openBlockerCount > 0 || (memberCount > 0 && !submittedToday);

      return {
        team_id: t.team_id,
        team_name: t.team_name,
        description: t.description,
        team_type: t.team_type,
        is_public: t.is_public,
        member_count: memberCount,
        submitted_today: submittedToday,
        open_blocker_count: openBlockerCount,
        critical_blocker_count: criticalBlockerCount,
        stale_blocker_count: staleBlockerCount,
        task_progress: progress
          ? {
              total: taskTotal,
              completed: taskCompleted,
              in_progress: taskInProgress,
              review: taskReview,
              todo: taskTodo,
              completed_recent: taskCompletedRecent,
              percent: taskPercent,
            }
          : null,
        burndown: {
          total: taskTotal,
          completed: taskCompleted,
          in_progress: taskInProgress,
          review: taskReview,
          todo: taskTodo,
          blocked: openBlockerCount,
        },
        velocity: {
          completed_this_week: taskCompletedRecent,
          score: velocityScore,
          label: velocityLabel,
        },
        health: {
          status: healthStatus,
          score: healthScore,
          risks: riskReasons,
        },
        needs_attention: needsAttention,
      };
    });

    const totalCompletedRecent = teams.reduce((acc, t) => acc + (t.velocity?.completed_this_week || 0), 0);
    const avgVelocity = teams.length > 0
      ? Math.round((teams.reduce((acc, t) => acc + (t.velocity?.score || 0), 0) / teams.length) * 10) / 10
      : 0;

    const summary = {
      total_teams: teams.length,
      submitted_today_count: teams.filter((t) => t.submitted_today).length,
      blocked_count: teams.filter((t) => t.open_blocker_count > 0).length,
      needs_attention_count: teams.filter((t) => t.needs_attention).length,
      healthy_teams_count: teams.filter((t) => t.health.status === 'HEALTHY').length,
      at_risk_teams_count: teams.filter((t) => t.health.status === 'AT_RISK').length,
      total_tasks_completed_this_week: totalCompletedRecent,
      average_velocity: avgVelocity,
    };

    return { context: this.toContextSummary(context), teams, summary };
  }

  async getAuditReport(contextTeamId: string, currentUser?: any) {
    const dashboard = await this.getContextDashboard(contextTeamId);
    const teamIds = dashboard.teams.map((t: any) => t.team_id);
    const blockers = await contextDashboardRepository.getAuditBlockers(
      teamIds.length > 0 ? teamIds : [contextTeamId]
    );

    const totalTasks = dashboard.teams.reduce((acc: number, t: any) => acc + (t.task_progress?.total || 0), 0);
    const completedTasks = dashboard.teams.reduce((acc: number, t: any) => acc + (t.task_progress?.completed || 0), 0);
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const openBlockers = blockers.filter((b: any) => b.status !== 'resolved').length;
    const resolvedBlockers = blockers.filter((b: any) => b.status === 'resolved').length;

    const now = new Date().toISOString();
    const csvRows: string[] = [
      'Scope,Category,Identifier,Name,Status,Detail,Velocity_or_Priority,Timestamp',
      `"${dashboard.context.team_name}","METRIC","SUMMARY","Total Teams","${dashboard.summary.total_teams}","Healthy: ${dashboard.summary.healthy_teams_count}, At Risk: ${dashboard.summary.at_risk_teams_count}","${dashboard.summary.average_velocity} avg velocity","${now}"`,
      `"${dashboard.context.team_name}","METRIC","SUMMARY","Total Tasks","${totalTasks}","Completed: ${completedTasks} (${completionRate}%)","${dashboard.summary.total_tasks_completed_this_week} this week","${now}"`,
      `"${dashboard.context.team_name}","METRIC","SUMMARY","Blockers","${openBlockers} open","${resolvedBlockers} resolved","${dashboard.summary.blocked_count} teams blocked","${now}"`,
    ];

    for (const t of dashboard.teams) {
      const comp = t.task_progress?.completed ?? 0;
      const tot = t.task_progress?.total ?? 0;
      const pct = t.task_progress?.percent ?? 0;
      const tProgress = `${comp}/${tot} tasks (${pct}%)`;
      const riskStr = (t.health?.risks || []).join('; ') || 'No active risks';
      const velLabel = t.velocity?.label || 'IDLE';
      const velDone = t.velocity?.completed_this_week ?? 0;
      csvRows.push(
        `"${dashboard.context.team_name}","TEAM","${t.team_id}","${t.team_name}","${t.health.status}","${tProgress} | Standup: ${t.submitted_today ? 'Submitted' : 'Pending'} | Risks: ${riskStr.replace(/"/g, '""')}","${velLabel} (${velDone} done/7d)","${now}"`
      );
    }

    for (const b of blockers) {
      const desc = (b.description || '').replace(/"/g, '""');
      const ts = b.created_at ? new Date(b.created_at).toISOString() : now;
      csvRows.push(
        `"${dashboard.context.team_name}","BLOCKER","${b.blocker_id}","${b.team_name}","${b.status}","${desc}","${b.severity}","${ts}"`
      );
    }

    const csv = csvRows.join('\r\n');

    return {
      context: {
        ...dashboard.context,
        generated_at: now,
        generated_by: currentUser?.full_name || currentUser?.username || 'Classroom Coordinator',
      },
      summary: {
        ...dashboard.summary,
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        completion_rate: completionRate,
        open_blockers: openBlockers,
        resolved_blockers: resolvedBlockers,
      },
      teams: dashboard.teams,
      blockers: blockers.map((b: any) => ({
        blocker_id: b.blocker_id,
        team_id: b.team_id,
        team_name: b.team_name,
        description: b.description,
        severity: b.severity,
        status: b.status,
        created_at: b.created_at,
        resolved_at: b.resolved_at,
      })),
      csv,
    };
  }

  private toContextSummary(context: any) {
    return {
      team_id: context.team_id,
      team_name: context.team_name,
      team_type: context.team_type,
      description: context.description,
    };
  }
}

export const contextDashboardService = new ContextDashboardService();
