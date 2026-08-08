import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import routes from './routes';
import { pgPool } from './utils/database';
import { errorHandler } from './common/middleware/errorHandler';
import { requestId } from './common/middleware/requestId';
import { getRateLimitProvider } from './common/rateLimit/rateLimitProviderFactory';
import { env } from './config/env';

// Express app is now built and exported here rather than constructed inline
// inside server.ts -- server.ts becomes a thin entrypoint that imports this
// and calls listen(). Nothing about routing, middleware order, or the
// health-check behavior changed; this is purely the "app.ts vs server.ts"
// split called for in the architecture review.

export const app = express();

// Milestone 11: registered first, before anything else, so every
// response -- including error responses -- carries an X-Request-ID
// header and every later middleware/handler can read req.requestId.
app.use(requestId);

// Milestone 7: the auth rate limiter (common/rateLimit/) keys on req.ip.
// Behind a reverse proxy (production), req.ip is the proxy's address
// unless Express is told to trust one hop of X-Forwarded-For -- without
// this, every request looks like it comes from the same IP and the
// per-IP+email limiter stops working correctly. Left unset in
// development, where requests connect directly.
if (env.isProduction) {
  app.set('trust proxy', 1);
}

// Mutable so server.ts can flip it once it knows whether Postgres is
// actually reachable -- same dual-mode health check as before, just no
// longer a closed-over variable inside one big file.
export const dbMode = { usePostgres: false };

// Milestone 7: baseline security headers (X-Content-Type-Options,
// X-Frame-Options, a default CSP, etc.) on every response. Added before
// anything else runs so no route can end up missing them.
app.use(helmet());

// credentials: true + an explicit origin (not '*') is required for the
// browser to send/receive the auth cookies added in Milestone 4. The
// current frontend doesn't use cookies yet (it sends the legacy bearer
// token instead), so this has no effect on it -- it only matters once
// something actually relies on the cookie-based flow.
app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Milestone 17: the actual limiter configuration (threshold, window, key,
// 429 response, and which library/store backs it) lives entirely inside
// common/rateLimit/ -- app.ts only knows it gets back Express middleware.
// See common/rateLimit/README.md for why this abstraction exists.
const authRateLimiter = getRateLimitProvider().createAuthLimiter();

app.use('/api/auth/login', authRateLimiter);
app.use('/api/auth/register', authRateLimiter);
app.use('/api/auth/forgot-password', authRateLimiter);

// Milestone 33: these three had no throttling at all. resend-verification
// and reset-password have the same "infrequent, sensitive, human-
// initiated" shape as the three routes above -- resend-verification even
// has an email in its body, so it gets the exact same IP+email limiter;
// reset-password has no email, so the same limiter's key naturally
// degrades to IP-only, which is the correct behavior for blunting
// reset-token guessing (there's no account to key on before the token is
// verified). refresh is different -- automatic, frequent, no email in its
// body -- so it gets its own limiter (see createRefreshLimiter's comment).
app.use('/api/auth/resend-verification', authRateLimiter);
app.use('/api/auth/reset-password', authRateLimiter);
app.use('/api/auth/refresh', getRateLimitProvider().createRefreshLimiter());

app.use('/api', routes);

app.get('/health', async (req, res) => {
  try {
    if (dbMode.usePostgres) {
      await pgPool.query('SELECT 1');
      res.json({ status: 'ok', message: 'CommandCenter API is running 🚀 (PostgreSQL Mode)' });
    } else {
      // Milestone 8: this branch is no longer reachable in production (see
      // server.ts -- a failed initial connection exits the process there
      // instead of listening in mock mode). In development, mock mode means
      // real DB-backed endpoints can't function, so /health must not claim
      // 'ok' here -- a 503 is the honest signal for any monitor polling this.
      res.status(503).json({ status: 'degraded', message: 'CommandCenter API is running in Mock Mode - PostgreSQL unavailable' });
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
