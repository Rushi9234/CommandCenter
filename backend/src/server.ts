import { app, dbMode } from './app';
import { pgPool } from './utils/database';
import { env } from './config/env';

// Thin entrypoint: build the app (app.ts), confirm whether Postgres is
// reachable, then listen. Same dual-mode fallback and console messages as
// the original server.ts -- only the app construction moved out.
const startServer = async () => {
  try {
    await pgPool.query('SELECT 1');
    console.log('✅ PostgreSQL connected successfully');
    dbMode.usePostgres = true;

    app.listen(env.port, () => {
      console.log(`\n🚀 CommandCenter Backend running on port ${env.port}`);
      console.log(`📡 API: http://localhost:${env.port}/api`);
      console.log(`💚 Health: http://localhost:${env.port}/health`);
      console.log(`\n⚡ Running in POSTGRESQL mode with persistent storage\n`);
    });
  } catch (error: any) {
    console.error('Failed to connect to PostgreSQL:', error.message);
    console.log('\n📝 Using Mock Database Service for testing (data persists during server runtime)\n');

    app.listen(env.port, () => {
      console.log(`\n🚀 CommandCenter Backend running on port ${env.port}`);
      console.log(`📡 API: http://localhost:${env.port}/api`);
      console.log(`💚 Health: http://localhost:${env.port}/health`);
      console.log(`\n⚡ Running in MOCK mode with persistent storage\n`);
    });
  }
};

startServer();
