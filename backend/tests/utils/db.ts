import { Pool } from 'pg';

// A separate pool from the app's own pgPool (src/utils/database.ts),
// used only by tests to reset table state between tests. Connects to
// whatever DATABASE_URL tests/setup/env.ts already validated points at
// commandcenter_test.
export const testPool = new Pool({ connectionString: process.env.DATABASE_URL });

const TABLES = [
  'messages',
  'blockers',
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
