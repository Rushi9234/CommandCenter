import express from 'express';
import cors from 'cors';
import routes from './routes';
import { pgPool } from './utils/database';
import { mockDbService } from './services/mockDatabaseService';
import { errorHandler } from './common/middleware/errorHandler';

// Express app is now built and exported here rather than constructed inline
// inside server.ts -- server.ts becomes a thin entrypoint that imports this
// and calls listen(). Nothing about routing, middleware order, or the
// health-check behavior changed; this is purely the "app.ts vs server.ts"
// split called for in the architecture review.

export const app = express();

// Mutable so server.ts can flip it once it knows whether Postgres is
// actually reachable -- same dual-mode health check as before, just no
// longer a closed-over variable inside one big file.
export const dbMode = { usePostgres: false };

app.use(cors());
app.use(express.json());

app.use('/api', routes);

app.get('/health', async (req, res) => {
  try {
    if (dbMode.usePostgres) {
      await pgPool.query('SELECT 1');
      res.json({ status: 'ok', message: 'CommandCenter API is running 🚀 (PostgreSQL Mode)' });
    } else {
      await mockDbService.testConnection();
      res.json({ status: 'ok', message: 'CommandCenter API is running 🚀 (Mock Mode - Persistent)' });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

// Centralized error handler -- must be registered last. Replaces the old
// inline `app.use((err, req, res, next) => ...)` in server.ts with the same
// generic-500 behavior, plus AppError-aware status/message handling for
// every route migrated in this milestone.
app.use(errorHandler);
