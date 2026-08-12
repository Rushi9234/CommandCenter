import { contextDashboardRepository } from './contextDashboard.repository';
import { teamsRepository } from '../teams/teams.repository';
import { NotFoundError } from '../../common/errors';

// Milestone 51 -- COORDINATOR AUTHORIZATION MODEL (read this before
// touching anything in this file):
//
// M50 established, as a hard rule, that parent-team membership must
// NEVER implicitly grant access to a child team's own private resources
// (its tasks, goals, blockers, daily-work entries, member list). This
// service does NOT violate that rule, and it's worth spelling out
// exactly why:
//
// 1. The route this service sits behind (`GET /teams/:teamId/context-
//    dashboard`) is gated by the SAME `requireTeamRole(teamIdFromParams,
//    ['owner','admin'])` middleware every other owner/admin-only team
//    route already uses -- on the PARENT team's own ID, which the caller
//    must already be an explicit member of. No new authorization
//    primitive, no new middleware, nothing that overlaps with or could
//    conflict with team_members.role.
// 2. What IS new: once past that gate, this service reads a narrow,
//    fixed set of AGGREGATE fields about the parent's child teams --
//    a member count, a same-day submission boolean, an open-blocker
//    COUNT, a task total/completed COUNT. It never returns a child
//    team's member list, blocker titles/messages, task titles, or
//    daily-work entry/summary text. A coordinator who is NOT also an
//    explicit member of a given child team still cannot open that
//    child's own `/blockers`, `/tasks`, `/work-entries`, etc. -- this
//    dashboard is the ONE place, with ONE deliberately narrow field set,
//    where parent-owner/admin status buys any child-team visibility at
//    all, and even here only counts/booleans, never content.
// 3. This is Model B from the milestone's own comparison ("explicit
//    coordinator capability on the parent context with narrowly scoped
//    read-only child-team access"), chosen over Model A (would require
//    manually adding the coordinator to every child team -- doesn't
//    scale to "a classroom with 8 teams") and Model C (a separate
//    coordinator-relationship table -- solves nothing this doesn't, at
//    the cost of a second authorization concept to maintain forever).
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
        summary: { total_teams: 0, submitted_today_count: 0, blocked_count: 0, needs_attention_count: 0 },
      };
    }

    const teamIds = childTeams.map((t: any) => t.team_id);

    // Milestone 51: exactly 4 bulk queries regardless of how many child
    // teams exist (bounded at 200 by the repository's own LIMIT) -- the
    // N+1 shape M42/M46 already fixed elsewhere is not reintroduced here.
    const [memberCounts, submittedTodaySet, openBlockerCounts, taskProgress] = await Promise.all([
      contextDashboardRepository.getMemberCounts(teamIds),
      contextDashboardRepository.getTeamsWithTodaysSubmission(teamIds),
      contextDashboardRepository.getOpenBlockerCounts(teamIds),
      contextDashboardRepository.getTaskProgress(teamIds),
    ]);

    const teams = childTeams.map((t: any) => {
      const memberCount = memberCounts[t.team_id] || 0;
      const submittedToday = submittedTodaySet.has(t.team_id);
      const openBlockerCount = openBlockerCounts[t.team_id] || 0;
      const progress = taskProgress[t.team_id];

      // Milestone 51: transparent, documented derivation -- NOT a hidden
      // score. "Needs attention" is exactly "has an open blocker OR has
      // members but nobody has submitted today's work" -- both raw
      // signals are also returned themselves so the frontend (or a
      // future consumer) never has to trust this boolean blindly.
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
        task_progress: progress
          ? { total: progress.total, completed: progress.completed, percent: progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null }
          : null,
        needs_attention: needsAttention,
      };
    });

    const summary = {
      total_teams: teams.length,
      submitted_today_count: teams.filter((t) => t.submitted_today).length,
      blocked_count: teams.filter((t) => t.open_blocker_count > 0).length,
      needs_attention_count: teams.filter((t) => t.needs_attention).length,
    };

    return { context: this.toContextSummary(context), teams, summary };
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
