import { RequestHandler } from 'express';

// Charter rules 2/13: application code (app.ts, ai.routes.ts) must never
// call express-rate-limit -- or any future rate-limiting vendor (Redis,
// Upstash, Cloudflare, rate-limiter-flexible) -- directly. Every provider
// implementation in this directory implements this one interface; callers
// only ever talk to it through rateLimitProviderFactory.ts.
//
// Milestone 22: the second kind of limit this interface's own comment
// anticipated ("e.g. a general API limiter") -- one more method,
// implemented in every provider, not a new interface.
export interface RateLimitProvider {
  // Returns Express middleware enforcing the auth-endpoints rate limit
  // (login/register/forgot-password). What the limit actually is
  // (threshold, window, key) is entirely the provider's own concern --
  // callers only ever get back a RequestHandler to app.use().
  createAuthLimiter(): RequestHandler;

  // Returns Express middleware enforcing a general authenticated-API rate
  // limit, keyed by user ID rather than IP+email -- the caller has
  // already authenticated by the time this runs, so there's no reason to
  // fall back to an IP-based key the way the pre-authentication auth
  // limiter has to. Currently applied only to POST /api/ai/chat.
  createApiLimiter(): RequestHandler;
}
