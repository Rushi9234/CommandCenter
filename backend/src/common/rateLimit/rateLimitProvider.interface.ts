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

  // Phase 4 email-change request: keyed by authenticated user ID (not IP),
  // same rationale and threshold as createPasswordChangeLimiter -- an
  // email change is a comparably sensitive account-mutation action.
  // Applied to POST /api/users/me/request-email-change, mounted AFTER
  // authenticate (BUG-003's lesson: req.user must already exist before
  // this middleware runs, or every user behind a shared IP silently
  // shares one bucket instead of getting their own).
  createEmailChangeLimiter(): RequestHandler;

  // Phase 4 email-change resend: a separate, slightly more generous
  // per-user limiter than the request limiter above -- a user who
  // mistyped the new address and needs the link resent to the SAME
  // pending target shouldn't burn their request-change budget doing so.
  // Applied to POST /api/users/me/resend-email-change-verification,
  // mounted after authenticate for the same reason as above.
  createEmailChangeResendLimiter(): RequestHandler;

  // Phase 4 email-change verification: IP-only, matching
  // createRefreshLimiter's exact rationale -- this endpoint is reached
  // with a token in hand, not by an authenticated user retrying, and may
  // be opened on a different device/session than the one that requested
  // the change (req.user does not exist here at all). Applied to
  // POST /api/auth/verify-email-change, which requires no authentication.
  createEmailChangeVerifyLimiter(): RequestHandler;

  // Phase 4 phone verification: all three phone endpoints are
  // authenticated (unlike verify-email-change, phone verification is a
  // same-session, in-app code-entry flow -- req.user always exists),
  // so all three are keyed by user ID, mounted after authenticate
  // (BUG-003's lesson, non-negotiable). 5/hour each, per
  // PROFILE_PHASE4_PHONE_SMS_PROVIDER_AUDIT.md's recommendation -- the
  // 5-incorrect-attempts-per-OTP ceiling is verify-phone's PRIMARY
  // defense; this limiter is a secondary backstop against attempting
  // many different OTPs in sequence.
  createPhoneVerificationLimiter(): RequestHandler;
  createPhoneVerificationResendLimiter(): RequestHandler;
  createPhoneVerifyLimiter(): RequestHandler;

  // Chat V1 Task 2: keyed by authenticated user ID (not IP), mounted AFTER
  // authenticate (BUG-003's lesson, same as every other per-user limiter
  // above). Applied to both get-or-create endpoints (POST
  // /api/chat/conversations/direct and .../team/:teamId) -- both are
  // idempotent and cheap, but still real DB writes on first call, so a
  // generous-but-real ceiling blunts a scripted loop without throttling
  // normal usage (a user opening many DMs/team chats in one session).
  createChatConversationLimiter(): RequestHandler;

  // Chat V1 Task 3: message sending, keyed by authenticated user ID (not
  // IP), mounted AFTER authenticate (BUG-003's lesson, same as every
  // per-user limiter above). A real conversational thread can legitimately
  // involve many short messages in quick succession -- unlike the
  // conversation-creation limiter above, this needs a per-minute window
  // generous enough for normal back-and-forth typing while still capping
  // an unbounded flood/spam script. Applied to POST
  // /api/chat/conversations/:conversationId/messages only -- GET (list)
  // is unthrottled, matching every other read-only endpoint in this app.
  createChatMessageSendLimiter(): RequestHandler;
}
