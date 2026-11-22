import { query, queryOne, buildSetClause } from '../../db/client';

const BLOCKER_UPDATABLE_COLUMNS = [
  'title',
  'description',
  'blocker_type',
  'urgency',
  'impact',
  'affected_tasks',
  'attempted_solutions',
  'severity',
  'status',
  'resolved_by',
  'ai_suggestions',
  'similar_blockers',
  'suggested_helpers',
  'resolved_at',
  'resolution_notes',
];

// Moved verbatim from the old databaseService.ts (blocker + message methods).
export class BlockersRepository {
  async createBlocker(blockerData: {
    team_id: string;
    title: string;
    description?: string;
    blocker_type?: string;
    urgency?: string;
    impact?: string;
    affected_tasks?: any[];
    attempted_solutions?: string;
    created_by: string;
    ai_suggestions?: any[];
    similar_blockers?: any[];
    suggested_helpers?: any[];
  }) {
    const text = `
      INSERT INTO blockers (
        team_id, title, description, blocker_type, urgency, impact,
        affected_tasks, attempted_solutions, created_by, ai_suggestions,
        similar_blockers, suggested_helpers
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const params = [
      blockerData.team_id,
      blockerData.title,
      blockerData.description || null,
      blockerData.blocker_type || 'technical',
      blockerData.urgency || 'medium',
      blockerData.impact || 'blocks_task',
      JSON.stringify(blockerData.affected_tasks || []),
      blockerData.attempted_solutions || null,
      blockerData.created_by,
      JSON.stringify(blockerData.ai_suggestions || []),
      JSON.stringify(blockerData.similar_blockers || []),
      JSON.stringify(blockerData.suggested_helpers || []),
    ];

    return queryOne<any>(text, params);
  }

  async getBlocker(blockerId: string) {
    const text = 'SELECT * FROM blockers WHERE blocker_id = $1';
    return queryOne<any>(text, [blockerId]);
  }

  async getTeamBlockers(teamId: string) {
    const text = `
      SELECT * FROM blockers
      WHERE team_id = $1
      ORDER BY created_at DESC
    `;
    return query<any>(text, [teamId]);
  }

  async updateBlocker(blockerId: string, updates: Record<string, any>) {
    const sanitizedUpdates = { ...updates };
    if (sanitizedUpdates.ai_suggestions !== undefined) {
      sanitizedUpdates.ai_suggestions = typeof sanitizedUpdates.ai_suggestions === 'object' && sanitizedUpdates.ai_suggestions !== null
        ? JSON.stringify(sanitizedUpdates.ai_suggestions)
        : sanitizedUpdates.ai_suggestions;
    }
    if (sanitizedUpdates.similar_blockers !== undefined) {
      sanitizedUpdates.similar_blockers = typeof sanitizedUpdates.similar_blockers === 'object' && sanitizedUpdates.similar_blockers !== null
        ? JSON.stringify(sanitizedUpdates.similar_blockers)
        : sanitizedUpdates.similar_blockers;
    }
    if (sanitizedUpdates.affected_tasks !== undefined) {
      sanitizedUpdates.affected_tasks = typeof sanitizedUpdates.affected_tasks === 'object' && sanitizedUpdates.affected_tasks !== null
        ? JSON.stringify(sanitizedUpdates.affected_tasks)
        : sanitizedUpdates.affected_tasks;
    }
    if (sanitizedUpdates.suggested_helpers !== undefined) {
      sanitizedUpdates.suggested_helpers = typeof sanitizedUpdates.suggested_helpers === 'object' && sanitizedUpdates.suggested_helpers !== null
        ? JSON.stringify(sanitizedUpdates.suggested_helpers)
        : sanitizedUpdates.suggested_helpers;
    }

    const built = buildSetClause(BLOCKER_UPDATABLE_COLUMNS, sanitizedUpdates, 2);
    if (!built) {
      return this.getBlocker(blockerId);
    }

    const text = `
      UPDATE blockers
      SET ${built.clause}, updated_at = CURRENT_TIMESTAMP
      WHERE blocker_id = $1
      RETURNING *
    `;

    return queryOne<any>(text, [blockerId, ...built.values]);
  }

  // Milestone 46: batch counterpart to the per-blocker getBlockerMessages
  // fan-out getTeamBlockers' service-layer enrichment used to do -- one
  // GROUP BY query for every matched blocker's message count at once.
  async getMessageCounts(blockerIds: string[]): Promise<Record<string, number>> {
    if (blockerIds.length === 0) {
      return {};
    }
    const rows = await query<{ blocker_id: string; count: string }>(
      'SELECT blocker_id, COUNT(*) AS count FROM messages WHERE blocker_id = ANY($1) GROUP BY blocker_id',
      [blockerIds]
    );
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.blocker_id] = Number(row.count);
    }
    return counts;
  }

  async getBlockerMessages(blockerId: string) {
    const text = `
      SELECT m.*, u.username, u.full_name
      FROM messages m
      INNER JOIN users u ON m.user_id = u.user_id
      WHERE m.blocker_id = $1
      ORDER BY m.created_at ASC
    `;
    return query<any>(text, [blockerId]);
  }

  async createMessage(blockerId: string, userId: string, messageText: string) {
    const text = `
      INSERT INTO messages (blocker_id, user_id, message_text)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    return queryOne<any>(text, [blockerId, userId, messageText]);
  }

