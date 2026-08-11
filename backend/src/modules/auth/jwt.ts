import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

// The single place that signs and verifies access tokens. Before this
// milestone, `process.env.JWT_SECRET || 'secret'` was duplicated across
// authController.ts (3 call sites) and middleware/auth.ts (1 call site) --
// a request with no JWT_SECRET set would silently sign/verify with the
// literal string "secret". env.ts now fails fast at boot if JWT_SECRET is
// missing (see config/env.ts), so the fallback itself is gone, not just
// centralized.

export interface AccessTokenPayload {
  userId: string;
  role: string;
  // Added by jsonwebtoken itself at sign time -- not something callers set.
  // Milestone 38: middleware/auth.ts compares this against the user's
  // password_changed_at to reject a token issued before their most recent
  // password reset.
  iat?: number;
  exp?: number;
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes, for the new cookie-based flow
export const LEGACY_BEARER_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days, unchanged -- see auth.service.ts for why
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Milestone 46: jsonwebtoken already refuses an unsigned/`alg: none`
// token unless the caller explicitly opts into `algorithms: ['none']`,
// and defaults to HS256/384/512 for a plain string secret (verified
// directly against the installed library) -- so this was never an
// active algorithm-confusion vulnerability. Naming the algorithm
// explicitly on both sides anyway is cheap, defensive clarity: it means
// a future change to this secret's type (e.g. to an asymmetric key) or
// to the library's own defaults can't silently widen what gets accepted
// without a corresponding, deliberate change here.
const JWT_ALGORITHM = 'HS256';

export const signAccessToken = (payload: AccessTokenPayload, expiresInSeconds: number = LEGACY_BEARER_TOKEN_TTL_SECONDS): string => {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: expiresInSeconds, algorithm: JWT_ALGORITHM });
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  return jwt.verify(token, env.jwtSecret, { algorithms: [JWT_ALGORITHM] }) as AccessTokenPayload;
};

// Refresh tokens, email-verification tokens, and password-reset tokens are
// all opaque random values sent to the user (email link, cookie) and never
// stored raw -- only their SHA-256 hash is persisted, so a database read
// alone can't be used to impersonate a user or reset a password.
export const generateOpaqueToken = (): string => crypto.randomBytes(32).toString('hex');

export const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');
