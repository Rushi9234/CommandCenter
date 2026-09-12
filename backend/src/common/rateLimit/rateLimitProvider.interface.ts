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

  // Milestone 33: POST /api/auth/refresh has no email/account identifier
  // in its body (only a refresh token, via cookie or body) and is called
  // automatically and repeatedly by every active session -- neither
  // createAuthLimiter's IP+email key (nothing to key an "account" on
  // pre-verification) nor its 10-per-15-minutes threshold (tuned for
  // infrequent human login attempts, not automatic per-session renewal)
  // fits. A separate, IP-only, more generous limiter blunts refresh-token
  // guessing/replay probing without false-positiving a shared office IP's
  // worth of legitimately-refreshing sessions.
  createRefreshLimiter(): RequestHandler;

  // Password-change rate limiting: keyed by authenticated user ID (not IP),
  // since this is a sensitive account-modifying operation that requires
  // authentication. The limit is per-user, not per-IP, to prevent one user's
  // legitimate password changes from being throttled by another user's abuse.
  // 3 attempts per hour (key: user_id) balances security (prevents brute-force
  // password-change attacks) with usability (a legitimate user might need to
  // retry after fat-fingering).
  createPasswordChangeLimiter(): RequestHandler;

  // Avatar upload rate limiting: keyed by authenticated user ID (not IP),
  // since users own their avatars. 10 uploads per day (24 hours) is generous
  // enough for legitimate replacements while preventing abuse/spam. Applied
  // to POST /api/users/me/avatar.
  createAvatarLimiter(): RequestHandler;
}
