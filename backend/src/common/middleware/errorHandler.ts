import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors';

// Single place that turns a thrown error into an HTTP response. Preserves the
// `{ error: string }` shape every controller already returned before this
// refactor. Known (AppError) failures keep their specific status and message;
// anything unexpected returns a generic 500 rather than leaking internals.
export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
};
