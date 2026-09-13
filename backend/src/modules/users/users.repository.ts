import { query, queryOne, buildSetClause } from '../../db/client';

const UPDATABLE_COLUMNS = ['impact_score', 'streak_count', 'total_logs', 'privacy_settings', 'notification_preferences', 'full_name', 'bio', 'pronouns', 'location', 'is_profile_public'];

export class UsersRepository {
  async getUserById(userId: string) {
    const text = 'SELECT * FROM users WHERE user_id = $1';
    return queryOne(text, [userId]);
  }

  async getProfileById(userId: string) {
    const text = `
      SELECT
        user_id, email, username, full_name, role,
        is_verified,
        -- Phase 4 email-change frontend: exposes the caller's OWN pending
        -- target address (never anyone else's -- this is GET /me, always
        -- scoped to req.user.userId) so the "verification pending" banner
        -- survives a page reload instead of only living in client-side
        -- React state set from request/resend's own response. Never the
        -- token hash or expiry -- those stay write-path-only, nothing a
        -- profile read needs.
        pending_email,
        bio, pronouns, location, is_profile_public,
        avatar_key, avatar_mime_type, avatar_size, avatar_width, avatar_height, avatar_uploaded_at,
        privacy_settings, notification_preferences,
        created_at, updated_at, impact_score, streak_count, total_logs, team_id
      FROM users
      WHERE user_id = $1
    `;
    return queryOne(text, [userId]);
  }

  async getPasswordHashById(userId: string) {
    const text = 'SELECT password_hash FROM users WHERE user_id = $1';
    const result = await queryOne<{ password_hash: string }>(text, [userId]);
    return result?.password_hash || null;
  }

  // Milestone 42: bulk counterpart to getUserById, for callers (e.g.
  // projects.service.ts's getProjectTasks) that used to fetch a whole
  // batch of users with one query per ID -- see tasks.repository.ts's
  // getTasksByIds for the matching fix on the task side of the same
  // N+1 shape.
  async getUsersByIds(userIds: string[]) {
    if (userIds.length === 0) {
      return [];
    }
    return query('SELECT * FROM users WHERE user_id = ANY($1)', [userIds]);
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
