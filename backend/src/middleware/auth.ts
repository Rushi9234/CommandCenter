import { Request, Response, NextFunction } from 'express';
import type { File } from 'multer';
import { verifyAccessToken } from '../modules/auth/jwt';
import { csrfTokenMatches } from '../common/security/csrf';
import { authRepository } from '../modules/auth/auth.repository';
import { asyncHandler } from '../common/middleware/asyncHandler';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
  authViaCookie?: boolean;
  file?: File;
}

const UNSAFE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// The only place in the app that accepts a token and turns it into
// `req.user` -- every route that needs auth goes through this, and this is
// the only place that calls verifyAccessToken. It accepts two independent
// transports for the same kind of token:
//
//  1. `Authorization: Bearer <token>` header -- the long-lived legacy
//     token the current frontend already sends. Not vulnerable to CSRF
//     (a cross-site page cannot set a custom header on a request), so no
//     CSRF check applies to it.
//  2. `access_token` httpOnly cookie -- the short-lived token the new
//     refresh flow issues. Cookies are sent automatically by the browser,
//     which is exactly what makes them CSRF-exposed, so any state-changing
//     request authenticated this way must also present a matching
//     X-CSRF-Token header (double-submit pattern) or it's rejected.
// Milestone 38: wrapped in asyncHandler since this now does a DB lookup
// (getPasswordChangedAt) -- an async middleware whose promise rejects is
// NOT automatically caught by Express 4.x, unlike a synchronous throw;
// asyncHandler's existing .catch(next) is the same fix every async route
// handler in this app already relies on.
export const authenticate = asyncHandler<AuthRequest>(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const headerToken = req.headers.authorization?.split(' ')[1];
  const cookieToken = (req as any).cookies?.access_token;

  const token = headerToken || cookieToken;
  const viaCookie = !headerToken && !!cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Milestone 38: a JWT (legacy 7-day bearer, or the short-lived cookie
  // access token) is otherwise purely stateless -- nothing here touched
  // the database before this milestone, so resetPassword() revoking
  // refresh_tokens rows did nothing to stop an already-issued JWT from
  // continuing to authenticate for the rest of its own lifetime.
  // password_changed_at starts NULL and is only ever set by
  // resetPassword(), so this never rejects a token for an account that
  // has never reset its password -- no forced logout on migration.
  //
  // Originally implemented as `decoded.iat * 1000 < passwordChangedAt`.
  // That's provably unfixable by adjusting the comparison alone: `iat` is
  // whole seconds (jsonwebtoken floors Date.now()/1000 at sign time), so
  // whenever a password change and the login that follows it land in the
  // same wall-clock second -- routine when the DB is fast (a local
  // Postgres, e.g. CI's service container), rare over a higher-latency
  // one, which is why this only ever surfaced as a CI-only flake --
  // both the old (correctly-rejected) token and the brand new
  // (wrongly-rejected) one round to the identical iat second. No
  // threshold placed at second granularity can separate them; every
  // fix attempted here either let the old token back in or locked the
  // new one out.
  //
  // pwv (jwt.ts) sidesteps rounding entirely: it's the exact
  // password_changed_at the token was signed under, checked for exact
  // equality against the CURRENT value rather than compared as a
  // timestamp. A token from before the account's most recent change
  // always carries a different (or null) pwv than the current one and
  // is rejected; a token issued by the login that immediately follows a
  // change always carries that change's own value and matches, no
  // matter how little wall-clock time separates the two requests.
  // Tokens signed before this claim existed have `pwv === undefined`;
  // falling back to the old iat comparison for exactly those preserves
  // their prior behavior instead of force-logging-out every session
  // already in circulation the moment this deploys (they aged out
  // within LEGACY_BEARER_TOKEN_TTL_SECONDS / ACCESS_TOKEN_TTL_SECONDS
  // of that deploy either way).
  const passwordChangedAt = await authRepository.getPasswordChangedAt(decoded.userId);
  if (decoded.pwv !== undefined) {
    const currentPwv = passwordChangedAt ? passwordChangedAt.getTime() : null;
    if (decoded.pwv !== currentPwv) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } else if (passwordChangedAt && decoded.iat && decoded.iat * 1000 < passwordChangedAt.getTime()) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.user = { userId: decoded.userId, role: decoded.role };
  req.authViaCookie = viaCookie;

  if (viaCookie && UNSAFE_METHODS.includes(req.method) && !csrfTokenMatches(req)) {
    return res.status(403).json({ error: 'CSRF token missing or invalid' });
  }

  next();
});

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};
