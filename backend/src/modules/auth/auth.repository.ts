import { query, queryOne, buildSetClause, withTransaction } from '../../db/client';

const AUTH_UPDATABLE_COLUMNS = [
  'is_verified',
  'verification_token',
  'verification_token_expires',
  'password_hash',
  'password_reset_token_hash',
  'password_reset_expires',
  'password_changed_at',
  // Phase 4 email-change verification -- request/resend both go through
  // this same generic updateUser() (matching how every other single-slot
  // token pair above is written), not a dedicated method, since neither
  // sets more than these three columns at once. The actual email swap
  // (email = pending_email) is deliberately NOT reachable through this
  // allowlisted generic path -- see consumeEmailChangeToken() below,
  // which is the one and only place `email` itself is ever written by
  // this repository outside of createUser.
  'pending_email',
  'email_change_token_hash',
  'email_change_expires',
];

export class AuthRepository {
  async createUser(
    email: string,
    username: string,
    fullName: string,
    passwordHash: string,
    verificationTokenHash: string | null,
    verificationTokenExpires: Date | null
  ) {
    const text = `
      INSERT INTO users (email, username, full_name, password_hash, is_verified, verification_token, verification_token_expires)
      VALUES ($1, $2, $3, $4, false, $5, $6)
      RETURNING *
    `;
    return queryOne<any>(text, [email, username, fullName, passwordHash, verificationTokenHash, verificationTokenExpires]);
  }

  async getUserByEmail(email: string) {
    return queryOne<any>('SELECT * FROM users WHERE email = $1', [email]);
  }

  // Milestone 40: register()'s pre-check only ever looked up email, never
  // username -- both columns carry their own UNIQUE constraint
  // (database/schema.sql), so a duplicate USERNAME with a brand-new email
  // was never caught by application code at all and hit the raw 23505
  // unique-violation straight from createUser's INSERT, previously
  // uncaught -> generic 500 (not a race, a plain, always-reproducible
  // bug). See auth.service.ts's register() for the actual check.
  async getUserByUsername(username: string) {
    return queryOne<any>('SELECT * FROM users WHERE username = $1', [username]);
  }

  async getUserById(userId: string) {
    return queryOne<any>('SELECT * FROM users WHERE user_id = $1', [userId]);
  }

  // Same allowlisted-update pattern introduced in Milestone 3 -- a client
  // can never reach this with arbitrary keys (auth.service.ts only ever
  // calls it with a fixed, known shape), but the allowlist stays as
  // defense-in-depth and for consistency with every other repository.
  async updateUser(userId: string, updates: Record<string, any>) {
    const built = buildSetClause(AUTH_UPDATABLE_COLUMNS, updates, 2);
    if (!built) {
      return this.getUserById(userId);
    }

    const text = `
      UPDATE users
      SET ${built.clause}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `;
    return queryOne<any>(text, [userId, ...built.values]);
  }

  // Looks a user up by the HASH of their raw verification token, not by
  // treating the token as an email (the bug flagged in every prior audit).
  // Also enforces expiry -- verification tokens never expired before.
  async getUserByVerificationTokenHash(tokenHash: string) {
    const text = `
      SELECT * FROM users
      WHERE verification_token = $1
        AND verification_token_expires > CURRENT_TIMESTAMP
    `;
    return queryOne<any>(text, [tokenHash]);
  }

  async getUserByPasswordResetTokenHash(tokenHash: string) {
    const text = `
      SELECT * FROM users
      WHERE password_reset_token_hash = $1
        AND password_reset_expires > CURRENT_TIMESTAMP
    `;
    return queryOne<any>(text, [tokenHash]);
  }

  // Milestone 38, extended by Phase 4 email-change: the one extra query
  // middleware/auth.ts's authenticate() now runs on every authenticated
  // request -- deliberately narrow (two columns, primary-key lookup)
  // rather than fetching the whole user row. Combined into one query
  // (rather than a second getEmailChangedAt-style method) so email-change
  // invalidation doesn't double this already-hot-path query.
  async getSessionInvalidationFields(userId: string): Promise<{ password_changed_at: Date | null; email_changed_at: Date | null } | null> {
    return queryOne<{ password_changed_at: Date | null; email_changed_at: Date | null }>(
      'SELECT password_changed_at, email_changed_at FROM users WHERE user_id = $1',
      [userId]
    );
  }

