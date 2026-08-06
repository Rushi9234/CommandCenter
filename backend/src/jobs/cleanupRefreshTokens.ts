import { authRepository } from '../modules/auth/auth.repository';
import { pgPool } from '../utils/database';

// Standalone, run-to-completion script -- not an in-process scheduler.
// Deletes expired/revoked refresh_tokens rows, which otherwise only ever
// grow (see auth.repository.ts's deleteExpiredRefreshTokens). Intended to
// be invoked by an external scheduler (cron, platform scheduled task),
// via `npm run cleanup:refresh-tokens`.
const run = async () => {
  let exitCode = 0;

  try {
    const deleted = await authRepository.deleteExpiredRefreshTokens();
    console.log(`Refresh token cleanup: removed ${deleted.length} expired/revoked token(s).`);
  } catch (error: any) {
    console.error('Refresh token cleanup failed:', error.message);
    exitCode = 1;
  }

  // Close the pool before exiting -- process.exit() terminates immediately
  // and would not reliably wait for a pending pgPool.end() in a finally
  // block, so this has to happen on the normal execution path instead.
  await pgPool.end();
  process.exit(exitCode);
};

run();
