import { NextFunction, Request, Response } from 'express';

// Wraps an async route handler so a rejected promise reaches Express's error
// pipeline (and errorHandler.ts) instead of crashing the process or hanging
// the request. Controllers no longer need their own try/catch.
export const asyncHandler = <Req extends Request = Request>(
  handler: (req: Req, res: Response, next: NextFunction) => Promise<unknown>
) => {
  return (req: Req, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
};
