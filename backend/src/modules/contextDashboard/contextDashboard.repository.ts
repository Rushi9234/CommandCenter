import { query } from '../../db/client';

// Milestone 51: every method here is a bulk, ANY($1)/GROUP BY query
// against a bounded set of child-team IDs -- never a per-team fan-out.
// See contextDashboard.service.ts's own comment for the authorization
// model this supports (narrow, read-only, aggregate-only visibility for
// a parent team's owner/admin into its children -- NOT membership, NOT
// a cascade into any child team's own resource endpoints).
export class ContextDashboardRepository {
  // Milestone 51: capped at 200 -- a classroom/hackathon realistically
  // has tens of teams, not thousands, but nothing before this enforced
  // that. Matches the array-length-bound convention M40/M46 already
  // established elsewhere (searchTeams' own LIMIT 50) rather than
  // leaving an unbounded aggregation surface. If a context genuinely
  // needs more than this, the dashboard should paginate -- not silently
  // aggregate an unbounded number of teams.
  async getChildTeams(parentTeamId: string) {
    const text = `
      SELECT team_id, team_name, description, team_type, is_public, created_at
      FROM teams
      WHERE parent_team_id = $1
      ORDER BY created_at ASC
      LIMIT 200
    `;
    return query<any>(text, [parentTeamId]);
  }

  async getMemberCounts(teamIds: string[]): Promise<Record<string, number>> {
    if (teamIds.length === 0) return {};
    const rows = await query<{ team_id: string; count: string }>(
      'SELECT team_id, COUNT(*) AS count FROM team_members WHERE team_id = ANY($1) GROUP BY team_id',
      [teamIds]
    );
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.team_id] = Number(row.count);
    return counts;
  }

  // Milestone 51: a boolean per team ("did ANY member submit today"),
  // never which member or what they wrote -- the exact neutral-signal
  // shape the milestone's own instructions require ("ACTIVE" not "who's
  // slow"). Filters CURRENT_DATE in SQL, not a JS-computed date string --
  // the same DATE-column/JS-Date mismatch class M46 already found and
  // fixed once (never reintroduce it here).
  async getTeamsWithTodaysSubmission(teamIds: string[]): Promise<Set<string>> {
    if (teamIds.length === 0) return new Set();
    const rows = await query<{ team_id: string }>(
      'SELECT DISTINCT team_id FROM daily_work_submissions WHERE team_id = ANY($1) AND work_date = CURRENT_DATE',
      [teamIds]
    );
    return new Set(rows.map((r) => r.team_id));
  }

  async getOpenBlockerCounts(teamIds: string[]): Promise<Record<string, number>> {
    if (teamIds.length === 0) return {};
    const rows = await query<{ team_id: string; count: string }>(
      "SELECT team_id, COUNT(*) AS count FROM blockers WHERE team_id = ANY($1) AND status = 'open' GROUP BY team_id",
      [teamIds]
    );
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.team_id] = Number(row.count);
    return counts;
  }

  // Milestone 51: neutral counts only (total/completed tasks), never a
  // per-person breakdown -- the milestone's own instruction not to
  // invent a productivity formula. One JOIN, one GROUP BY, regardless of
  // how many teams/projects/tasks exist.
  async getTaskProgress(teamIds: string[]): Promise<Record<string, { total: number; completed: number }>> {
    if (teamIds.length === 0) return {};
    const rows = await query<{ team_id: string; total: string; completed: string }>(
      `SELECT p.team_id, COUNT(t.task_id) AS total, COUNT(*) FILTER (WHERE t.status = 'done') AS completed
       FROM projects p
       INNER JOIN tasks t ON t.project_id = p.project_id
       WHERE p.team_id = ANY($1)
       GROUP BY p.team_id`,
      [teamIds]
    );
    const progress: Record<string, { total: number; completed: number }> = {};
    for (const row of rows) {
      progress[row.team_id] = { total: Number(row.total), completed: Number(row.completed) };
    }
    return progress;
  }
}

export const contextDashboardRepository = new ContextDashboardRepository();
