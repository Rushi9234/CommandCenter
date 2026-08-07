import { env } from '../../config/env';
import { Logger } from './logger.interface';
import { ConsoleLogger } from './consoleLogger';

// The one place that decides which Logger implementation is active,
// based on the LOGGER env var (config/env.ts). Application code calls
// getLogger() and never imports ConsoleLogger (or any future provider)
// directly. Adding PinoLogger/SentryLogger later means one new class
// implementing Logger and one branch here -- no call-site changes.
let cachedLogger: Logger | null = null;

export const getLogger = (): Logger => {
  if (cachedLogger) {
    return cachedLogger;
  }

  switch (env.loggerProvider) {
    case 'console':
    default:
      // Free-first default (Engineering Charter rule 1): an unrecognized
      // value falls back to the free console logger rather than failing
      // logging closed.
      cachedLogger = new ConsoleLogger();
      break;
  }

  return cachedLogger;
};

// Test-only: forces the next getLogger() call to re-read env.loggerProvider
// and re-select instead of reusing the cached instance.
export const resetLoggerCache = (): void => {
  cachedLogger = null;
};
