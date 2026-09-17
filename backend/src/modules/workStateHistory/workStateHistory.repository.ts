import { query, queryOne } from '../../db/client';

export interface WorkStateHistoryRow {
  history_id: string;
  team_id: string;
  artifact_type: 'task' | 'goal' | 'daily_work' | 'blocker';
  artifact_id: string;
  event_type: string;
  actor_id: string | null;
  actor_name?: string | null;
  previous_state: any;
  new_state: any;
  created_at: Date;
}

export interface RecordTransitionParams {
  team_id: string;
  artifact_type: 'task' | 'goal' | 'daily_work' | 'blocker';
  artifact_id: string;
  event_type: string;
  actor_id?: string | null;
  previous_state?: any;
  new_state?: any;
}

export class WorkStateHistoryRepository {
  async recordTransition(params: RecordTransitionParams, client?: any): Promise<WorkStateHistoryRow> {
    const text = `
      INSERT INTO work_state_history (
        team_id, artifact_type, artifact_id, event_type, actor_id, previous_state, new_state
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING history_id, team_id, artifact_type, artifact_id, event_type, actor_id, previous_state, new_state, created_at
    `;
    const values = [
      params.team_id,
      params.artifact_type,
      params.artifact_id,
      params.event_type,
      params.actor_id || null,
      params.previous_state ? JSON.stringify(params.previous_state) : null,
      params.new_state ? JSON.stringify(params.new_state) : null,
    ];

    if (client) {
      const res = await client.query(text, values);
      return res.rows[0];
    }

    const res = await queryOne<WorkStateHistoryRow>(text, values);
    return res!;
  }

  async getTeamHistory(
    teamId: string,
    artifactType?: string,
    cursor?: string,
    limit: number = 50
  ): Promise<WorkStateHistoryRow[]> {
    let text = `
      SELECT h.history_id, h.team_id, h.artifact_type, h.artifact_id, h.event_type,
             h.actor_id, h.previous_state, h.new_state, h.created_at, u.full_name as actor_name
      FROM work_state_history h
      LEFT JOIN users u ON h.actor_id = u.user_id
      WHERE h.team_id = $1
    `;
    const params: any[] = [teamId];

    if (artifactType) {
      params.push(artifactType);
      text += ` AND h.artifact_type = $${params.length}`;
    }

    if (cursor) {
      params.push(cursor);
      text += ` AND h.created_at < (SELECT created_at FROM work_state_history WHERE history_id = $${params.length})`;
    }

    params.push(limit);
    text += ` ORDER BY h.created_at DESC, h.history_id DESC LIMIT $${params.length}`;

    return query<WorkStateHistoryRow>(text, params);
  }

  /**
   * Fetches chronological timeline events for a specific work artifact (task, goal, blocker).
   * Supports composite cursor pagination (beforeTimestamp, beforeHistoryId).
   */
  async getArtifactTimeline(params: {
    artifactType: string;
    artifactId: string;
    beforeTimestamp?: string;
    beforeHistoryId?: string;
    limit?: number;
  }): Promise<(WorkStateHistoryRow & { actor_username?: string | null })[]> {
    const limit = Math.min(Math.max(params.limit || 50, 1), 100);
    let text = `
      SELECT h.history_id, h.team_id, h.artifact_type, h.artifact_id, h.event_type,
             h.actor_id, h.previous_state, h.new_state, h.created_at,
             u.full_name as actor_name, u.username as actor_username
      FROM work_state_history h
      LEFT JOIN users u ON h.actor_id = u.user_id
      WHERE h.artifact_type = $1 AND h.artifact_id = $2
    `;
    const sqlParams: any[] = [params.artifactType, params.artifactId];

    if (params.beforeTimestamp && params.beforeHistoryId) {
      sqlParams.push(params.beforeTimestamp, params.beforeHistoryId);
      text += ` AND (h.created_at, h.history_id) < ($${sqlParams.length - 1}::timestamptz, $${sqlParams.length}::uuid)`;
    } else if (params.beforeTimestamp) {
      sqlParams.push(params.beforeTimestamp);
      text += ` AND h.created_at < $${sqlParams.length}::timestamptz`;
    }

    sqlParams.push(limit);
    text += ` ORDER BY h.created_at DESC, h.history_id DESC LIMIT $${sqlParams.length}`;

    return query<WorkStateHistoryRow & { actor_username?: string | null }>(text, sqlParams);
  }

  /**
   * Looks up the most recent historical record for an artifact. Used to verify server-side
   * team context authorization if the main entity has been deleted.
   */
  async getLatestHistoryRecordForArtifact(
    artifactType: string,
    artifactId: string
  ): Promise<WorkStateHistoryRow | null> {
    const text = `
      SELECT history_id, team_id, artifact_type, artifact_id, event_type, actor_id, previous_state, new_state, created_at
      FROM work_state_history
      WHERE artifact_type = $1 AND artifact_id = $2
      ORDER BY created_at DESC, history_id DESC
      LIMIT 1
    `;
    const rows = await query<WorkStateHistoryRow>(text, [artifactType, artifactId]);
    return rows.length > 0 ? rows[0] : null;
  }
}

export const workStateHistoryRepository = new WorkStateHistoryRepository();
