import { PoolClient } from 'pg';
import { pgPool } from '../utils/database';

// Thin query helpers shared by every repository, including auth's (see
// modules/auth/auth.repository.ts). All of them run against the single
// pgPool defined in utils/database.ts -- there is exactly one connection
// pool in the entire app as of Milestone 3.

export const query = async <T = any>(text: string, params?: any[]): Promise<T[]> => {
  let client: PoolClient | null = null;
  try {
    client = await pgPool.connect();
    const result = await client.query(text, params);
    return result.rows;
  } catch (err: any) {
    if (client) {
      try {
        client.release(true);
      } catch {
        /* ignore */
      }
      client = null;
    }
    const isTransientConnError =
      err?.code === 'ECONNRESET' ||
      err?.code === 'ETIMEDOUT' ||
      (err?.message &&
        (err.message.includes('Connection terminated') ||
          err.message.includes('timeout exceeded') ||
          err.message.includes('closed') ||
          err.message.includes('ECONNRESET') ||
          err.message.includes('socket disconnected') ||
          err.message.includes('Client network socket')));

    if (isTransientConnError) {
      await new Promise((r) => setTimeout(r, 250));
      const retryClient = await pgPool.connect();
      try {
        const retryResult = await retryClient.query(text, params);
        return retryResult.rows;
      } finally {
        retryClient.release();
      }
    }
    throw err;
  } finally {
    if (client) {
      client.release();
    }
  }
};

export const queryOne = async <T = any>(text: string, params?: any[]): Promise<T | null> => {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
};

// Builds a parameterized `SET col = $2, col2 = $3` clause from `updates`,
// keeping only keys present in `allowedColumns` -- everything else is
// silently dropped rather than interpolated into the query. This is the
// fix for the mass-assignment gap every review since the original audit
// flagged: the old pattern did `Object.keys(updates).map(k => \`${k} =
// $n\`)` with no allowlist at all, letting a client set any column on the
// row (e.g. `created_by`, `team_id`) as long as the request passed
// whatever access check ran first. Returns null if nothing survives the
// allowlist, so callers can short-circuit instead of running a no-op
// UPDATE.
export const buildSetClause = (
  allowedColumns: string[],
  updates: Record<string, any>,
  startParamIndex: number
): { clause: string; values: any[] } | null => {
  const safeKeys = Object.keys(updates).filter((key) => allowedColumns.includes(key));

  if (safeKeys.length === 0) {
    return null;
  }

  const clause = safeKeys.map((key, index) => `${key} = $${index + startParamIndex}`).join(', ');
  const values = safeKeys.map((key) => updates[key]);

  return { clause, values };
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
