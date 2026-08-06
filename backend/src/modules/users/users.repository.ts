import { query, queryOne } from '../../db/client';

// Moved verbatim from the old databaseService.ts. createUser/getUserByEmail/
// getUserByUsername were dropped here -- they were dead code (grep confirmed
// zero callers); auth exclusively uses utils/postgresDB.ts's own versions,
// which this milestone deliberately does not touch.
export class UsersRepository {
  async getUserById(userId: string) {
    const text = 'SELECT * FROM users WHERE user_id = $1';
    return queryOne(text, [userId]);
  }

  async getAllUsers() {
    const text = `
      SELECT user_id, username, full_name, email, role, impact_score, streak_count, total_logs
      FROM users
      ORDER BY created_at DESC
    `;
    return query(text);
  }

  // NOTE: preserved as-is from the original implementation. This builds its
  // SET clause from the caller-supplied object's keys with no column
  // allowlist -- a known mass-assignment gap already flagged in the project
  // audit. Fixing it is explicitly out of scope for this architecture-only
  // milestone; tracked as follow-up work.
  async updateUser(userId: string, updates: Record<string, any>) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const text = `
      UPDATE users
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `;

    const params = [userId, ...Object.values(updates)];
    return queryOne(text, params);
  }
}

export const usersRepository = new UsersRepository();
