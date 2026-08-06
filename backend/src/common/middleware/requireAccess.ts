import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';

// Wraps a boolean "can this user reach this resource" check (a repository's
// canAccessX method) as route middleware. This is the one place that turns
// "creator, or a member of the owning team" into a 403 -- every route using
// it calls the exact same repository logic the read/enrichment paths
// already used, so there's one rule per resource type, not one per route.
export const requireAccess = (
  checkAccess: (req: AuthRequest) => Promise<boolean>,
  message: string = 'Access denied'
) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const allowed = await checkAccess(req);
      if (!allowed) {
        return res.status(403).json({ error: message });
      }
      next();
    } catch (error) {
      // An async Express middleware that rejects without catching is an
      // unhandled promise rejection, not a clean 500 -- the independent
      // review that found this pointed out authenticate.ts already guards
      // its own async work; this middleware didn't.
      next(error);
    }
  };
};
