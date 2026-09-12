import { Pool } from 'pg';

// A separate pool from the app's own pgPool (src/utils/database.ts),
// used only by tests to reset table state between tests. Connects to
// whatever DATABASE_URL tests/setup/env.ts already validated points at
// commandcenter_test.
export const testPool = new Pool({ connectionString: process.env.DATABASE_URL });

// `notifications` was previously omitted here even though it has a FK to
// `users` (ON DELETE CASCADE) -- Postgres's TRUNCATE ... CASCADE already
// implicitly locks and empties it as a dependent table regardless of
// whether it's named, so this addition is not what actually fixes
// anything (see users.controller.ts's changePassword for the real fix:
// an unawaited notification INSERT racing this TRUNCATE, not this list
// being incomplete). Named explicitly anyway to match every other
// cascade-reachable table already listed here for clarity (e.g.
// `messages` is likewise redundant with `blockers`'s cascade).
const TABLES = [
  'notifications',
  'messages',
  'blockers',
  'daily_work_submissions',
  'daily_work_entries',
  'daily_logs',
  'tasks',
  'goals',
  'projects',
  'join_requests',
  'team_invites',
  'refresh_tokens',
  'team_members',
  'teams',
  'users',
];

// Truncates every application table, restarting identity and cascading
// through foreign keys, so each test starts from a genuinely empty
// database instead of relying on leftover state from a previous test.
export const resetDatabase = async (): Promise<void> => {
  await testPool.query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
};

export const closeTestPool = async (): Promise<void> => {
  await testPool.end();
};
