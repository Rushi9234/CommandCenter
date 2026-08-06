import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../modules/auth/jwt';
import { csrfTokenMatches } from '../common/security/csrf';

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
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const headerToken = req.headers.authorization?.split(' ')[1];
  const cookieToken = (req as any).cookies?.access_token;

  const token = headerToken || cookieToken;
  const viaCookie = !headerToken && !!cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = { userId: decoded.userId, role: decoded.role };
    req.authViaCookie = viaCookie;
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (viaCookie && UNSAFE_METHODS.includes(req.method) && !csrfTokenMatches(req)) {
    return res.status(403).json({ error: 'CSRF token missing or invalid' });
  }

  next();
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};
