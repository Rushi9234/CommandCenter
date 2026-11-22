import { env } from '../src/config/env';
import { queryOne } from '../src/db/client';
import { pgPool } from '../src/utils/database';

async function main() {
  const targetEmail = env.adminEmail;
  console.log(`[promoteAdmin] Designated Admin Email: ${targetEmail}`);

  try {
    const existing = await queryOne<any>('SELECT user_id, email, username, role FROM users WHERE LOWER(email) = LOWER($1)', [targetEmail]);

    if (!existing) {
      console.log(`[promoteAdmin] Account with email "${targetEmail}" is not yet registered in the database.`);
      console.log(`[promoteAdmin] When registered, it will automatically receive the 'admin' role.`);
      await pgPool.end();
      process.exit(0);
    }

    if (existing.role === 'admin') {
      console.log(`[promoteAdmin] User "${existing.email}" (ID: ${existing.user_id}) already has role 'admin'. No changes needed.`);
      await pgPool.end();
      process.exit(0);
    }

    const updated = await queryOne<any>(
      `UPDATE users SET role = 'admin', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 RETURNING user_id, email, username, role`,
      [existing.user_id]
    );

    console.log(`[promoteAdmin] SUCCESS: User "${updated.email}" (ID: ${updated.user_id}) has been promoted to role '${updated.role}'.`);
    await pgPool.end();
    process.exit(0);
  } catch (err) {
    console.error('[promoteAdmin] ERROR promoting admin:', err);
    await pgPool.end();
    process.exit(1);
  }
}

main();
