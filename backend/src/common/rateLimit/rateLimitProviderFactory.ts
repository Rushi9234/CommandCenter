import { env } from '../../config/env';
import { RateLimitProvider } from './rateLimitProvider.interface';
import { ExpressRateLimitProvider } from './expressRateLimitProvider';

// The one place that decides which RateLimitProvider implementation is
// active, based on the RATE_LIMIT_PROVIDER env var (config/env.ts).
// app.ts calls getRateLimitProvider() and never imports a concrete
// provider class (or express-rate-limit itself) directly. Adding a
// future provider (Redis, Upstash, Cloudflare, rate-limiter-flexible)
// means adding one class implementing RateLimitProvider and one branch
// here -- no change to app.ts.
let cachedProvider: RateLimitProvider | null = null;

export const getRateLimitProvider = (): RateLimitProvider => {
  if (cachedProvider) {
    return cachedProvider;
  }

  switch (env.rateLimitProvider) {
    case 'express':
    default:
      // Free-first default (Engineering Charter rule 1): an unrecognized
      // value falls back to the free express-rate-limit-backed provider
      // rather than leaving the auth endpoints unprotected.
      cachedProvider = new ExpressRateLimitProvider();
      break;
  }

  return cachedProvider;
};

// Test-only: forces the next getRateLimitProvider() call to re-read
// env.rateLimitProvider and re-select instead of reusing the cached
// instance.
export const resetRateLimitProviderCache = (): void => {
  cachedProvider = null;
};
