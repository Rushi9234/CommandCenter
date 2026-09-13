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
        -- Phase 4 phone verification: the caller's OWN phone state (never
        -- the OTP hash/expiry/attempt count -- those stay write-path-only,
        -- matching pending_email's own precedent immediately above).
        phone_number, phone_verified,
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

  // ---- Phone verification (Profile Phase 4) ----
  //
  // Deliberately NOT routed through updateUser()/UPDATABLE_COLUMNS above:
  // phone_number, phone_verified, and the OTP columns must never be
  // reachable through the generic profile-update allowlist, or a client
  // could set phone_number (or worse, phone_verified) via
  // PUT /api/users/me/profile with no OTP involved at all -- exactly the
  // mass-assignment gap that allowlist exists to close for every OTHER
  // column. Every phone write goes through one of the dedicated methods
  // below instead, mirroring how auth.repository.ts keeps email-change's
  // pending_email/token columns in its OWN allowlist, separate from this
  // file's.

  // Issues a fresh OTP: sets the target phone number, the new hash +
  // expiry, and resets the attempt counter to 0 -- used by both
  // request-phone-verification (first request) and
  // resend-phone-verification (same phone_number value re-supplied by the
  // caller). A resend's new hash overwrites the old one in this same
  // UPDATE, which is what makes the previous OTP stop verifying --
  // there is no separate "invalidate" step, matching the email-change
  // token's identical single-slot-column precedent.
  async setPendingPhoneOtp(userId: string, phoneNumber: string, otpHash: string, expiresAt: Date) {
    const text = `
      UPDATE users
      SET phone_number = $2,
          phone_otp_hash = $3,
          phone_otp_expires = $4,
          phone_otp_attempts = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `;
    return queryOne<any>(text, [userId, phoneNumber, otpHash, expiresAt]);
  }

  // Narrow, write-adjacent read -- deliberately not part of
  // getProfileById's public-shaped SELECT (which never exposes the OTP
  // hash/expiry/attempt count), used only by users.service.ts's
  // resend/verify logic to decide cooldown/expiry/attempt state.
  async getPhoneVerificationState(userId: string) {
    const text = `
      SELECT phone_number, phone_verified, phone_otp_hash, phone_otp_expires, phone_otp_attempts
      FROM users
      WHERE user_id = $1
    `;
    return queryOne<{
      phone_number: string | null;
      phone_verified: boolean;
      phone_otp_hash: string | null;
      phone_otp_expires: Date | null;
      phone_otp_attempts: number;
    }>(text, [userId]);
  }

  // Atomically increments the attempt counter, scoped to "there is
  // currently a pending OTP at all" (phone_otp_hash IS NOT NULL) so a
  // wrong guess against an already-cleared/superseded OTP is a no-op
  // rather than incrementing a counter that no longer means anything.
  // Returns the new count so the caller can decide whether the 5-attempt
  // ceiling was just reached without a second round-trip.
  async incrementPhoneOtpAttempts(userId: string): Promise<number | null> {
    const text = `
      UPDATE users
      SET phone_otp_attempts = phone_otp_attempts + 1
      WHERE user_id = $1
        AND phone_otp_hash IS NOT NULL
      RETURNING phone_otp_attempts
    `;
    const result = await queryOne<{ phone_otp_attempts: number }>(text, [userId]);
    return result?.phone_otp_attempts ?? null;
  }

  // Invalidates the current OTP outright (5th failed attempt) without
  // touching phone_number or phone_verified -- the target number is still
  // "pending," just with no live OTP; the user must request a fresh one.
  async clearPhoneOtp(userId: string) {
    const text = `
      UPDATE users
      SET phone_otp_hash = NULL,
          phone_otp_expires = NULL,
          phone_otp_attempts = 0
      WHERE user_id = $1
    `;
    return query(text, [userId]);
  }

  // Atomically finds-and-consumes a still-valid, hash-matching OTP in one
  // UPDATE -- identical race-safety rationale to
  // authRepository.consumeEmailChangeToken: Postgres row-level locking
  // means at most one concurrent call can match and clear a given
  // (userId, otpHash) pair, so a race between two near-simultaneous
  // verify attempts (or a resend racing a verify) resolves to "at most
  // one succeeds," never a double-verify or a stale-OTP false accept. A
  // null return means the OTP was already superseded/expired/cleared
  // between the caller's read and this write -- treated identically to
  // "wrong code" by users.service.ts, never a distinct error.
  async verifyPhoneOtp(userId: string, otpHash: string) {
    const text = `
      UPDATE users
      SET phone_verified = true,
          phone_otp_hash = NULL,
          phone_otp_expires = NULL,
          phone_otp_attempts = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
        AND phone_otp_hash = $2
        AND phone_otp_expires > CURRENT_TIMESTAMP
      RETURNING *
    `;
    return queryOne<any>(text, [userId, otpHash]);
  }
}

export const usersRepository = new UsersRepository();
