import { query, queryOne, buildSetClause } from '../../db/client';

const UPDATABLE_COLUMNS = ['impact_score', 'streak_count', 'total_logs', 'privacy_settings'];

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

  // The dynamic SET clause is now built from an explicit column allowlist
  // (db/client.ts's buildSetClause) instead of every key the caller passed
  // -- closes the mass-assignment gap flagged since the original audit.
  // user_id, email, username, password_hash, role, and is_verified can
  // never be set through this method regardless of what's in `updates`.
  async updateUser(userId: string, updates: Record<string, any>) {
    const built = buildSetClause(UPDATABLE_COLUMNS, updates, 2);
    if (!built) {
      return this.getUserById(userId);
    }

    const text = `
      UPDATE users
      SET ${built.clause}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `;

    return queryOne(text, [userId, ...built.values]);
  }
}

export const usersRepository = new UsersRepository();
