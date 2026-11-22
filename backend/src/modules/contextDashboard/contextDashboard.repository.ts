import { query } from '../../db/client';

export interface TaskProgressItem {
  total: number;
  completed: number;
  in_progress: number;
  review: number;
  todo: number;
  completed_recent: number;
}

export interface BlockerHealthItem {
  open_count: number;
  critical_count: number;
  stale_count: number;
}

// Milestone 51 & Multi-Team Matrix: bulk, ANY($1)/GROUP BY queries
// against a bounded set of child-team IDs -- never a per-team fan-out.
// Maintains strict child-team privacy boundaries while empowering
// coordinators with actionable health and velocity telemetry.
export class ContextDashboardRepository {
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

  async getBlockerHealth(teamIds: string[]): Promise<Record<string, BlockerHealthItem>> {
    if (teamIds.length === 0) return {};
    const rows = await query<{
      team_id: string;
      open_count: string;
      critical_count: string;
      stale_count: string;
    }>(
      `SELECT 
        team_id,
        COUNT(*) AS open_count,
        COUNT(*) FILTER (WHERE urgency IN ('high', 'critical') OR severity IN ('high', 'critical')) AS critical_count,
        COUNT(*) FILTER (WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours') AS stale_count
       FROM blockers
       WHERE team_id = ANY($1) AND status = 'open'
       GROUP BY team_id`,
      [teamIds]
    );
    const health: Record<string, BlockerHealthItem> = {};
    for (const row of rows) {
      health[row.team_id] = {
        open_count: Number(row.open_count),
        critical_count: Number(row.critical_count),
        stale_count: Number(row.stale_count),
      };
    }
    return health;
  }

  async getTaskProgress(teamIds: string[]): Promise<Record<string, TaskProgressItem>> {
    if (teamIds.length === 0) return {};
    const rows = await query<{
      team_id: string;
      total: string;
      completed: string;
      in_progress: string;
      review: string;
      todo: string;
      completed_recent: string;
    }>(
      `SELECT 
        p.team_id,
        COUNT(t.task_id) AS total,
        COUNT(*) FILTER (WHERE t.status = 'done') AS completed,
        COUNT(*) FILTER (WHERE t.status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE t.status = 'review') AS review,
        COUNT(*) FILTER (WHERE t.status = 'todo' OR t.status IS NULL) AS todo,
        COUNT(*) FILTER (WHERE t.status = 'done' AND (t.completed_at >= CURRENT_DATE - INTERVAL '7 days' OR (t.completed_at IS NULL AND t.updated_at >= CURRENT_DATE - INTERVAL '7 days'))) AS completed_recent
       FROM projects p
       INNER JOIN tasks t ON t.project_id = p.project_id
       WHERE p.team_id = ANY($1)
       GROUP BY p.team_id`,
      [teamIds]
    );
    const progress: Record<string, TaskProgressItem> = {};
    for (const row of rows) {
      progress[row.team_id] = {
        total: Number(row.total),
        completed: Number(row.completed),
        in_progress: Number(row.in_progress),
        review: Number(row.review),
        todo: Number(row.todo),
        completed_recent: Number(row.completed_recent),
      };
    }
    return progress;
  }

  async getAuditBlockers(teamIds: string[]): Promise<any[]> {
    if (teamIds.length === 0) return [];
    const rows = await query<any>(
      `SELECT b.blocker_id, b.team_id, t.team_name, b.description, b.severity, b.status,
              b.created_at, b.resolved_at
       FROM blockers b
       JOIN teams t ON t.team_id = b.team_id
       WHERE b.team_id = ANY($1)
       ORDER BY b.created_at DESC
       LIMIT 100`,
      [teamIds]
    );
    return rows;
  }
}

export const contextDashboardRepository = new ContextDashboardRepository();