  // Looks a user up by the HASH of their raw email-change verification
  // token, matching getUserByVerificationTokenHash/
  // getUserByPasswordResetTokenHash's exact pattern above. Only used to
  // check "is this token currently valid" (e.g. before generating a fresh
  // one on resend) -- actually consuming a valid token goes through
  // consumeEmailChangeToken() below, not this method plus a separate
  // UPDATE, precisely to avoid a lookup-then-write race.
  async getUserByEmailChangeTokenHash(tokenHash: string) {
    const text = `
      SELECT * FROM users
      WHERE email_change_token_hash = $1
        AND email_change_expires > CURRENT_TIMESTAMP
    `;
    return queryOne<any>(text, [tokenHash]);
  }

  // Atomically finds-and-consumes a still-valid email-change token in one
  // UPDATE: Postgres row-level locking means at most one concurrent call
  // with the same token hash can ever match and clear it, so a replayed or
  // double-submitted verify request safely resolves to "second one finds
  // nothing" rather than a race between a separate SELECT and UPDATE. A
  // null return covers invalid, expired, and already-consumed alike --
  // deliberately indistinguishable to the caller (see auth.service.ts's
  // verifyEmailChange), matching this codebase's existing generic-message
  // convention for every other token-verification failure. Revoking every
  // refresh token in the same transaction mirrors
  // resetPasswordAndRevokeSessions's exact rationale: an email change is at
  // least as sensitive as a password change, and must not leave a
  // session that predates it (possibly the very session that completed an
  // account takeover) still valid afterward.
  async consumeEmailChangeToken(tokenHash: string) {
    return withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE users
         SET email = pending_email,
             pending_email = NULL,
             email_change_token_hash = NULL,
             email_change_expires = NULL,
             email_changed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE email_change_token_hash = $1
           AND email_change_expires > CURRENT_TIMESTAMP
         RETURNING *`,
        [tokenHash]
      );
      const user = result.rows[0] || null;
      if (user) {
        await client.query(`UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL`, [
          user.user_id,
        ]);
      }
      return user;
    });
  }

  // Milestone 38: the password update and the refresh-token revocation
  // that follows it used to be two separate statements with no
  // transaction between them -- if the revocation failed after the
  // password change had already committed (a transient DB error, a
  // dropped connection), the new password would take effect but the
  // attacker's stolen refresh token (and, before this milestone, any
  // already-issued JWT) would remain valid, exactly the "compromised
  // session survives the reset meant to end it" scenario resetPassword
  // exists to prevent. Both statements now commit or roll back together.
  async resetPasswordAndRevokeSessions(userId: string, passwordHash: string, passwordChangedAt: Date): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET password_hash = $1,
             password_reset_token_hash = NULL,
             password_reset_expires = NULL,
             password_changed_at = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3`,
        [passwordHash, passwordChangedAt, userId]
      );
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
      );
    });
  }

  // ---- Refresh tokens ----

  async createRefreshToken(userId: string, tokenHash: string, expiresAt: Date) {
    const text = `
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    return queryOne<any>(text, [userId, tokenHash, expiresAt]);
  }

  async getValidRefreshToken(tokenHash: string) {
    const text = `
      SELECT * FROM refresh_tokens
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
    `;
    return queryOne<any>(text, [tokenHash]);
  }

  async revokeRefreshToken(tokenId: string) {
    const text = `
      UPDATE refresh_tokens
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE token_id = $1
    `;
    return query(text, [tokenId]);
  }

  // Called on password reset -- every existing session gets logged out,
  // not just the one that triggered the reset.
  async revokeAllRefreshTokensForUser(userId: string) {
    const text = `
      UPDATE refresh_tokens
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND revoked_at IS NULL
    `;
    return query(text, [userId]);
  }

  // Milestone 8: refresh_tokens only ever grew -- revoke set revoked_at but
  // nothing ever deleted a row. Scoped strictly to tokens that are already
  // expired or already revoked; a token that's neither (still active, still
  // in its validity window) is never touched, so this can't race an
  // in-flight refresh. Returns the deleted rows so the cleanup job can log
  // how many it removed.
  async deleteExpiredRefreshTokens() {
    const text = `
      DELETE FROM refresh_tokens
      WHERE expires_at < CURRENT_TIMESTAMP
         OR revoked_at IS NOT NULL
      RETURNING token_id
    `;
    return query<{ token_id: string }>(text);
  }
}

export const authRepository = new AuthRepository();
