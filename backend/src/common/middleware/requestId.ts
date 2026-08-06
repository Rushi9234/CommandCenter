import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

// Augments Express's own Request type so `req.requestId` is visible to
// every handler/middleware in the app (errorHandler included) without
// needing to import a custom Request subtype -- unlike AuthRequest
// (middleware/auth.ts), a request ID exists on every request, not just
// authenticated ones.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

// Generates a UUID per request, attaches it to req.requestId, and echoes
// it back as X-Request-ID so a client (or a log aggregator correlating
// client-side and server-side records) can tie a response to the log
// lines that were produced while handling it. Registered first in
// app.ts, before anything else, so every subsequent middleware/handler
// -- including errorHandler -- can rely on req.requestId being set.
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const id = randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
};
