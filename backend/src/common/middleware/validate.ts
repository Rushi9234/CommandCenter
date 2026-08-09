import { NextFunction, Request, Response } from 'express';
import { z, ZodSchema } from 'zod';
import { BadRequestError } from '../errors';

type Source = 'body' | 'query' | 'params';

// Parses req[source] against a Zod schema before the controller runs, and
// replaces req[source] with the parsed (and defaulted) result. On failure it
// raises the same BadRequestError -> 400 { error: string } shape the old
// per-controller `if (!field)` checks already produced, so existing clients
// see no difference on the happy path or on a validation failure.
export const validate = (schema: ZodSchema, source: Source = 'body') => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const firstIssue = result.error.issues[0];
      next(new BadRequestError(firstIssue?.message || 'Invalid request'));
      return;
    }

    (req as any)[source] = result.data;
    next();
  };
};

// Milestone 40: every route with a `:teamId`/`:projectId`/`:goalId`/etc.
// param passed it straight into a repository query with no validation at
// all -- a malformed value (not UUID-shaped) reached Postgres and threw
// 22P02, uncaught by anything upstream, all the way to the global error
// handler as a generic 500 instead of the clean 400 a malformed client
// input should produce. Reuses the exact same `validate` machinery
// already used for body/query, just aimed at 'params' -- one small,
// reusable middleware instead of a bespoke per-route check, and it runs
// BEFORE any of the route's other middleware (requireTeamRole,
// requireAccess, etc.), so a malformed ID never reaches a DB call at all.
export const validateUuidParams = (...paramNames: string[]) => {
  const shape: Record<string, ZodSchema> = {};
  for (const name of paramNames) {
    shape[name] = z.string().uuid(`Invalid ${name}`);
  }
  return validate(z.object(shape), 'params');
};
