import { RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RateLimitProvider } from './rateLimitProvider.interface';
import { AuthRequest } from '../../middleware/auth';

// The free, zero-dependency default (Engineering Charter rule 1).
// Everything express-rate-limit-specific -- the rateLimit() call itself,
// its default in-memory store (no `store` option is passed, exactly the
// implicit behavior since Milestone 7), key generation, the 429 handler
// -- lives only in this file. Nothing outside common/rateLimit/ imports
// express-rate-limit.
//
// Milestone 7: login/register/forgot-password had no throttling at all --
// open to brute force, credential stuffing, and account enumeration by
// timing. Keyed on IP+email (not IP alone, and via ipKeyGenerator rather
// than raw req.ip, which mishandles IPv6) so one attacker can't exhaust a
// shared IP's budget against every account, and one heavy legitimate IP
// (e.g. an office NAT) doesn't get throttled for every user behind it as
// long as they're not all hammering the same email. 10 attempts per 15
// minutes is generous enough for a real user who mistypes a password a
// few times, tight enough to blunt automated guessing.
export class ExpressRateLimitProvider implements RateLimitProvider {
  createAuthLimiter(): RequestHandler {
    return rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => `${ipKeyGenerator(req.ip || '')}:${String(req.body?.email || '').toLowerCase()}`,
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      },
    });
  }

  // Milestone 22: POST /api/ai/chat had no throttling at all -- a direct,
  // repeatable, side-effect-free call into whichever AIProvider is active
  // (ai.service.ts), with nothing to blunt a fast or scripted loop. Keyed
  // by authenticated user ID, not IP -- this route already ran
  // `authenticate` before this middleware, so req.user is always set by
  // the time this runs, and a per-user key is more precise than the auth
  // limiter's necessarily-pre-authentication IP+email key. 20 requests
  // per 5 minutes is generous enough for a real back-and-forth
  // conversation, tight enough to blunt a tight-loop script.
  createApiLimiter(): RequestHandler {
    return rateLimit({
      windowMs: 5 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: AuthRequest) => req.user?.userId || ipKeyGenerator(req.ip || ''),
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      },
    });
  }
}
