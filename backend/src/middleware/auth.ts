import { Request, Response, NextFunction } from 'express';
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
  const passwordChangedAt = await authRepository.getPasswordChangedAt(decoded.userId);
  if (passwordChangedAt && decoded.iat && decoded.iat * 1000 < passwordChangedAt.getTime()) {
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
