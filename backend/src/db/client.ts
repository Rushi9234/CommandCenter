import { PoolClient } from 'pg';
import { pgPool } from '../utils/database';

// Thin query helpers shared by every repository. All of them run against the
// single pgPool defined in utils/database.ts -- there is exactly one
// connection pool in the app (authController's postgresDB.ts, which this
// refactor deliberately does not touch, still has its own; collapsing that
// into this one is tracked as follow-up work, not part of this milestone).

export const query = async <T = any>(text: string, params?: any[]): Promise<T[]> => {
  const client = await pgPool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows;
  } finally {
    client.release();
  }
};

export const queryOne = async <T = any>(text: string, params?: any[]): Promise<T | null> => {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
};

// Runs `work` inside a BEGIN/COMMIT transaction, rolling back on any thrown
// error. Used by the handful of repository methods that touch more than one
// table atomically (accepting an invite, approving a join request).
export const withTransaction = async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
