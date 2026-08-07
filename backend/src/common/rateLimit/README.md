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

This directory puts one interface (`RateLimitProvider`) between `app.ts`
and whichever concrete rate-limiting mechanism is active. `app.ts` never
imports `express-rate-limit`, `MemoryStore`, or any vendor SDK -- it calls
`getRateLimitProvider().createAuthLimiter()` and gets back a plain
Express `RequestHandler`.

## Current free implementation

`RATE_LIMIT_PROVIDER=express` (the default if unset) selects
`ExpressRateLimitProvider`, which contains the *exact* configuration that
was previously inline in `app.ts`: 10 requests per 15 minutes, keyed on
IP+email via `ipKeyGenerator` (not raw `req.ip`, which mishandles IPv6),
same 429 response body, same implicit in-memory store (no `store` option
passed -- identical behavior to before this milestone). Free, no new
dependency, no external account, zero behavior change.

## Future enterprise migration path

A `RedisRateLimitProvider` (or one backed by `rate-limiter-flexible`,
Cloudflare, or Upstash -- not implemented in this milestone) would
implement the same single-method `RateLimitProvider` interface
(`createAuthLimiter(): RequestHandler`), internally using
`express-rate-limit`'s own pluggable `store` option pointed at a shared
backend, or a different limiting library entirely -- the interface
doesn't care how the middleware is built, only that it returns one.
Switching is a config change:

```
RATE_LIMIT_PROVIDER=express   # current free default
RATE_LIMIT_PROVIDER=redis     # future -- not implemented yet
```

`app.ts` does not change either way.

## Adding a new kind of limiter later

Only one limiter exists today (`createAuthLimiter`). If a second kind is
ever needed (e.g. a general API rate limiter, a webhook limiter), add a
new method to `RateLimitProvider` and implement it in every existing
provider -- not a new interface, and not a method nothing calls yet.
