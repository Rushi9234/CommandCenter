import { pgPool } from '../../utils/database';

export interface PulseItemRow {
  history_id: string;
  team_id: string;
  team_name: string;
  artifact_type: 'task' | 'goal' | 'daily_work' | 'blocker';
  artifact_id: string;
  event_type: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
  previous_state: any;
  new_state: any;
  created_at: Date;
  artifact_title: string | null;
  project_name: string | null;
  context_status: 'active' | 'deleted';
}

export interface GetPulseOptions {
  teamIds: string[];
  artifactType?: string;
  beforeTimestamp?: Date;
  beforeHistoryId?: string;
  limit?: number;
}

export class PulseRepository {
  async getPulseEvents(options: GetPulseOptions): Promise<PulseItemRow[]> {
    if (!options.teamIds || options.teamIds.length === 0) {
      return [];
    }

    const limit = Math.min(Math.max(1, options.limit || 20), 50);

    const queryText = `
      SELECT
        h.history_id,
        h.team_id,
        t.team_name,
        h.artifact_type,
        h.artifact_id,
        h.event_type,
        h.actor_id,
        u.full_name AS actor_name,
        u.avatar_key AS actor_avatar,
        h.previous_state,
        h.new_state,
        h.created_at,
        COALESCE(tk.title, g.title, b.title, dw.confirmed_summary, gi.message) AS artifact_title,
        p.project_name,
        CASE
          WHEN h.artifact_type = 'task' AND tk.task_id IS NULL THEN 'deleted'
          WHEN h.artifact_type = 'goal' AND g.goal_id IS NULL THEN 'deleted'
          WHEN h.artifact_type = 'blocker' AND b.blocker_id IS NULL THEN 'deleted'
          WHEN h.artifact_type = 'daily_work' AND dw.submission_id IS NULL THEN 'deleted'
          ELSE 'active'
        END AS context_status
      FROM work_state_history h
      JOIN teams t ON h.team_id = t.team_id
      LEFT JOIN users u ON h.actor_id = u.user_id
      LEFT JOIN tasks tk ON h.artifact_type = 'task' AND h.artifact_id = tk.task_id
      LEFT JOIN projects p ON tk.project_id = p.project_id
      LEFT JOIN goals g ON h.artifact_type = 'goal' AND h.artifact_id = g.goal_id
      LEFT JOIN blockers b ON h.artifact_type = 'blocker' AND h.artifact_id = b.blocker_id
      LEFT JOIN daily_work_submissions dw ON h.artifact_type = 'daily_work' AND h.artifact_id = dw.submission_id
      LEFT JOIN guidance_items gi ON h.event_type LIKE 'guidance_%' AND (h.artifact_id = gi.context_id OR h.artifact_id = gi.guidance_id)
      WHERE h.team_id = ANY($1)
        AND ($2::text IS NULL OR h.artifact_type = $2 OR ($2 = 'guidance' AND h.event_type LIKE 'guidance_%'))
        AND (
          $3::timestamptz IS NULL
          OR h.created_at < $3
          OR (h.created_at = $3 AND h.history_id < $4)
        )
      ORDER BY h.created_at DESC, h.history_id DESC
      LIMIT $5
    `;

    const res = await pgPool.query(queryText, [
      options.teamIds,
      options.artifactType || null,
      options.beforeTimestamp ? options.beforeTimestamp.toISOString() : null,
      options.beforeHistoryId || null,
      limit,
    ]);

    return res.rows;
  }

  async getRecipientGuidancePulse(recipientUserId: string, limit: number = 20): Promise<PulseItemRow[]> {
    const queryText = `
      SELECT
        h.history_id,
        h.team_id,
        t.team_name,
        h.artifact_type,
        h.artifact_id,
        h.event_type,
        h.actor_id,
        u.full_name AS actor_name,
        u.avatar_key AS actor_avatar,
        h.previous_state,
        h.new_state,
        h.created_at,
        gi.message AS artifact_title,
        NULL::text AS project_name,
        CASE WHEN gi.guidance_id IS NULL THEN 'deleted' ELSE 'active' END AS context_status
      FROM work_state_history h
      JOIN teams t ON h.team_id = t.team_id
      LEFT JOIN users u ON h.actor_id = u.user_id
      JOIN guidance_items gi ON (h.artifact_id = gi.context_id OR h.artifact_id = gi.guidance_id)
      WHERE gi.recipient_id = $1 AND h.event_type LIKE 'guidance_%'
      ORDER BY h.created_at DESC, h.history_id DESC
      LIMIT $2
    `;
    const res = await pgPool.query(queryText, [recipientUserId, limit]);
    return res.rows;
  }
}

export const pulseRepository = new PulseRepository();
