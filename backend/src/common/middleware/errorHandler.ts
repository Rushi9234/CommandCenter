import { NextFunction, Request, Response } from 'express';
import { AppError, BadRequestError, ConflictError } from '../errors';
import { getLogger } from '../logging/loggerFactory';

// Milestone 40: repository/service code throws an AppError for every
// failure it already knows how to name (a missing resource, a bad role) --
// but a handful of expected Postgres constraint violations (a duplicate
// insert racing past an application-level pre-check, a delete blocked by a
// still-referencing child row, a malformed UUID reaching a query with no
// earlier validation) were never caught anywhere, so they fell all the way
// through to the generic-500 branch below. Wrapping every INSERT/UPDATE/
// DELETE call site in its own try/catch would mean repeating the same
// three-way translation at dozens of places forever; this is the ONE place
// every thrown error already funnels through, so a small, narrow code ->
// AppError table here closes the whole class in one spot. Deliberately
// narrow: only the three codes this project has confirmed real, reachable
// cases for (see docs/security/SECURITY_FINDINGS.md) are translated. Any
// other code, or no `.code` at all (a plain JS error), is untouched and
// still becomes the generic 500 -- this is not "translate every Postgres
// error," it's "translate the ones we know are just an expected client
// mistake." The message returned to the client is always a generic,
// hand-written string -- never the raw Postgres error's own message,
// which can embed the table/constraint/column name.
const PG_ERROR_TRANSLATIONS: Record<string, () => AppError> = {
  '23505': () => new ConflictError('This request conflicts with an existing record'),
  '23503': () => new ConflictError('This action cannot be completed because related records still exist'),
  '22P02': () => new BadRequestError('One or more identifiers in this request are invalid'),
};

const translatePgError = (err: any): AppError | null => {
  const code = err?.code;
  return typeof code === 'string' && PG_ERROR_TRANSLATIONS[code] ? PG_ERROR_TRANSLATIONS[code]() : null;
};

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

  // Milestone 40: an untranslated raw Postgres error still gets logged with
  // its real code/message (debugging value, server-side only) but the
  // CLIENT only ever sees the safe, generic AppError this code maps to --
  // never the original err.message, which is exactly the thing that could
  // carry a table/constraint name.
  const translated = translatePgError(err);
  if (translated) {
    logger.error('Request error', {
      event: 'request.error',
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      errorType: 'PostgresError',
      pgCode: err.code,
      statusCode: translated.status,
    });
    return res.status(translated.status).json({ error: translated.message });
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
