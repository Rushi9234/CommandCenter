import { query, queryOne, buildSetClause } from '../../db/client';

const UPDATABLE_COLUMNS = ['impact_score', 'streak_count', 'total_logs', 'privacy_settings'];

export class UsersRepository {
  async getUserById(userId: string) {
    const text = 'SELECT * FROM users WHERE user_id = $1';
    return queryOne(text, [userId]);
  }

  // Milestone 41: previously returned every user in the entire database --
  // no WHERE clause of any kind -- to any authenticated caller regardless
  // of team membership, unlike every other collection endpoint in the app
  // (teams, projects, goals, blockers, logs are all scoped to the
  // caller's own team(s)/resources). Confirmed there is no frontend
  // consumer of this endpoint at all and no legitimate product need for
  // org-wide email enumeration, so this is a real gap against the app's
  // own established privacy model, not a deliberate "company directory"
  // feature (contrast with GET /leaderboard, which IS deliberately global
  // -- see leaderboard.service.ts and docs/security/SECURITY_FINDINGS.md).
  // Scoped to "shares at least one team with the caller," matching the
  // same invariant every other resource list already uses -- not a new
  // authorization concept, and the caller's own row is included (they
  // trivially share a team with themselves via any team they belong to).
  async getAllUsers(callerId: string) {
    const text = `
      SELECT DISTINCT u.user_id, u.username, u.full_name, u.email, u.role, u.impact_score, u.streak_count, u.total_logs, u.created_at
      FROM users u
      INNER JOIN team_members tm ON u.user_id = tm.user_id
      WHERE tm.team_id IN (SELECT team_id FROM team_members WHERE user_id = $1)
      ORDER BY u.created_at DESC
    `;
    return query(text, [callerId]);
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
