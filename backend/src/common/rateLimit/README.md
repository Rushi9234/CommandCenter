# Rate Limit Provider Abstraction

## Why this exists

Before Milestone 17, `app.ts` imported `express-rate-limit` directly and
constructed its auth-endpoints limiter inline, with no `store` option --
meaning it silently used express-rate-limit's own in-memory `MemoryStore`.
That's fine for a single instance, but this app's actual deployment
target (Vercel serverless, per the pre-Milestone-13 architecture audit)
is inherently multi-instance: an in-memory store's counters aren't shared
across warm containers, so "10 attempts per 15 minutes" is really "10
attempts per 15 minutes *per instance*" -- a real, previously-flagged
gap. Fixing that requires a shared store (Redis is the obvious answer),
which the [Engineering Charter](../../../../docs/architecture/ENGINEERING_CHARTER.md)
forbids adding directly, and which this milestone explicitly does not add
(no paid service, no external infrastructure). What this milestone does
instead is put the interface in place *now*, so that decision -- if and
when it's made -- is a new provider class and a config change, not a
rewrite of `app.ts`.

This directory puts one interface (`RateLimitProvider`) between callers
(`app.ts`, `ai.routes.ts`) and whichever concrete rate-limiting mechanism
is active. Callers never import `express-rate-limit`, `MemoryStore`, or
any vendor SDK -- they call `getRateLimitProvider().createAuthLimiter()`,
`.createApiLimiter()`, or `.createRefreshLimiter()` and get back a plain
Express `RequestHandler`.

## Current free implementation

`RATE_LIMIT_PROVIDER=express` (the default if unset) selects
`ExpressRateLimitProvider`, which implements three limiters:

- **`createAuthLimiter()`** -- the *exact* configuration that was
  previously inline in `app.ts`: 10 requests per 15 minutes, keyed on
  IP+email via `ipKeyGenerator` (not raw `req.ip`, which mishandles
  IPv6). Applied to `/api/auth/{login,register,forgot-password}` since
  Milestone 7, and (Milestone 33) to `/api/auth/resend-verification` and
  `/api/auth/reset-password` too -- resend-verification has an email in
  its body, so it gets the same IP+email key; reset-password has no
  email, so the key naturally degrades to IP-only, which is the correct
  behavior for blunting reset-token guessing (there's no account to key
  on before the token is verified).
- **`createApiLimiter()`** (Milestone 22) -- 20 requests per 5 minutes,
  keyed by authenticated user ID (`req.user.userId`) rather than IP --
  this route has already run `authenticate` by the time the limiter
  runs, so a per-user key is precise in a way the pre-authentication
  auth limiter's IP+email key can't be. Currently applied only to
  `POST /api/ai/chat`, the one AI-triggering endpoint with no natural
  brake of its own (log/blocker/project creation only trigger an AI call
  as a side effect of creating a resource; `/chat` is a direct,
  repeatable call into whichever `AIProvider` is active with nothing
  else limiting it).
- **`createRefreshLimiter()`** (Milestone 33) -- 30 requests per 15
  minutes, IP-only. `/api/auth/refresh` doesn't fit either limiter above:
  it has no email/account identifier in its body (only a refresh token,
  via cookie or body) to key on, and unlike login/register it's called
  automatically and repeatedly by every active session (roughly once per
  access-token TTL -- see `jwt.ts`'s `ACCESS_TOKEN_TTL_SECONDS`), so
  `createAuthLimiter()`'s 10-per-15-minutes threshold (tuned for
  infrequent human login attempts) would false-positive normal usage.
  Applied only to `/api/auth/refresh`.

Both use the same implicit in-memory store (no `store` option passed).
Free, no new dependency, no external account.

## Future enterprise migration path

A `RedisRateLimitProvider` (or one backed by `rate-limiter-flexible`,
Cloudflare, or Upstash -- not implemented in this milestone) would
implement the same `RateLimitProvider` interface (both
`createAuthLimiter()` and `createApiLimiter()`), internally using
`express-rate-limit`'s own pluggable `store` option pointed at a shared
backend, or a different limiting library entirely -- the interface
doesn't care how the middleware is built, only that it returns one.
Switching is a config change:

```
RATE_LIMIT_PROVIDER=express   # current free default
RATE_LIMIT_PROVIDER=redis     # future -- not implemented yet
```

Callers do not change either way.

## Adding a new kind of limiter later

Three limiters exist today (`createAuthLimiter`, `createApiLimiter`,
`createRefreshLimiter`). If a fourth kind is ever needed (e.g. a webhook
limiter), add a new method to `RateLimitProvider` and implement it in
every existing provider -- not a new interface, and not a method nothing
calls yet.
