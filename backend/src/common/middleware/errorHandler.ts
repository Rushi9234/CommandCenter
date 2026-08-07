import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors';
import { getLogger } from '../logging/loggerFactory';

// Single place that turns a thrown error into an HTTP response. Preserves the
// `{ error: string }` shape every controller already returned before this
// refactor. Known (AppError) failures keep their specific status and message;
// anything unexpected returns a generic 500 rather than leaking internals.
//
// Milestone 11: every branch now logs a structured line carrying the
// request ID (requestId.ts, registered before every route), HTTP method,
// route path, and the error's type/status -- enough to correlate a log
// line back to the request that produced it without ever including
// request bodies, headers, or the error's own message/stack for AppErrors
// (those are expected, user-facing failures, not something that needs a
// stack trace). Unexpected errors still log their message for debugging,
// same as before -- nothing in this app's error paths puts a secret in
// `err.message` (passwords/tokens are never echoed back in a thrown
// error), so this doesn't introduce a new leakage risk.
export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  const logger = getLogger();

  if (err instanceof AppError) {
    logger.error('Request error', {
      event: 'request.error',
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      errorType: err.constructor.name,
      statusCode: err.status,
    });
    return res.status(err.status).json({ error: err.message });
  }

  logger.error('Request error', {
    event: 'request.error',
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    errorType: err?.constructor?.name || 'UnknownError',
    statusCode: 500,
    errorMessage: err?.message,
  });
  res.status(500).json({ error: 'Internal server error' });
};
