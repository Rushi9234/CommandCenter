import { app, dbMode } from './app';
import { pgPool } from './utils/database';
import { env } from './config/env';

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
      console.error(`PostgreSQL connection attempt ${attempt}/${CONNECT_RETRIES} failed: ${detail}`);
      if (attempt < CONNECT_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  return false;
};

const listen = (mode: 'POSTGRESQL' | 'MOCK') => {
  app.listen(env.port, () => {
    console.log(`\n🚀 CommandCenter Backend running on port ${env.port}`);
    console.log(`📡 API: http://localhost:${env.port}/api`);
    console.log(`💚 Health: http://localhost:${env.port}/health`);
    console.log(`\n⚡ Running in ${mode} mode with persistent storage\n`);
  });
};

const startServer = async () => {
  const connected = await connectWithRetry();

  if (connected) {
    console.log('✅ PostgreSQL connected successfully');
    dbMode.usePostgres = true;
    listen('POSTGRESQL');
    return;
  }

  if (env.isProduction) {
    console.error(
      `FATAL: could not connect to PostgreSQL after ${CONNECT_RETRIES} attempts. Exiting -- production must not run without a database.`
    );
    process.exit(1);
  }

  console.log('\n📝 Using Mock Database Service for testing (data persists during server runtime)\n');
  listen('MOCK');
};

startServer();
