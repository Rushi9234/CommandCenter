import { Request } from 'express';

// Single implementation of the double-submit comparison, used by both
// middleware/auth.ts (for any cookie-authenticated request to a protected
// route) and authController's refresh/logout (which read their credential
// from a cookie before authenticate ever runs, so they need the same check
// applied independently). Duplicating this comparison in three places was
// exactly the kind of "duplicate auth logic" this milestone's objectives
// call out to remove.
export const csrfTokenMatches = (req: Request): boolean => {
  const cookieCsrf = (req as any).cookies?.csrf_token;
  const headerCsrf = req.headers['x-csrf-token'];
  return !!cookieCsrf && !!headerCsrf && cookieCsrf === headerCsrf;
};
