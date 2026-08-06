import { query, queryOne, buildSetClause } from '../../db/client';

const AUTH_UPDATABLE_COLUMNS = [
  'is_verified',
  'verification_token',
  'verification_token_expires',
  'password_hash',
  'password_reset_token_hash',
  'password_reset_expires',
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
}

export const authRepository = new AuthRepository();
