import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import routes from './routes';
import { pgPool } from './utils/database';
import { errorHandler } from './common/middleware/errorHandler';
import { env } from './config/env';

// Express app is now built and exported here rather than constructed inline
// inside server.ts -- server.ts becomes a thin entrypoint that imports this
// and calls listen(). Nothing about routing, middleware order, or the
// health-check behavior changed; this is purely the "app.ts vs server.ts"
// split called for in the architecture review.

export const app = express();

// Milestone 7: the rate limiter below keys on req.ip. Behind a reverse
// proxy (production), req.ip is the proxy's address unless Express is told
// to trust one hop of X-Forwarded-For -- without this, every request looks
// like it comes from the same IP and the per-IP+email limiter stops working
// correctly. Left unset in development, where requests connect directly.
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

// Milestone 7: login/register/forgot-password had no throttling at all --
// open to brute force, credential stuffing, and account enumeration by
// timing. Keyed on IP+email (not IP alone) so one attacker can't exhaust a
// shared IP's budget against every account, and one heavy legitimate IP
// (e.g. an office NAT) doesn't get throttled for every user behind it as
// long as they're not all hammering the same email. 10 attempts per 15
// minutes is generous enough for a real user who mistypes a password a
// few times, tight enough to blunt automated guessing.
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip || '')}:${String(req.body?.email || '').toLowerCase()}`,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  },
});

app.use('/api/auth/login', authRateLimiter);
app.use('/api/auth/register', authRateLimiter);
app.use('/api/auth/forgot-password', authRateLimiter);

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
