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
// Milestone 47: closes a residual M45 documented but didn't fix --
// calculateGoalProgress's own cycle-safe rewrite and wouldCreateCycle
// (goals.repository.ts) prevent the ONE known unbounded-recursion shape
// at the point where a cycle could be written, but nothing here bounded
// how long ANY single query is allowed to run against the shared pool --
// a future runaway query (a bad migration, a new recursive feature, an
// index regression) would still be free to hold one of the 20 shared
// connections indefinitely, degrading every other in-flight request the
// same way M46's N+1 class did via connection *count* rather than
// connection *hold time*. 30s matches the ceiling this project already
// uses elsewhere for "this should never legitimately take this long"
// (Jest's own per-test timeout) -- generous for any real query in this
// app (the heaviest legitimate query, calculateGoalProgress's recursive
// CTE, finishes in milliseconds against realistic team sizes), but a
// real backstop against anything pathological. Applies per-connection at
// the Postgres session level (`pg` forwards it via `SET
// statement_timeout`), not per-request in application code.
// Milestone 47: bumped from 5000 -- directly measured (4 independent,
// isolated connection attempts against the real Neon endpoint, bypassing
// every layer of this app's own code) that a fresh connection can
// legitimately take 5.2-11.5 seconds to establish under ordinary, non-
// overloaded conditions, not just during an attack or this project's
// occasionally-documented severe flakiness episodes. 5000ms was cutting
// off a meaningful fraction of NORMAL connection attempts, not just
// pathological ones -- this is exactly the kind of thing Neon's own
// serverless-autosuspend/cold-start model can produce on an otherwise
// healthy connection, and the failure mode (a hard connection error, not
// a slow-but-successful query) is worse than a few extra seconds of
// wait. 10000ms is still a real ceiling -- it does not turn this into an
// unbounded wait -- just one that reflects measured reality rather than
// an arbitrary round number.
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
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
