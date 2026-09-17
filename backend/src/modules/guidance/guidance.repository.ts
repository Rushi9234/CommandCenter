import { pgPool } from '../../utils/database';

export interface GuidanceItem {
  guidance_id: string;
  team_id: string;
  context_type: 'task' | 'goal' | 'blocker';
  context_id: string;
  author_id: string;
  recipient_id: string | null;
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  acknowledged_at: string | Date | null;
  resolved_at: string | Date | null;
  resolved_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  author_name?: string;
  recipient_name?: string;
  context_status?: 'active' | 'deleted';
  context_title?: string;
}

export interface ContextResolution {
  exists: boolean;
  team_id: string | null;
  created_by: string | null;
  assigned_recipient: string | null;
  title: string | null;
}

export class GuidanceRepository {
  /**
   * Resolves the canonical context entity (task, goal, blocker) to derive
   * actual team ownership, creator, assigned recipient, and existence state.
   */
  async resolveContextEntity(
    contextType: 'task' | 'goal' | 'blocker',
    contextId: string
  ): Promise<ContextResolution> {
    if (contextType === 'task') {
      const query = `
        SELECT t.task_id, p.team_id, t.created_by, COALESCE(t.owner, t.created_by) as assigned_recipient, t.title
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.project_id
        WHERE t.task_id = $1
      `;
      const result = await pgPool.query(query, [contextId]);
      if (result.rows.length === 0) {
        return { exists: false, team_id: null, created_by: null, assigned_recipient: null, title: null };
      }
      const row = result.rows[0];
      return {
        exists: true,
        team_id: row.team_id,
        created_by: row.created_by,
        assigned_recipient: row.assigned_recipient,
        title: row.title,
      };
    } else if (contextType === 'goal') {
      const query = `
        SELECT goal_id, team_id, created_by, created_by as assigned_recipient, title
        FROM goals
        WHERE goal_id = $1
      `;
      const result = await pgPool.query(query, [contextId]);
      if (result.rows.length === 0) {
        return { exists: false, team_id: null, created_by: null, assigned_recipient: null, title: null };
      }
      const row = result.rows[0];
      return {
        exists: true,
        team_id: row.team_id,
        created_by: row.created_by,
        assigned_recipient: row.assigned_recipient,
        title: row.title,
      };
    } else if (contextType === 'blocker') {
      const query = `
        SELECT blocker_id, team_id, created_by, created_by as assigned_recipient, title
        FROM blockers
        WHERE blocker_id = $1
      `;
      const result = await pgPool.query(query, [contextId]);
      if (result.rows.length === 0) {
        return { exists: false, team_id: null, created_by: null, assigned_recipient: null, title: null };
      }
      const row = result.rows[0];
      return {
        exists: true,
        team_id: row.team_id,
        created_by: row.created_by,
        assigned_recipient: row.assigned_recipient,
        title: row.title,
      };
    }

    return { exists: false, team_id: null, created_by: null, assigned_recipient: null, title: null };
  }

  /**
   * Checks for an existing active open duplicate guidance item.
   */
  async findDuplicateOpenGuidance(data: {
    context_type: string;
    context_id: string;
    recipient_id?: string | null;
    message: string;
  }): Promise<GuidanceItem | null> {
    const query = `
      SELECT * FROM guidance_items
      WHERE context_type = $1
        AND context_id = $2
        AND message = $3
        AND status = 'open'
        AND ((recipient_id IS NULL AND $4::uuid IS NULL) OR recipient_id = $4::uuid)
      LIMIT 1
    `;
    const result = await pgPool.query(query, [
      data.context_type,
      data.context_id,
      data.message,
      data.recipient_id || null,
    ]);
    return result.rows[0] || null;
  }

  /**
   * Creates a new guidance item in PostgreSQL.
   */
  async createGuidance(data: {
    team_id: string;
    context_type: 'task' | 'goal' | 'blocker';
    context_id: string;
    author_id: string;
    recipient_id?: string | null;
    message: string;
  }): Promise<GuidanceItem> {
    const query = `
      INSERT INTO guidance_items (
        team_id, context_type, context_id, author_id, recipient_id, message, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'open')
      RETURNING *
    `;
    const result = await pgPool.query(query, [
      data.team_id,
      data.context_type,
      data.context_id,
      data.author_id,
      data.recipient_id || null,
      data.message,
    ]);
    return result.rows[0];
  }

