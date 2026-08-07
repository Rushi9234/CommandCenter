import { app, dbMode } from './app';
import { pgPool } from './utils/database';
import { env } from './config/env';
import { getLogger } from './common/logging/loggerFactory';

// Thin entrypoint: build the app (app.ts), confirm whether Postgres is
// reachable, then listen. Milestone 8: the connection attempt is now
// retried with backoff instead of a single try, and production no longer
// falls back to listening in a non-functional mock mode -- it exits so the
// failure is loud (a crashed/restarting process, a failed deploy) instead
// of a server that reports itself running while unable to serve most of
// the API.
const CONNECT_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const connectWithRetry = async (): Promise<boolean> => {
  for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt++) {
    try {
      await pgPool.query('SELECT 1');
      return true;
    } catch (error: any) {
      // Some connection failures (e.g. ECONNREFUSED surfaced as an
      // AggregateError on newer Node versions) have an empty `.message` --
      // fall back to `.code`/`.toString()` so the log line is never blank.
      const detail = error.message || error.code || String(error);
      getLogger().error('PostgreSQL connection attempt failed', {
        event: 'db.connection_attempt_failed',
        attempt,
        maxAttempts: CONNECT_RETRIES,
        detail,
      });
      if (attempt < CONNECT_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  return false;
};

const listen = (mode: 'POSTGRESQL' | 'MOCK') => {
  app.listen(env.port, () => {
    getLogger().info('CommandCenter Backend running', {
      event: 'server.started',
      port: env.port,
      mode,
    });
  });
};

const startServer = async () => {
  const connected = await connectWithRetry();

  if (connected) {
    getLogger().info('PostgreSQL connected successfully', { event: 'db.connected' });
    dbMode.usePostgres = true;
    listen('POSTGRESQL');
    return;
  }

  if (env.isProduction) {
    getLogger().error('FATAL: could not connect to PostgreSQL, exiting -- production must not run without a database', {
      event: 'db.connection_exhausted',
      maxAttempts: CONNECT_RETRIES,
    });
    process.exit(1);
  }

  getLogger().info('Using mock database service (PostgreSQL unavailable)', { event: 'db.mock_mode', mode: 'MOCK' });
  listen('MOCK');
};

startServer();
