// Charter rules 2/13: application code must never call console (or pino,
// or Sentry, or any logging vendor) directly. Every call site imports
// getLogger() (loggerFactory.ts) and calls it through this interface.

export interface LogContext {
  requestId?: string;
  userId?: string;
  module?: string;
  action?: string;
  errorType?: string;
  statusCode?: number;
  // Call sites attach whatever else is relevant to that one log line
  // (email, reason, attempt count, etc.) -- kept open rather than
  // enumerating every field every module might ever want, per "do not
  // over-engineer".
  [key: string]: unknown;
}

export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}
