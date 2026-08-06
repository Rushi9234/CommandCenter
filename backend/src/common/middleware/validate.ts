import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
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