  /**
   * Fetches a guidance item by ID with author/recipient user details.
   */
  async getGuidanceById(guidanceId: string): Promise<GuidanceItem | null> {
    const query = `
      SELECT g.*,
             u_author.full_name as author_name,
             u_recipient.full_name as recipient_name
      FROM guidance_items g
      LEFT JOIN users u_author ON g.author_id = u_author.user_id
      LEFT JOIN users u_recipient ON g.recipient_id = u_recipient.user_id
      WHERE g.guidance_id = $1
    `;
    const result = await pgPool.query(query, [guidanceId]);
    if (result.rows.length === 0) return null;

    const item = result.rows[0] as GuidanceItem;
    const context = await this.resolveContextEntity(item.context_type, item.context_id);
    item.context_status = context.exists ? 'active' : 'deleted';
    item.context_title = context.title || undefined;

    return item;
  }

  /**
   * Lists guidance items for a team with optional filters and pagination.
   */
  async listGuidance(filters: {
    team_id: string;
    context_type?: string;
    context_id?: string;
    recipient_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: GuidanceItem[]; total: number }> {
    const whereConditions: string[] = ['g.team_id = $1'];
    const queryParams: any[] = [filters.team_id];
    let paramIndex = 2;

    if (filters.context_type) {
      whereConditions.push(`g.context_type = $${paramIndex}`);
      queryParams.push(filters.context_type);
      paramIndex++;
    }

    if (filters.context_id) {
      whereConditions.push(`g.context_id = $${paramIndex}`);
      queryParams.push(filters.context_id);
      paramIndex++;
    }

    if (filters.recipient_id) {
      whereConditions.push(`(g.recipient_id = $${paramIndex} OR g.recipient_id IS NULL)`);
      queryParams.push(filters.recipient_id);
      paramIndex++;
    }

    if (filters.status) {
      whereConditions.push(`g.status = $${paramIndex}`);
      queryParams.push(filters.status);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');
    const countQuery = `SELECT COUNT(*) FROM guidance_items g WHERE ${whereClause}`;
    const countResult = await pgPool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count, 10);

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const dataQuery = `
      SELECT g.*,
             u_author.full_name as author_name,
             u_recipient.full_name as recipient_name
      FROM guidance_items g
      LEFT JOIN users u_author ON g.author_id = u_author.user_id
      LEFT JOIN users u_recipient ON g.recipient_id = u_recipient.user_id
      WHERE ${whereClause}
      ORDER BY g.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    queryParams.push(limit, offset);

    const dataResult = await pgPool.query(dataQuery, queryParams);
    const items: GuidanceItem[] = dataResult.rows;

    // Attach context_status to each item
    for (const item of items) {
      const context = await this.resolveContextEntity(item.context_type, item.context_id);
      item.context_status = context.exists ? 'active' : 'deleted';
      item.context_title = context.title || undefined;
    }

    return { items, total };
  }

  /**
   * Atomically transitions guidance state from OPEN to ACKNOWLEDGED.
   * Returns null if status is not 'open' (race condition or conflict).
   */
  async acknowledgeGuidance(guidanceId: string): Promise<GuidanceItem | null> {
    const query = `
      UPDATE guidance_items
      SET status = 'acknowledged',
          acknowledged_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE guidance_id = $1 AND status = 'open'
      RETURNING *
    `;
    const result = await pgPool.query(query, [guidanceId]);
    return result.rows[0] || null;
  }

  /**
   * Atomically transitions guidance state to RESOLVED.
   * Returns null if status is already 'resolved'.
   */
  async resolveGuidance(guidanceId: string, resolvedBy: string): Promise<GuidanceItem | null> {
    const query = `
      UPDATE guidance_items
      SET status = 'resolved',
          resolved_at = CURRENT_TIMESTAMP,
          resolved_by = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE guidance_id = $1 AND status IN ('open', 'acknowledged')
      RETURNING *
    `;
    const result = await pgPool.query(query, [guidanceId, resolvedBy]);
    return result.rows[0] || null;
  }
}

export const guidanceRepository = new GuidanceRepository();
