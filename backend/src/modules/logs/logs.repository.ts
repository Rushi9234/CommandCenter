import { query, queryOne, buildSetClause } from '../../db/client';

const LOG_UPDATABLE_COLUMNS = ['entry_text', 'entry_summary', 'sentiment_score', 'bullet_points', 'word_count'];

// Moved verbatim from the old databaseService.ts (log methods) plus the
// streak calculation, which lived under a "USER STREAK METHODS" comment in
// the same file but operates purely on daily_logs.
export class LogsRepository {
  async createLog(logData: {
    user_id: string;
    entry_text: string;
    log_date: string;
    log_time: string;
    crypto_signature?: string;
    entry_summary?: string;
    bullet_points?: any;
    sentiment_score?: number;
    word_count?: number;
  }) {
    const text = `
      INSERT INTO daily_logs (
        user_id, entry_text, log_date, log_time, crypto_signature,
        entry_summary, bullet_points, sentiment_score, word_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const params = [
      logData.user_id,
      logData.entry_text,
      logData.log_date,
      logData.log_time,
      logData.crypto_signature || null,
      logData.entry_summary || null,
      JSON.stringify(logData.bullet_points || []),
      logData.sentiment_score || null,
      logData.word_count || logData.entry_text.split(' ').length,
    ];

    return queryOne<any>(text, params);
  }

  async getUserLogs(userId: string, limit?: number) {
    let text = `
      SELECT * FROM daily_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    const params: any[] = [userId];

    if (limit) {
      text += ` LIMIT $2`;
      params.push(limit);
    }

    return query<any>(text, params);
  }

  async getLogById(logId: string) {
    const text = 'SELECT * FROM daily_logs WHERE log_id = $1';
    return queryOne<any>(text, [logId]);
  }

  async updateLog(logId: string, updates: Record<string, any>) {
    const built = buildSetClause(LOG_UPDATABLE_COLUMNS, updates, 2);
    if (!built) {
      return this.getLogById(logId);
    }

    const text = `
      UPDATE daily_logs
      SET ${built.clause}, is_edited = true, updated_at = CURRENT_TIMESTAMP
      WHERE log_id = $1
      RETURNING *
    `;

    return queryOne<any>(text, [logId, ...built.values]);
  }

  // Milestone 6: ownership check moved here from logs.service.ts so it runs
  // in requireAccess middleware, matching the canWriteX pattern established
  // for projects/tasks/goals/blockers in Milestone 5.
  async canWriteLog(userId: string, logId: string): Promise<boolean> {
    const text = 'SELECT log_id FROM daily_logs WHERE log_id = $1 AND user_id = $2';
    const result = await queryOne(text, [logId, userId]);
    return result !== null;
  }

  async calculateStreak(userId: string): Promise<number> {
    const text = `
      WITH ordered_logs AS (
        SELECT DISTINCT log_date,
               log_date - LAG(log_date) OVER (ORDER BY log_date) as gap
        FROM daily_logs
        WHERE user_id = $1
        ORDER BY log_date DESC
      )
      SELECT COUNT(*) as streak
      FROM ordered_logs
      WHERE gap = 1 OR log_date = CURRENT_DATE
    `;
    const result = await queryOne<any>(text, [userId]);
    return result ? parseInt(result.streak) : 0;
  }
}

export const logsRepository = new LogsRepository();
