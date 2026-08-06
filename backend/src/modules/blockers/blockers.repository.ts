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
    const built = buildSetClause(BLOCKER_UPDATABLE_COLUMNS, updates, 2);
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
}

export const blockersRepository = new BlockersRepository();
