import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import routes from './routes';
import { pgPool } from './utils/database';
import { mockDbService } from './services/mockDatabaseService';
import { errorHandler } from './common/middleware/errorHandler';
import { env } from './config/env';

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

// credentials: true + an explicit origin (not '*') is required for the
// browser to send/receive the auth cookies added in Milestone 4. The
// current frontend doesn't use cookies yet (it sends the legacy bearer
// token instead), so this has no effect on it -- it only matters once
// something actually relies on the cookie-based flow.
app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser());

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
