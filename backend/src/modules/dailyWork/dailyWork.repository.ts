import { query, queryOne } from '../../db/client';

// Milestone 49: raw multi-entry daily work log + AI-drafted/user-confirmed
// final submission -- see migrations/1786462800000_add-daily-work-entries-
// and-submissions.sql for why this is a new, team-scoped model rather than
// a daily_logs extension (daily_logs stays exactly as-is, serving its own
// existing personal single-entry use case unchanged).
export class DailyWorkRepository {
  async createEntry(userId: string, teamId: string, entryText: string) {
    const text = `
      INSERT INTO daily_work_entries (user_id, team_id, entry_text)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    return queryOne<any>(text, [userId, teamId, entryText]);
  }

  async countTodaysEntries(userId: string, teamId: string): Promise<number> {
    const text = `
      SELECT COUNT(*) AS count FROM daily_work_entries
      WHERE user_id = $1 AND team_id = $2 AND entry_date = CURRENT_DATE
    `;
    const result = await queryOne<any>(text, [userId, teamId]);
    return result ? Number(result.count) : 0;
  }

  // Milestone 49: entry_date = CURRENT_DATE filtered in SQL, not compared
  // against a JS-constructed date string -- the exact fix M46 already
  // established for the same DATE-column/JS-Date mismatch class (see
  // logs.repository.ts's getTodaysLogsForUsers).
  async getTodaysEntries(userId: string, teamId: string) {
    const text = `
      SELECT * FROM daily_work_entries
      WHERE user_id = $1 AND team_id = $2 AND entry_date = CURRENT_DATE
      ORDER BY created_at ASC
    `;
    return query<any>(text, [userId, teamId]);
  }

  async getSubmission(userId: string, teamId: string, workDate: string) {
    const text = `
      SELECT * FROM daily_work_submissions
      WHERE user_id = $1 AND team_id = $2 AND work_date = $3
    `;
    return queryOne<any>(text, [userId, teamId, workDate]);
  }

  async hasSubmittedToday(userId: string, teamId: string): Promise<boolean> {
    const text = `
      SELECT 1 FROM daily_work_submissions
      WHERE user_id = $1 AND team_id = $2 AND work_date = CURRENT_DATE
    `;
    const result = await queryOne(text, [userId, teamId]);
    return result !== null;
  }

  // Milestone 49: relies on the UNIQUE(user_id, team_id, work_date)
  // constraint (migration) for the actual race-safety guarantee -- a
  // concurrent double-submit-click races on the same INSERT, and the
  // loser's 23505 is translated into a clean 409 by the existing
  // errorHandler.ts (M40) with no bespoke locking/transaction needed
  // here, the same pattern daily_logs' own createLog already relies on.
  async createSubmission(userId: string, teamId: string, aiSummary: string | null, confirmedSummary: string) {
    const text = `
      INSERT INTO daily_work_submissions (user_id, team_id, work_date, ai_summary, confirmed_summary)
      VALUES ($1, $2, CURRENT_DATE, $3, $4)
      RETURNING *
    `;
    return queryOne<any>(text, [userId, teamId, aiSummary, confirmedSummary]);
  }

  // Milestone 49: team-wide view for progress/history -- one bulk query
  // joining usernames, not a per-member fan-out (the exact N+1 shape
  // M42/M46 already fixed elsewhere in this codebase; not repeating it
  // here). workDate is optional and defaults to CURRENT_DATE IN SQL, not
  // a JS-computed date string -- the exact DATE-column/JS-Date timezone
  // mismatch class M46 already found and fixed once (getTodaysLogsForUsers);
  // never re-introduce it by computing "today" in JS again.
  // Milestone 53: personal history -- scoped to user_id = $1 (the
  // authenticated caller, never a client-supplied value) AND team_id = $2,
  // never a team-wide read. Deliberately returns only work_date/
  // confirmed_summary/confirmed_at (no ai_summary, no submission_id, no
  // user_id/team_id -- the caller already knows which user/team this is)
  // -- the smallest field set the history UI actually needs, matching the
  // "don't add fields for future use" discipline this project already
  // applies elsewhere (M40's permissions: z.any(), M48's team_type).
  async getMySubmissionHistory(userId: string, teamId: string, limit: number) {
    const text = `
      SELECT work_date, confirmed_summary, confirmed_at
      FROM daily_work_submissions
      WHERE user_id = $1 AND team_id = $2
      ORDER BY work_date DESC
      LIMIT $3
    `;
    return query<any>(text, [userId, teamId, limit]);
  }

  async getTeamSubmissionsForDate(teamId: string, workDate?: string) {
    const text = `
      SELECT s.*, u.username, u.full_name
      FROM daily_work_submissions s
      INNER JOIN users u ON s.user_id = u.user_id
      WHERE s.team_id = $1 AND s.work_date = COALESCE($2::date, CURRENT_DATE)
      ORDER BY s.confirmed_at ASC
    `;
    return query<any>(text, [teamId, workDate || null]);
  }
}

export const dailyWorkRepository = new DailyWorkRepository();
