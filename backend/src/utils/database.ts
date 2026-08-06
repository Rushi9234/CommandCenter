import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// The single PostgreSQL connection pool in the app. Every repository reaches
// this through db/client.ts; nothing else should call `new Pool()` -- a
// second one (utils/postgresDB.ts, removed in Milestone 3) used to exist and
// was the reason register/login broke against Neon in development.
//
// Deliberately no explicit `ssl` option here. Neon's connection string
// already carries `sslmode=require&channel_binding=require`, and `pg`
// honors that automatically when `ssl` is left undefined. The removed
// postgresDB.ts pool set `ssl: false` whenever NODE_ENV wasn't
// "production", which fought the connection string's own SSL requirement
// and broke the handshake. Leaving `ssl` unset is what makes this work
// identically in development and production against Neon -- don't add an
// explicit ssl override back in without re-testing against Neon in dev.
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// pg's Pool emits 'error' on idle-client errors (e.g. the server closing a
// connection in the background). Without a listener, that's an unhandled
// 'error' event, which crashes the process. This is the only change here
// beyond consolidation -- the original code had no listener at all.
pgPool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

// Drains the pool on shutdown so in-flight queries get a chance to finish
// and the process doesn't leave dangling connections against Neon.
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received: closing PostgreSQL pool...`);
  try {
    await pgPool.end();
  } catch (err: any) {
    console.error('Error closing PostgreSQL pool:', err.message);
  }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
