import { RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator, MemoryStore } from 'express-rate-limit';
import { RateLimitProvider } from './rateLimitProvider.interface';
import { AuthRequest } from '../../middleware/auth';
import { normalizePhoneToE164 } from '../phone';

export class ExpressRateLimitProvider implements RateLimitProvider {
  private activeStores: MemoryStore[] = [];

  private createStore(): MemoryStore {
    const store = new MemoryStore();
    this.activeStores.push(store);
    return store;
  }

  resetAllStores(): void {
    for (const store of this.activeStores) {
      if (typeof store.resetAll === 'function') {
        store.resetAll();
      }
    }
  }

  createAuthLimiter(): RequestHandler {
    return (req, res, next) => {
      if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
        return next();
      }
      return rateLimit({
        store: this.createStore(),
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => `${ipKeyGenerator(req.ip || '')}:${String(req.body?.email || '').toLowerCase()}`,
        handler: (_req, res) => {
          res.status(429).json({ error: 'Too many attempts. Please try again later.' });
        },
      })(req, res, next);
    };
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
      store: this.createStore(),
      windowMs: 5 * 60 * 1000,
      max: process.env.NODE_ENV === 'test' ? 10000 : 20,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: AuthRequest) => req.user?.userId || ipKeyGenerator(req.ip || ''),
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      },
    });
  }

  // Milestone 33: IP-only (no email/account to key on pre-verification --
  // the whole point is limiting guesses at a token, not a known account).
  // 30 per 15 minutes is well above what a legitimate access-token
  // lifecycle needs (one refresh per ~15-minute access token, per active
  // session -- see jwt.ts's ACCESS_TOKEN_TTL_SECONDS) even for several
  // concurrent sessions behind one shared IP, while still capping an
  // unbounded guessing/replay loop.
  createRefreshLimiter(): RequestHandler {
    return rateLimit({
      store: this.createStore(),
      windowMs: 15 * 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => ipKeyGenerator(req.ip || ''),
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      },
    });
  }

  // Password-change rate limiting: 3 attempts per hour, keyed by user ID.
  // This is a sensitive account-modifying operation, and we want to prevent
  // brute-force attacks while still allowing legitimate users to retry.
  // Keyed by authenticated user ID (not IP) since this runs post-authentication.
  createPasswordChangeLimiter(): RequestHandler {
    return rateLimit({
      store: this.createStore(),
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: AuthRequest) => req.user?.userId || ipKeyGenerator(req.ip || ''),
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many password change attempts. Please try again in an hour.' });
      },
    });
  }

  // Avatar upload rate limiting: 10 uploads per day, keyed by user ID.
  // Users own their avatars and might legitimately want to update them,
  // but 10 per day prevents spam/abuse while staying generous.
  createAvatarLimiter(): RequestHandler {
    return rateLimit({
      store: this.createStore(),
      windowMs: 24 * 60 * 60 * 1000, // 24 hours
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: AuthRequest) => req.user?.userId || ipKeyGenerator(req.ip || ''),
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many avatar uploads. Please try again tomorrow.' });
      },
    });
  }

  // Phase 4 email-change request rate limiting: 3 attempts per hour, keyed
  // by user ID -- same threshold as createPasswordChangeLimiter (both are
  // sensitive account-mutation actions with a legitimate-retry ceiling).
  createEmailChangeLimiter(): RequestHandler {
    return rateLimit({
      store: this.createStore(),
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: AuthRequest) => req.user?.userId || ipKeyGenerator(req.ip || ''),
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many email change attempts. Please try again in an hour.' });
      },
    });
  }

  // Phase 4 email-change resend: slightly more generous than the request
  // limiter above -- resending targets the same already-pending address,
  // a lower-risk action than initiating a new change.
  createEmailChangeResendLimiter(): RequestHandler {
    return rateLimit({
      store: this.createStore(),
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: AuthRequest) => req.user?.userId || ipKeyGenerator(req.ip || ''),
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many resend attempts. Please try again in an hour.' });
      },
    });
  }

  // Phase 4 email-change verification: IP-only, matching
  // createRefreshLimiter's exact shape and generosity -- the caller may
  // not be authenticated as (or even logged in as) the account in
  // question when this runs.
  createEmailChangeVerifyLimiter(): RequestHandler {
    return rateLimit({
      store: this.createStore(),
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => ipKeyGenerator(req.ip || ''),
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      },
    });
  }

  // Global IP rate limit for phone verification requests: 30 requests per hour per raw IP (configurable via PHONE_OTP_GLOBAL_IP_MAX)
  createPhoneVerificationGlobalIpLimiter(): RequestHandler {
    return rateLimit({
      store: this.createStore(),
      windowMs: 60 * 60 * 1000, // 1 hour
      max: (_req) => (process.env.PHONE_OTP_GLOBAL_IP_MAX ? parseInt(process.env.PHONE_OTP_GLOBAL_IP_MAX, 10) : (process.env.NODE_ENV === 'test' ? 1000 : 30)),
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => ipKeyGenerator(req.ip || ''),
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many phone verification requests from this IP. Please try again later.' });
      },
    });
  }

  // Normalized phone-number rate limit: 5 requests per hour per normalized destination phone number (configurable via TEST_PHONE_LIMIT in tests)
  createPhoneVerificationPhoneNumberLimiter(): RequestHandler {
    return rateLimit({
      store: this.createStore(),
      windowMs: 60 * 60 * 1000, // 1 hour
      max: (_req) => (process.env.TEST_PHONE_LIMIT ? parseInt(process.env.TEST_PHONE_LIMIT, 10) : (process.env.NODE_ENV === 'test' ? 1000 : 5)),
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        const raw = req.body?.phone_number;
        if (!raw) return ipKeyGenerator(req.ip || '');
        try {
          return normalizePhoneToE164(String(raw));
        } catch {
          return String(raw).replace(/\D/g, '') || ipKeyGenerator(req.ip || '');
        }
      },
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many requests for this phone number. Please try again in an hour.' });
      },
    });
  }

  // Phase 4 phone verification: 5/hour per IP + user bucket, ensuring IP-based rate limiting
  createPhoneVerificationLimiter(): RequestHandler {
    return rateLimit({
      store: this.createStore(),
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: AuthRequest) => `${ipKeyGenerator(req.ip || '')}:${req.user?.userId || ''}`,
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many phone verification attempts. Please try again in an hour.' });
      },
    });
  }

  createPhoneVerificationResendLimiter(): RequestHandler {
    return rateLimit({
      store: this.createStore(),
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: AuthRequest) => `${ipKeyGenerator(req.ip || '')}:${req.user?.userId || ''}`,
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many resend attempts. Please try again in an hour.' });
      },
    });
  }

  createPhoneVerifyLimiter(): RequestHandler {
    return rateLimit({
      store: this.createStore(),
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: AuthRequest) => `${ipKeyGenerator(req.ip || '')}:${req.user?.userId || ''}`,
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many verification attempts. Please try again in an hour.' });
      },
    });
  }

  // Chat V1 Task 2: 60 conversation get-or-create calls per hour, keyed by
  // user ID. Generous -- both endpoints it guards are idempotent and a
  // normal session might call them many times (once per DM/team chat
  // opened) -- while still capping an unbounded scripted loop.
  createChatConversationLimiter(): RequestHandler {
    return rateLimit({
      store: this.createStore(),
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: AuthRequest) => req.user?.userId || ipKeyGenerator(req.ip || ''),
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many requests. Please try again later.' });
      },
    });
  }

  // Chat V1 Task 3: 30 messages per minute per user -- generous enough
  // for real, rapid back-and-forth conversation (a burst of several short
  // messages in a row is normal chat behavior), tight enough to blunt a
  // scripted flood/spam loop against a single conversation.
  createChatMessageSendLimiter(): RequestHandler {
    return rateLimit({
      store: this.createStore(),
      windowMs: 60 * 1000, // 1 minute
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: AuthRequest) => req.user?.userId || ipKeyGenerator(req.ip || ''),
      handler: (_req, res) => {
        res.status(429).json({ error: 'Too many messages. Please slow down.' });
      },
    });
  }
}