  // Milestone 5: blockers.team_id is NOT NULL -- unlike projects/goals,
  // every blocker is team-scoped, so this is a pure membership check, no
  // creator-ownership fallback needed. update/messages/ai-advice had no
  // authorization check of any kind before this milestone.
  async canAccessBlocker(userId: string, blockerId: string): Promise<boolean> {
    const text = `
      SELECT b.blocker_id FROM blockers b
      WHERE b.blocker_id = $1 AND b.team_id IN (
        SELECT team_id FROM team_members WHERE user_id = $2
      )
    `;
    const result = await queryOne(text, [blockerId, userId]);
    return result !== null;
  }

  // Milestone 5 review: same viewer-exclusion fix as
  // projects.repository.ts's canWriteProject.
  async canWriteBlocker(userId: string, blockerId: string): Promise<boolean> {
    const text = `
      SELECT b.blocker_id FROM blockers b
      WHERE b.blocker_id = $1 AND b.team_id IN (
        SELECT team_id FROM team_members WHERE user_id = $2 AND role != 'viewer'
      )
    `;
    const result = await queryOne(text, [blockerId, userId]);
    return result !== null;
  }

  async getResolvedBlockersInScope(teamId: string) {
    const text = `
      SELECT 
        b.blocker_id,
        b.team_id,
        b.title,
        b.description,
        b.blocker_type,
        b.attempted_solutions,
        b.resolution_notes,
        b.created_at,
        b.resolved_at,
        u_res.full_name AS resolver_name,
        u_res.username AS resolver_username,
        t.team_name
      FROM blockers b
      JOIN teams t ON b.team_id = t.team_id
      LEFT JOIN users u_res ON b.resolved_by = u_res.user_id
      WHERE b.status = 'resolved'
        AND (
          b.team_id = $1
          OR b.team_id IN (
            SELECT t2.team_id FROM teams t1
            JOIN teams t2 ON (t1.parent_team_id IS NOT NULL AND t2.parent_team_id = t1.parent_team_id)
                          OR (t1.team_type = 'classroom' AND t2.parent_team_id = t1.team_id)
                          OR (t2.team_id = t1.parent_team_id)
            WHERE t1.team_id = $1
          )
        )
      ORDER BY b.resolved_at DESC NULLS LAST
      LIMIT 25
    `;
    return query<any>(text, [teamId]);
  }
}

export const blockersRepository = new BlockersRepository();
