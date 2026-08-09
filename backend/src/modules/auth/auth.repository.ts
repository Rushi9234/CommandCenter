import { query, queryOne, buildSetClause, withTransaction } from '../../db/client';

const AUTH_UPDATABLE_COLUMNS = [
  'is_verified',
  'verification_token',
  'verification_token_expires',
  'password_hash',
  'password_reset_token_hash',
  'password_reset_expires',
  'password_changed_at',
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

  // Milestone 38: the one extra query middleware/auth.ts's authenticate()
  // now runs on every authenticated request -- deliberately narrow (one
  // column, primary-key lookup) rather than fetching the whole user row.
  async getPasswordChangedAt(userId: string): Promise<Date | null> {
    const result = await queryOne<{ password_changed_at: Date | null }>(
      'SELECT password_changed_at FROM users WHERE user_id = $1',
      [userId]
    );
    return result?.password_changed_at ?? null;
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
