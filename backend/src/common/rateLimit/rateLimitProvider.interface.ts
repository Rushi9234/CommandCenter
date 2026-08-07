import { RequestHandler } from 'express';

// Charter rules 2/13: application code (app.ts) must never call
// express-rate-limit -- or any future rate-limiting vendor (Redis,
// Upstash, Cloudflare, rate-limiter-flexible) -- directly. Every provider
// implementation in this directory implements this one interface;
// app.ts only ever talks to it through rateLimitProviderFactory.ts.
//
// Only one limiter exists today (the auth endpoints' limiter), so this
// interface has exactly one method. Adding a second kind of limit later
// (e.g. a general API limiter, a webhook limiter) means adding one more
// method here and implementing it in every provider -- not inventing
// speculative methods now that nothing calls yet.
export interface RateLimitProvider {
  // Returns Express middleware enforcing the auth-endpoints rate limit
  // (login/register/forgot-password). What the limit actually is
  // (threshold, window, key) is entirely the provider's own concern --
  // callers only ever get back a RequestHandler to app.use().
  createAuthLimiter(): RequestHandler;
}
