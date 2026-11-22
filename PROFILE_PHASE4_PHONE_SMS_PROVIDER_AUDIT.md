# Profile Phase 4 — Phone Verification: SMS Provider & Architecture Decision Audit

**Date:** 2026-09-13
**Status:** AUDIT ONLY — NO IMPLEMENTATION, NO SCHEMA CHANGES, NO ROUTES, NO DEPENDENCIES, NO SECRETS
**Scope:** SMS provider selection, OTP ownership model, provider abstraction design, security/threat model, India/DLT operational requirements, test strategy, final API design review, frontend UX plan (design only)
**Builds on:** `PROFILE_PHASE4_EMAIL_PHONE_VERIFICATION_AUDIT.md` (2026-09-19) — this document does not re-litigate that audit's phone-related decisions (§4, §6.2, §7, §9-11 phone rows); it confirms them against the actual current codebase and answers the one question that audit deliberately left open: **which SMS vendor, and who owns the OTP.**

---

## 1. CURRENT PHONE-VERIFICATION STATE (verified against source, not assumed)

- **[EXISTS]** All 5 proposed columns are already live on `users`, in both `database/schema.sql` (lines 52-56) and `backend/migrations/1788000002000_add-phase4-email-phone-verification-fields.sql`, byte-for-byte identical to each other:
  `phone_number VARCHAR(20)`, `phone_verified BOOLEAN DEFAULT false`, `phone_otp_hash VARCHAR(255)`, `phone_otp_expires TIMESTAMP`, `phone_otp_attempts INTEGER DEFAULT 0`.
- **[MISSING — everything else, confirmed by direct search]** No `phone` route anywhere in `src/routes/index.ts` or `users.routes.ts`. No `SmsProvider` interface, no `smsProviderFactory`, no `sms` directory under `src/services/`. No phone-related DTO in `users.dto.ts`. No `SMS_PROVIDER`/`SMS_*` entry in `config/env.ts` or `package.json` (backend or frontend). No phone field anywhere in `frontend/src/pages/Profile.tsx` or `services/api.ts`. Phone verification is **still 100% greenfield**, exactly as the original audit found it — nothing has changed on this half since that document was written.
- **[EXISTS, reusable as-is]** The exact scaffolding phone verification needs already exists and is battle-tested by the just-shipped email-change work:
  - `generateOpaqueToken()`/`hashToken()` (`modules/auth/jwt.ts`) — the hash primitive; OTP needs `crypto.randomInt`, not `randomBytes`, but `hashToken()` (SHA-256) applies identically to a 6-digit string.
  - `RateLimitProvider` interface → `getRateLimitProvider()` factory → `ExpressRateLimitProvider` (`common/rateLimit/`) — three new limiter methods, same shape as the three just added for email-change (`createEmailChangeLimiter/ResendLimiter/VerifyLimiter`).
  - `NOTIFICATION_PREFERENCE_KEYS` (`notifications.dto.ts`) — currently `[..., 'password_change', 'email_change']`; a `phone_verification` key slots in the same way.
  - `EmailProvider` interface / `emailProviderFactory.ts` / `env.emailProvider` — the **exact structural template** for `SmsProvider` (§4 below).
  - `usersRepository.getUserById`/`updateUser` with an allowlist (`AUTH_UPDATABLE_COLUMNS`-equivalent pattern already proven for email-change in `auth.repository.ts`) — the same allowlisted-update convention applies to the phone OTP columns.
  - `authenticate()`'s `req.user.userId`-only convention (`middleware/auth.ts`) — every phone endpoint follows the identical authorization rule already enforced for every `/users/me/*` route, no new pattern needed.

**Conclusion: nothing about this task's premises has changed since the original audit. The database foundation is confirmed sufficient (§9). The only genuinely new decision this document makes is the SMS vendor and the OTP ownership model — everything else is "apply the email-change pattern to phone."**

---

## 2. SMS PROVIDER COMPARISON

Evaluated against CommandCenter's actual current architecture: Vercel serverless (frontend + backend, both already deployed there — confirmed via `vercel.json` in both `frontend/` and `backend/`), Neon Postgres, no existing AWS account/IAM footprint, no existing Twilio/MSG91 account, and an explicit product requirement to serve Indian phone numbers under TRAI's DLT regime.

### 2.1 MSG91

- **India SMS support:** Native India-first provider; DLT registration, sender ID, and template approval are core, first-class parts of their own onboarding flow (not a bolt-on for a foreign provider).
- **OTP/verification APIs:** Offers **two distinct integration styles** — (a) a hosted "Send OTP / Resend OTP / Verify OTP" widget-backed API set where MSG91 generates and verifies the OTP itself, and (b) a plain transactional/OTP SMS-send API where the caller supplies the exact message text (including a self-generated OTP) and MSG91 only delivers it. Both exist today; the plain send API is what this document recommends using (§3.2).
- **DLT requirements:** Requires `DLT_TE_ID` (approved template ID) and `PE_ID` (Principal Entity ID) plus a registered sender ID on each send call — standard India-first-provider mechanics, well-documented in current API/SDK material.
- **Sender ID / template handling:** Registered per-entity through MSG91's own DLT onboarding tooling (they act as an approved telecom-operator-facing DLT registration facilitator, not just an SMS relay).
- **Delivery reliability:** India-native routing directly through DLT-registered operator connections (Jio/Airtel/Vi/BSNL) — the same compliant routes every provider ultimately uses, but MSG91's core business is optimizing for exactly this corridor.
- **Fraud/abuse protection:** Rate-limiting and abuse controls exist provider-side for their hosted Verify product; for the plain send API, abuse protection is CommandCenter's own responsibility (§5) — expected, and consistent with owning the OTP lifecycle.
- **OTP generation/verification responsibility:** Optional either way (§2 above) — this is the provider whose plain-SMS API most cleanly supports **not** using their hosted OTP logic, which is the architecture this document recommends.
- **API/SDK complexity:** Low. Plain REST API (auth via a simple API key header) with an official `msg91` npm package, plus several actively-maintained community packages. No OAuth flow, no signed-request complexity.
- **Node/TypeScript integration:** Straightforward — a POST request with API key, sender ID, DLT template ID, recipient, and message body. Matches the simplicity of the existing `EmailProvider` implementations (`resendEmailProvider.ts`, `smtpEmailProvider.ts`).
- **Webhook/callback requirements:** None required for the plain send API (fire-and-forget delivery, matching `EmailProvider.send()`'s existing `Promise<boolean>` contract exactly). Delivery-receipt webhooks exist optionally but are not needed for this feature.
- **Retry behavior:** No provider-side automatic retry for a failed send; CommandCenter's own `sendSafely`-style wrapper (mirroring `emailService.ts`'s existing pattern) already handles "log and swallow, never propagate to the caller" — the correct place for this, not a provider concern.
- **Rate limiting:** Provider-side throttling exists on their account/API-key level (prevents runaway abuse of the account itself); CommandCenter's own per-user/IP limiting (§5, §8) is the primary control regardless.
- **Cost model:** Confirmed via current market research: native India providers (MSG91 among them) price in the **₹0.20-0.40 per OTP SMS** range — the cheapest tier for compliant DLT-routed India SMS.
- **International scalability:** Weaker than Twilio for non-India markets — MSG91 is India-first, not a global-first platform. Not a concern for CommandCenter's current, India-focused scale, but a real factor if international users become a priority later (see "what would cause a switch," §3.5).
- **Vendor lock-in:** Low, by design of the abstraction in §4 — the interface (`sendOtp(phoneE164, otp): Promise<boolean>`) is provider-agnostic; swapping vendors later means one new class, not a rewrite.
- **Developer experience:** Straightforward REST + official/community npm packages; documentation is India-market-focused (a plus for this exact use case, a minus if reading it cold without India-market context).
- **Test/sandbox support:** No dedicated "fake SMS" sandbox mode is needed from MSG91 itself — CommandCenter's own `ConsoleSmsProvider`-equivalent (§7) is the sandbox, exactly mirroring how `EMAIL_PROVIDER=console` already works today. Real MSG91 credentials are never required for development or CI.
- **Operational complexity:** Moderate, entirely on the India-DLT-compliance side (§6), not the technical-integration side.
- **Secret management:** One API key (`MSG91_AUTH_KEY`), the same single-secret shape as `RESEND_API_KEY` already established in this codebase.
- **Vercel compatibility:** Full — plain outbound HTTPS call from a serverless function, identical in shape to the existing `ResendEmailProvider`'s outbound call, which already runs successfully on Vercel today.

### 2.2 Twilio Verify

- **India SMS support:** Functional, but Twilio is not an India-native carrier-relationship provider — it routes through international aggregator paths to reach India-DLT-compliant routes, and Twilio itself does not handle India DLT entity/template registration on the customer's behalf in the seamless way an India-native provider's own onboarding flow does.
- **OTP/verification APIs:** Twilio Verify is **provider-managed by design** — Twilio generates, stores, and verifies the OTP; the caller gets a boolean/status result, never the code itself. This is the clearest "provider owns OTP" option evaluated, and the one most in tension with the existing audit's CommandCenter-side hashing/expiry/attempt-count design (§3.2 explains why that matters).
- **India DLT requirements:** Twilio still requires the underlying India DLT registration chain to exist (Twilio cannot bypass TRAI) — the compliance burden is the same regardless of vendor; Twilio's own tooling for walking a customer through India DLT registration is less India-specialized than a native provider's.
- **Sender ID / template handling:** Supported, but registered through a general international-provider console flow rather than an India-first one.
- **Delivery reliability:** Twilio's global infrastructure is strong in aggregate, but for the *specific* India-DLT corridor, a native provider with direct operator relationships is generally the tighter, cheaper path — reflected directly in the cost gap below.
- **Fraud/abuse protection:** Strong — Twilio Verify includes its own fraud-guard tooling (a real advantage of the fully-managed model) at the cost of ceding OTP-lifecycle visibility to Twilio.
- **OTP generation/verification responsibility:** Twilio's, not CommandCenter's, if this product is used as intended — using it any other way (i.e., only for raw SMS send, ignoring Verify's own OTP logic) defeats the reason to pick Verify over plain Twilio Programmable Messaging in the first place.
- **API/SDK complexity:** Low-to-moderate — official `twilio` npm SDK, well-documented, widely used.
- **Node/TypeScript integration:** Mature, first-class SDK support; more mature *tooling* than MSG91's, though the underlying send/verify concept is simpler with MSG91's plain-SMS route since there's no Verify-specific state machine to integrate against.
- **Webhook/callback requirements:** None required for basic Verify send/check calls.
- **Retry behavior:** Twilio Verify has its own internal retry/channel-fallback (SMS → voice) logic — a genuine convenience the plain-SMS approach doesn't get for free, but not something CommandCenter's current scope (§8: SMS-only, no 2FA yet) needs.
- **Rate limiting:** Twilio-side protections exist; irrelevant to CommandCenter's own required per-user controls either way.
- **Cost model:** Confirmed via current market research: **≈₹0.45 per OTP** at the low end quoted for Twilio India pricing (with forex surcharge), and more broadly **₹1.50-2.50 per OTP** for international providers generally, versus **₹0.20-0.40** for native India providers — roughly **4-10x more expensive per OTP** than MSG91 for the same India-DLT-compliant delivery.
- **International scalability:** Twilio's clear strength — best-in-class if/when CommandCenter needs OTP delivery outside India.
- **Vendor lock-in:** Higher in practice than the plain-SMS model, specifically *because* Verify owns OTP state — migrating away from Twilio Verify later means migrating an entire OTP-lifecycle ownership model, not swapping one interface implementation.
- **Developer experience:** Excellent documentation, mature SDK, large community — genuinely Twilio's strongest point.
- **Test/sandbox support:** Twilio provides official test credentials/magic numbers for Verify in a sandbox mode — a genuine, real advantage over needing to build one's own console-logging fake provider. Still fully replaceable by CommandCenter's own fake `SmsProvider` for CI determinism (§7) regardless of vendor.
- **Operational complexity:** Lower India-specific paperwork friction than a fully DIY DLT walkthrough with a smaller player, but the underlying DLT requirement doesn't disappear.
- **Secret management:** Account SID + Auth Token (or API Key/Secret pair) — a two-part secret, slightly more surface than MSG91's single key, still trivially fits the existing single-secret-per-provider pattern (two env vars instead of one).
- **Vercel compatibility:** Full — same outbound-HTTPS-call shape, no issue.

### 2.3 AWS End User Messaging SMS / SNS (now branded "End User Messaging Notify" for OTP use cases, announced March 2026)

- **India SMS support:** Functional and improving — self-service India sender-ID registration was expanded (announced January 2025) and India local routes are supported specifically through the `ap-south-1` (Mumbai) and `ap-south-2` (Hyderabad) AWS regions as of April 2025.
- **OTP/verification APIs:** "End User Messaging Notify" (announced March 2026) explicitly targets OTP delivery using AWS-owned phone numbers/sender IDs "within minutes" — a newer, more turnkey OTP-delivery product than raw SNS, but still fundamentally a **delivery** service; AWS does not manage OTP generation/verification state the way Twilio Verify does. This makes it architecturally closer to MSG91's plain-send model than to Twilio Verify.
- **India DLT requirements:** Same underlying TRAI DLT registration chain applies (Entity ID + Template ID via the DLT portal, exactly as documented in AWS's own India-specific registration guide) — AWS does not exempt anyone from this.
- **Sender ID / template handling:** Registered via the AWS End User Messaging SMS console's own India-specific sender-ID registration flow.
- **Delivery reliability:** Reasonable, but India-local-route support is newer/less mature than an India-native specialist's, and is explicitly region-locked to two specific AWS regions for India traffic — an operational constraint with no equivalent for MSG91.
- **Fraud/abuse protection:** Standard AWS-side account/API throttling; no OTP-specific fraud tooling comparable to Twilio Verify's, since AWS doesn't own the OTP state here either.
- **OTP generation/verification responsibility:** CommandCenter's, matching the recommended model (§3.2) — a genuine point in AWS's favor architecturally, same as MSG91.
- **API/SDK complexity:** Moderate-to-high **specifically because of AWS's own surface area** — IAM roles/policies, AWS SDK v3 client setup, region configuration, and credential management (access key/secret or an IAM role) are all new operational concepts for a codebase that currently has **zero AWS footprint** (confirmed: no `aws-sdk`/`@aws-sdk/*` dependency anywhere in `backend/package.json`, no AWS env vars in `config/env.ts`).
- **Node/TypeScript integration:** Well-supported via `@aws-sdk/client-pinpoint-sms-voice-v2` (or the newer End User Messaging SDK namespace), but this is a **new dependency and a new class of secret** (AWS credentials) that nothing else in this project currently needs.
- **Webhook/callback requirements:** None required for a basic send call.
- **Retry behavior:** Standard AWS SDK retry/backoff on the HTTP layer; no OTP-specific retry semantics (there's no OTP state to retry against).
- **Rate limiting:** AWS-side account/API throttling exists; CommandCenter's own per-user controls remain the real gate regardless.
- **Cost model:** Not the focus of current search results in detail, but AWS's own general SMS pricing plus the newer India-route surcharge structure is not clearly cheaper than a native India provider, and evaluating it precisely would require an AWS account and console access this audit does not have and should not create.
- **International scalability:** Strong, matching AWS's general global reach — a real long-term advantage if CommandCenter's own infrastructure ever consolidates onto AWS more broadly.
- **Vendor lock-in:** Low at the SMS-abstraction level (§4 isolates this identically to the other two options), but introduces AWS-account-level lock-in surface (IAM, billing, region config) that doesn't exist today.
- **Developer experience:** Good AWS-standard documentation, but the *India-specific* onboarding guide is newer and less battle-tested in the wild than MSG91's (an India-first company's core product) or Twilio's (years of Verify-specific tutorials/community content).
- **Test/sandbox support:** AWS supports origination identities/sandbox destination numbers in some SMS products generally; not evaluated in depth here since the recommendation doesn't select this provider.
- **Operational complexity:** **Highest of the three**, specifically because it requires standing up net-new AWS account/IAM/region infrastructure for a single feature, on top of the same India DLT paperwork every option requires regardless of vendor.
- **Secret management:** AWS access key + secret (or better, an IAM role — but Vercel's serverless functions aren't an AWS execution context, so this realistically means long-lived AWS access keys as environment variables, a materially different secret-handling posture than a single vendor API key).
- **Vercel compatibility:** Functional (any outbound HTTPS/SDK call works from a Vercel function), but adds a full AWS SDK dependency and AWS-credential-in-Vercel-env-vars operational pattern that has no precedent anywhere else in this codebase.

---

## 3. PROVIDER RECOMMENDATION

### 3.1 Final recommendation: **MSG91**

One clear choice, not three equal options.

- **Why MSG91 is best for CommandCenter today:** It is the only one of the three with zero new infrastructure dependency (no new cloud account, no IAM, no region selection) — just one more API-key-based `xProvider` implementation, exactly matching every existing provider abstraction in this codebase (`EmailProvider`, `AIProvider`, `RateLimitProvider`). Integration complexity is the lowest of the three.
- **Why it fits India:** It is an India-first company whose core product *is* India DLT-compliant OTP/transactional SMS delivery — the DLT registration walkthrough, sender-ID process, and template-approval flow are first-class, not an adaptation of a foreign provider's general-purpose console.
- **Why it fits CommandCenter's current scale:** CommandCenter has no production SMS traffic today and no evidence of near-term international (non-India) user demand. MSG91's weaker international reach (its one real disadvantage versus Twilio/AWS) is not a cost that matters yet, while its ~4-10x lower per-OTP cost versus Twilio directly matters at any real usage volume.
- **Why it fits the current backend architecture:** It slots into the exact same `Provider` interface + `xProviderFactory` + `env.xProvider` pattern already proven three times over (`EmailProvider`, `AIProvider`, `RateLimitProvider`) — see §4. No architectural adaptation needed.
- **What operational work is required before production SMS can work (see §6 for full detail):** MSG91 account creation, TRAI DLT Principal Entity registration, sender ID registration and approval, OTP/transactional message template registration and approval, and setting `MSG91_AUTH_KEY` (+ the approved sender ID and DLT template ID) as environment variables in the deployed environment. None of this is done yet, and this audit does not claim otherwise.
- **What would cause CommandCenter to switch providers later:** (a) A genuine push into non-India markets, where Twilio's global reach and Verify's built-in fraud tooling become worth the cost premium; (b) if CommandCenter's own infrastructure consolidates onto AWS for other reasons (compute, storage) such that AWS SMS becomes a "no new vendor" choice rather than a "new vendor" choice; (c) if MSG91-specific reliability/support issues surface in production that a switch would concretely fix. None of these conditions are true today.

### 3.2 OTP ownership model: **B — CommandCenter generates, hashes, stores, and verifies the OTP itself; the provider is used only for delivery.**

This directly reuses, rather than abandons, the OTP-lifecycle security controls the original audit already designed (§4.4-§4.7 of `PROFILE_PHASE4_EMAIL_PHONE_VERIFICATION_AUDIT.md`): `crypto.randomInt(100000, 999999)` generation, SHA-256 hash-at-rest via the existing `hashToken()`, 10-minute expiry, and a 5-attempt counter on `phone_otp_attempts`.

**Security/auditability comparison of the two models:**

| | **A. Provider-managed (Twilio Verify style)** | **B. CommandCenter-managed (recommended)** |
|---|---|---|
| Where the OTP's true state lives | Split — provider holds the actual code/verification state; CommandCenter only gets a boolean/status back | Entirely in `users` table, one row, fully auditable by CommandCenter at any time |
| What a security review can inspect | CommandCenter's own logs/DB only show "verify succeeded/failed," not the underlying OTP lifecycle — trusting the provider's word | Every column (`phone_otp_hash`, `phone_otp_expires`, `phone_otp_attempts`) is directly queryable, matching the exact audit trail this codebase already keeps for password-reset and email-change tokens |
| Consistency with existing codebase conventions | New, different pattern — a "provider decides verification correctness" model that doesn't exist anywhere else in CommandCenter | Identical to every existing token/OTP-shaped credential in this codebase (verification_token, password_reset_token_hash, email_change_token_hash) — one more instance of an already-proven pattern |
| Attempt-limiting control | Provider-side, opaque, provider-specific semantics | CommandCenter's own `phone_otp_attempts` column, identical enforcement code to the existing pattern, fully under this codebase's control |
| Vendor migration cost | High — migrating means replacing the entire "who decides if this OTP is correct" trust boundary | Low — migrating means replacing one `sendOtp()` implementation; verification logic never moves |
| Provider outage blast radius | An outage of the *verification* call, not just the *send* call, can block a real, already-correctly-entered OTP from ever being confirmed | An outage only blocks *new* OTP delivery — a user who already received a code can still verify it against CommandCenter's own DB with zero dependency on the provider being up |

**Conclusion: Model B is the correct choice, and nothing in this evaluation surfaces a "strong architectural reason" (the bar the original audit set) to abandon the already-designed CommandCenter-side controls.** MSG91's plain transactional-SMS send API is what this model needs — send an exact message body, get back a delivery boolean, nothing more.

---

## 4. RECOMMENDED SmsProvider ABSTRACTION

Mirrors `EmailProvider` exactly — same file layout, same factory pattern, same env-var-driven selection, same `Promise<boolean>` contract.

```
backend/src/services/sms/
  providers/
    smsProvider.interface.ts       // SmsMessage + SmsProvider, mirrors emailProvider.interface.ts
    consoleSmsProvider.ts          // default, logs only, dev-safe (mirrors consoleEmailProvider.ts)
    msg91SmsProvider.ts            // the one real vendor implementation
    smsProviderFactory.ts          // getSmsProvider() / resetSmsProviderCache(), mirrors emailProviderFactory.ts
  smsService.ts                    // sendOtpSms(phoneE164, otp) -- the ONE function callers use, mirrors emailService.ts
```

```ts
// smsProvider.interface.ts (illustrative shape, not implemented)
export interface SmsMessage {
  to: string;           // E.164
  body: string;         // the exact, final message text (OTP already embedded by smsService.ts)
  // Caller-supplied, safe-to-log fields only (event name, recipient's masked
  // number) -- mirrors EmailMessage.metadata's exact rule. The OTP itself
  // must never appear here, the same way a raw verification token never
  // goes into EmailMessage.metadata today.
  metadata?: Record<string, unknown>;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<boolean>;
}
```

No `verifyOtp()` method exists on this interface — per §3.2's Model B decision, verification never leaves CommandCenter, so there is nothing for the interface to expose. If a future, different feature genuinely needed a provider-managed verify flow, that would be a new, separate abstraction, not a widening of this one.

**Isolation guarantee:** `users.service.ts` calls `smsService.sendOtpSms(phone, otp)` exactly the way it will soon call (for email-change, already true today) `sendEmailChangeVerification(email, token, name)` — no MSG91-specific field (DLT template ID, sender ID, auth key) is ever visible outside `msg91SmsProvider.ts` and `config/env.ts`. Controllers, routes, and `Profile.tsx` never import anything under `services/sms/`.

```
Profile UI  →  services/api.ts (thin wrapper)  →  users.routes.ts  →  users.controller.ts
                                                                            ↓
                                                                     users.service.ts
                                                                            ↓
                                                              smsService.sendOtpSms()
                                                                            ↓
                                                             SmsProvider abstraction
                                                                            ↓
                                                                    MSG91SmsProvider
                                                                            ↓
                                                                    MSG91 REST API
```

---

## 5. SECURITY / THREAT MODEL

| Threat | Mitigation |
|---|---|
| **OTP brute force** (6-digit space, 1,000,000 possibilities) | 5-attempt ceiling per issued OTP (`phone_otp_attempts`), enforced identically to the pattern the original audit already specified — this is the primary defense, not expiry alone. |
| **SMS pumping** (attacker triggers many real SMS sends to run up cost / abuse a target's phone) | Per-user hourly rate limit on request/resend (mirrors `createEmailChangeLimiter`'s exact shape) **plus** the 60-second resend cooldown (§8) as a second, faster-acting gate specific to rapid-fire resend attempts — matches the original audit's §4.7/§4.8 design exactly. |
| **Resend abuse** | 60-second cooldown, derived from `phone_otp_expires` (no new column needed — see §9) rather than a fresh timestamp, plus the same hourly ceiling as request. |
| **OTP replay** (a correct-but-already-used code presented again) | OTP fields cleared (`phone_otp_hash = NULL`, attempts reset) immediately on successful verification, identical to how `email_change_token_hash` is cleared on successful consumption — a replayed code finds nothing to match against. |
| **OTP theft** (SMS intercepted in transit, or read by someone with physical access to the device) | Hash-at-rest (never store the raw code — same SHA-256 primitive as every other token in this codebase), 10-minute expiry bounds the exploitable window, and single-use clearing (above) means a successfully-stolen-and-used code can't be reused by the real owner *or* the thief a second time. |
| **SIM-swap** (attacker gains control of the victim's phone number at the carrier level) | **Explicitly out of scope for Phase 4's stated purpose** — phone verification here proves "this account currently controls this number," a point-in-time fact, not an ongoing security guarantee. This is exactly why the original audit (§4.9) correctly scoped phone as "a verified profile attribute," never a login/recovery credential, for Phase 4 — a SIM-swapped number would be a real risk if phone were promoted to a recovery channel, which it explicitly is not (§8, §11). |
| **Account enumeration** | Every phone endpoint is authenticated (`req.user.userId` only) — the caller already knows their own account exists, so classic pre-auth enumeration doesn't apply, matching the same reasoning the email-change audit gave for its own authenticated endpoints. |
| **Phone-number enumeration** (does a given number belong to some other account?) | Since phone is explicitly **not unique** (§4.11 of the original audit, reconfirmed §9 below), there is no "already in use" check to leak a distinguishing response from in the first place — a structurally simpler position than email's uniqueness-driven enumeration surface. |
| **Malicious repeated verification requests** | The 5-attempts-per-OTP ceiling is the primary defense; the per-user hourly limiter on the verify endpoint itself is the secondary backstop, matching the original audit's §4.8 reasoning exactly. |
| **Automated signup/verification abuse** | Every phone endpoint requires an authenticated session first — an attacker needs a real, already-registered CommandCenter account before any phone-verification abuse surface is reachable at all, unlike a pre-auth signup-abuse vector. |
| **Provider API key compromise** | Single secret (`MSG91_AUTH_KEY`), same blast-radius shape as an existing `RESEND_API_KEY` compromise — never checked into source, never returned in any API response, never logged (mirrors `sendSafely`'s existing "log the failure, never the credential" pattern). |
| **Provider outage** | Per §3.2's Model B: an outage only blocks *sending new* OTPs — `sendOtpSms`'s existing `sendSafely`-equivalent wrapper (mirroring `emailService.ts`) swallows the failure into a logged, non-fatal event; a user with an already-delivered, unexpired OTP can still verify successfully with zero provider dependency. |
| **Duplicate requests / concurrent verification / race conditions** | Handled by the same single-atomic-UPDATE pattern just proven for `consumeEmailChangeToken`: a `verify-phone` UPDATE conditioned on `phone_otp_hash = $1 AND phone_otp_expires > NOW()`, clearing the OTP in the same statement, makes a race between two concurrent verify attempts resolve to "exactly one succeeds, the other finds nothing" — no separate lock needed, matching the codebase's established risk tolerance for this exact class of race (see the original audit §3.5 and the already-shipped `consumeEmailChangeToken`). |
| **Stale/expired OTPs** | Expiry enforced at the query level (`WHERE phone_otp_expires > CURRENT_TIMESTAMP`), the same convention as every other expiring credential in this codebase — an expired-but-not-yet-cleared row can never be matched. |
| **Shared/family phone numbers** | Explicitly tolerated by design — no `UNIQUE` constraint on `phone_number` (§9), matching the original audit's §4.11 rationale exactly: this is legitimate, not abuse, and has no equivalent security rationale to email's uniqueness (phone is never a login identifier). |

**Explicit confirmations (per this task's checklist):**
- OTP remains hashed at rest: **Yes** (§3.2, §5 above — no design surfaced a reason to store it raw).
- Raw OTP never logged: **Yes** — `smsService.ts`'s `metadata` field (mirroring `emailService.ts`'s existing, audited convention) never carries the OTP itself, only safe-to-log fields (event name, masked/last-4 phone digits).
- Provider API credentials never exposed: **Yes** — confined to `msg91SmsProvider.ts` + `config/env.ts`, identical containment to every existing provider secret.
- Frontend never sees provider credentials: **Yes** — no provider detail crosses the `services/api.ts` boundary, structurally impossible given the abstraction in §4.
- Phone never exposed in teammate/public APIs: **Confirmed still true** — `usersRepository.getAllUsers` (the teammate-scoped `GET /api/users`) does not select `phone_number`/`phone_verified` today, and this audit does not propose adding it (the original audit's §4.10/§10.21 explicit warning against repeating email's own teammate-visible exposure stands).
- User ID comes from JWT: **Yes**, by the same universal `req.user.userId`-only convention every `/users/me/*` route already follows, with zero exception proposed for phone.
- Rate limiting happens AFTER `authenticate` for per-user endpoints: **Explicitly required, learning directly from BUG-003** — every new phone limiter must be instantiated and mounted in `users.routes.ts` exactly where `emailChangeRateLimiter`/`passwordChangeRateLimiter` already are (after `authenticate`, never in `app.ts`), or it silently degrades to a shared-IP bucket exactly as BUG-003 already proved once.
- IP/global protection for SMS-cost abuse: **Considered** — the per-user hourly limiter is the primary control (SMS costs real money per message, unlike email); an additional IP-level ceiling on top of the per-user one is flagged as a reasonable defense-in-depth addition for whoever implements this, but not a hard requirement Phase 4 must add on day one, since a per-user limiter already bounds worst-case cost per compromised/abusive account.

---

## 6. INDIA / DLT OPERATIONAL REQUIREMENTS

**Nothing below is done yet. This audit does not claim production SMS works — only what must happen before it can.**

1. **Entity registration:** Register CommandCenter (or its operating entity) as a DLT **Principal Entity (PE)** with at least one telecom operator (Jio/Airtel/Vi/BSNL) via the DLT portal, receiving a **PE_ID**. This is a TRAI-mandated requirement for *any* business sending commercial/transactional SMS to Indian numbers, independent of which vendor is chosen.
2. **Sender/header registration:** Register a **sender ID** (the 6-character alphanumeric header recipients see, e.g. `CMDCTR`) tied to the PE_ID.
3. **Template registration:** Register the exact OTP message template text (with a placeholder for the variable OTP digits) with the telecom operator via DLT, receiving a **DLT_TE_ID**. The template text sent at runtime must match the approved template *exactly* (including punctuation) or the operator will block the message regardless of provider.
4. **Provider configuration:** Create an MSG91 account, link the PE_ID/sender ID/DLT_TE_ID into MSG91's own console, and obtain an `MSG91_AUTH_KEY`.
5. **Required environment variables (names only, no values — none of these exist yet):**
   - `SMS_PROVIDER` (new, mirrors `EMAIL_PROVIDER`'s existing pattern — `'console'` default, `'msg91'` to activate the real vendor)
   - `MSG91_AUTH_KEY`
   - `MSG91_SENDER_ID`
   - `MSG91_DLT_TEMPLATE_ID`
6. **Provider-side approval:** Both the sender ID and the message template require operator-side approval (typically a multi-day turnaround, not instant) before any real send will succeed — this is a real lead time to plan for, not a same-day setup.
7. **Can development/testing happen without DLT?** **Yes, and by design should never need it.** `SMS_PROVIDER` defaults to `'console'` (mirroring `EMAIL_PROVIDER`'s existing default) — every local dev run, every CI run, and every test suite run against the logging-only fake provider (§7) and never touches MSG91, DLT, or any real phone number, exactly the way `EMAIL_PROVIDER=console` already means no test in this repository has ever needed a real Resend/SMTP credential.

**This audit does not claim, and implementation must not later silently claim, that production SMS is functional until steps 1-6 above are genuinely complete and verified with a real test send to a real number outside of CI.**

---

## 7. DEVELOPMENT / TEST STRATEGY

Identical shape to the already-proven `EmailProvider` test strategy (`aiProviderStub.ts`/`ConsoleEmailProvider` precedent) — nothing new to invent:

```
Production:   CommandCenter → MSG91SmsProvider → real MSG91 API → real carrier
Development:  CommandCenter → ConsoleSmsProvider (SMS_PROVIDER unset/'console') → console.log only
Tests:        CommandCenter → mocked SmsProvider (jest.spyOn smsService.sendOtpSms, mirroring
               the exact pattern tests/emailChange.test.ts already uses for
               emailService.sendEmailChangeVerification) → no real network call, ever
```

- **`SMS_PROVIDER` defaults to `'console'`** exactly as `EMAIL_PROVIDER` does — an unset/misconfigured env var degrades to safe logging, never to a crash or a real send.
- **GitHub Actions CI never needs an MSG91 credential** — `.github/workflows/ci.yml`'s backend job env block would need **zero new secrets** for phone-verification tests to pass, the same way it already needs zero real `RESEND_API_KEY`/`GROQ_API_KEY` value (both are placeholder strings today, confirmed in the workflow file) for the email-change and AI-provider test suites to pass deterministically.
- **Determinism:** Every phone-verification test asserts against `smsService.sendOtpSms`'s mock call arguments (the OTP itself, captured the same way `emailChange.test.ts` captures a verification token today) — never against real delivery, never flaky on network conditions, never rate-limited by a real vendor account.

---

## 8. FINAL PHONE API DESIGN

Reconfirms the original audit's §7 proposal, adjusted only to make each endpoint's contract fully explicit per this task's requirements. Naming and shape deliberately parallel the just-shipped email-change endpoints.

### `POST /api/users/me/request-phone-verification`
- **Auth:** required (`authenticate`, `req.user.userId` only)
- **Rate limit:** new per-user limiter, ~5/hour, mounted **after** `authenticate` in `users.routes.ts` (BUG-003 lesson)
- **Cooldown:** 60 seconds between issuances for the *same* user, derived from `phone_otp_expires` (§9 — no new column)
- **Request:** `{ phone_number: string }` (any reasonably-formatted input; normalized to E.164 server-side using a new normalization dependency — see §12/§16, this is the one genuinely new library this feature needs)
- **Response:** `{ success: true, data: { phone_number: <normalized E.164> } }` — never the OTP
- **Errors:** invalid/unparseable phone format → 400, generic message; rate-limited → 429 (matches `createEmailChangeLimiter`'s exact response shape); cooldown-not-elapsed → 429 or a distinct cooldown-specific 400 (implementation's call, either is defensible; must not be a *silently* different envelope shape)
- **OTP handling:** generates `crypto.randomInt(100000, 999999)`, hashes via `hashToken()`, stores hash + `phone_otp_expires = NOW() + 10 minutes`, resets `phone_otp_attempts = 0`, sends via `smsService.sendOtpSms`

### `POST /api/users/me/resend-phone-verification`
- **Auth:** required
- **Rate limit:** same limiter family as request, or a slightly separate one — the original audit left this open; either is acceptable as long as the 60-second cooldown (above) is enforced regardless of which hourly bucket is used
- **Request:** none (operates on the already-pending phone number)
- **Response:** `{ success: true, data: { phone_number: <pending E.164> } }`
- **Errors:** 400 if no pending phone verification exists (not an enumeration concern — caller is authenticated as themselves)
- **OTP handling:** fresh OTP, same target number, same expiry/attempt-reset behavior as request — supersedes the previous OTP identically to how email-change resend already supersedes its previous token

### `POST /api/users/me/verify-phone`
- **Auth:** required (same-session, in-app code entry — unlike email-change verification, this is never opened from a different, unauthenticated device)
- **Rate limit:** per-user, secondary to the 5-attempt ceiling (primary defense)
- **Request:** `{ code: string }` (6 digits)
- **Response on success:** `{ success: true, data: { phone_verified: true } }`; clears `phone_otp_hash`/`phone_otp_expires`, resets `phone_otp_attempts`, sets `phone_verified = true`
- **Response on wrong code:** 400, increments `phone_otp_attempts`; on reaching 5, clears the OTP entirely and the response **may** distinctly say "too many attempts, request a new code" (per the original audit §7 note, this ONE message is allowed to differ from generic-invalid, since the caller is authenticated and attempt-counting their own requested OTP isn't an enumeration vector)
- **Response envelope:** `{ success: true, data: ... }` throughout — no second convention, matching every other endpoint in this codebase

**Explicit non-goals, reconfirmed:** phone verification does **not** become a login method, does not become a password/account-recovery channel, and is not 2FA. No endpoint here accepts a phone number in place of an email/password credential anywhere. Those remain untouched, unimplemented Phase 5 candidates.

---

## 9. DATABASE REVIEW

**The 5 existing columns are confirmed sufficient. Nothing new is required.**

- `phone_number` — target of the OTP, holds the E.164-normalized value.
- `phone_verified` — the dedicated boolean, deliberately separate from `is_verified` (confirmed still correctly separated by the email-change work, which never touched this column).
- `phone_otp_hash` — hash-at-rest, same convention as every other secret-at-rest column already in this table.
- `phone_otp_expires` — expiry-at-query-time, same convention as every other expiring credential. **Also serves the 60-second resend cooldown** (§8) by subtraction (`phone_otp_expires - INTERVAL '10 minutes'` = issuance time) — this is *why* no separate `phone_otp_issued_at`/`phone_otp_last_sent_at` column is needed, closing the one place a naive implementation might have reached for a 6th column.
- `phone_otp_attempts` — the attempt counter, reset to 0 on new-OTP issuance, incremented on each failed verify, checked against the 5-attempt ceiling.

No index is proposed beyond what already implicitly exists, matching the original audit's own explicit reasoning (§6.2) for why `email_change_token_hash` never got a dedicated index either — this table is not at a scale where a full-table-scan-free lookup plan is a real concern, and adding one inconsistently for phone while every other token column lacks one would be a new, unjustified inconsistency.

---

## 10. FRONTEND UX PLAN (design only — not implemented)

Structurally parallel to `Profile.tsx`'s just-shipped email-change section (inline expanding form, not a modal — matching this page's own established convention, not the modal pattern used elsewhere in the app).

- **State 1 — No phone:** "Add phone number" text action (mirrors "Change email"'s exact placement/styling) opens an inline form: one phone input (`type="tel"`, client-side format hint only, E.164 normalization is server-authoritative) + "Send code" button.
- **State 2 — Phone entered / OTP pending:** Replaces the form with a pending box (mirrors the email pending-box exactly): the number just entered, "Verification pending," a 6-digit code input, "Verify" button, "Resend code" button with a **visible countdown** (60s, client-side timer derived from the moment the request/resend call resolved — purely a UX nicety, the server remains the authoritative cooldown enforcer per §8), and, optionally, "X attempts remaining" once at least one wrong attempt has been made (not required to show before the first wrong attempt, since 5/5 remaining is a null-information display).
- **State 3 — OTP verification (submitting):** "Verify" button shows a loading state, disabled while in flight (duplicate-submission-proof, identical pattern to every other in-flight button in this codebase). A wrong code shows an inline error (mirrors the existing `resendMessage`/`avatarError` inline-not-global placement) and clears the input for retry; the 5th wrong attempt shows the distinct "too many attempts" message from §8 and collapses back toward State 1 (the OTP is gone; the user must request a fresh one).
- **State 4 — Verified phone:** Shows the number in a **masked form** by default (e.g. `+91 9****3210`, per the original audit's §4.10 UX flag, product sign-off pending) with a "Remove" action. No "change" affordance is proposed here beyond remove-then-re-add, matching phone's simpler (non-unique, non-identifier) nature versus email.
- **Accessibility:** Same baseline as the just-shipped email-change work — `<label htmlFor>`/`id` pairing throughout, native input types (`type="tel"`) for assistive-tech-friendly semantics, `disabled` + visible label-text changes (not color-only) for every in-flight state.
- **Mobile layout:** Same `max-w-2xl` single-column container the rest of Profile already uses; `break-all`/`flex-wrap` equivalents for the phone-number display, matching the pattern just proven for long emails.
- **Never a silent infinite-loading dead end:** matches the existing avatar broken-image-fallback principle explicitly called out in the original audit's §8 — a network failure on send/verify must always resolve to a visible error state, never a stuck spinner.

---

## 11. PHASE 5 COMPATIBILITY

Nothing in this design needs to be undone to support future Phase 5 work:

- **2FA:** A verified phone number (`phone_verified = true`) is the natural prerequisite a future SMS-2FA feature would gate on — this document's design produces exactly that fact and nothing more, keeping the door open without walking through it.
- **Active sessions/device management:** Unrelated to phone verification's data model; no conflict.
- **Account recovery:** Explicitly NOT implemented via phone in this phase (§8's non-goals) — a future "recover via SMS" feature would need its own new endpoint and its own enumeration/abuse analysis (distinct from `forgotPassword`'s existing email-based one), not a widening of `verify-phone`.
- **Login alternatives:** Explicitly NOT implemented via phone in this phase — same reasoning as account recovery.

---

## 12. ENVIRONMENT VARIABLES / SECRETS REQUIRED (names only — none set, none requested, none exposed by this audit)

| Variable | Purpose | Present today? |
|---|---|---|
| `SMS_PROVIDER` | Selects the `SmsProvider` implementation (`'console'` default, `'msg91'` to activate) | No — new |
| `MSG91_AUTH_KEY` | MSG91 API authentication | No — new |
| `MSG91_SENDER_ID` | Registered DLT sender ID | No — new |
| `MSG91_DLT_TEMPLATE_ID` | Approved DLT template ID for the OTP message | No — new |

No other secret is required. No AWS credentials, no Twilio credentials (neither vendor was selected). This audit does not request, generate, or handle any of the above values — only names them as what a future implementation task will need to configure.

---

## 13. ESTIMATED IMPLEMENTATION COMPLEXITY

**Moderate — comparable to, slightly larger than, the just-shipped email-change backend+frontend work**, because of two genuinely new pieces email-change didn't have:

1. **A new dependency:** E.164 phone normalization (e.g. `libphonenumber-js`) — the original audit already flagged this (§12) as the one unavoidable new library; nothing in this document's research changes that.
2. **A new provider integration from scratch:** email-change reused an already-implemented, already-tested `EmailProvider`; phone verification requires building `SmsProvider`/`ConsoleSmsProvider`/`MSG91SmsProvider` from nothing, mirroring but not reusing existing code.

Everything else (rate limiter shape, notification preference key, repository allowlist pattern, controller/route/DTO shape, atomic-UPDATE verify pattern, test-mocking strategy) is a direct, low-risk application of a pattern already proven twice (password-change, email-change) in this exact codebase.

**Not required, and explicitly out of scope for the complexity estimate:** any DLT registration work itself (§6) — that is account/business paperwork, not engineering, and has its own multi-day external lead time independent of how fast the code ships.

---

## 14. EXACT IMPLEMENTATION ORDER (for whoever implements next — not started by this audit)

1. Add `libphonenumber-js` dependency; confirm no other normalization approach is silently assumed.
2. Build `SmsProvider` interface + `ConsoleSmsProvider` + `smsProviderFactory` + `env.smsProvider` (mirrors `EmailProvider`'s exact file layout, §4) — no MSG91 code yet, so this step alone is already fully testable.
3. Build `smsService.ts` (`sendOtpSms`) calling the factory — mirrors `emailService.ts`.
4. Repository methods: OTP-hash lookup/consume-on-verify (mirrors `consumeEmailChangeToken`'s atomic-UPDATE pattern), allowlisted update for request/resend (mirrors the `AUTH_UPDATABLE_COLUMNS` extension already done for email-change).
5. Service logic: `requestPhoneVerification`, `resendPhoneVerification`, `verifyPhone` in `users.service.ts`.
6. DTO validation (`users.dto.ts`): phone-format input schema (format-only, normalization happens in the service, matching where email format vs. business-logic validation is already split for email-change).
7. Three new `RateLimitProvider` methods + `ExpressRateLimitProvider` implementations (mirrors the three added for email-change), mounted **after** `authenticate` in `users.routes.ts` from the very first commit (BUG-003 lesson, non-negotiable).
8. Routes + controller wiring.
9. New `phone_verification` notification-preference key + the one notifyUser call site for "phone verified" (in-app only, per the original audit §9 — no external channel needed, the user is already looking at the screen that just succeeded).
10. Backend tests first (mirrors this codebase's established backend-then-frontend order for every prior Profile phase) — mocked `SmsProvider`, zero real MSG91 credential ever required, zero new CI secret.
11. Frontend: `Profile.tsx` phone section (§10), matching the inline-form convention just established for email.
12. Frontend tests.
13. Full verification pass: focused suites, full backend suite once, full frontend suite once, both `tsc`/production builds — matching the exact discipline already used for every prior Phase 4 slice.
14. **Separately, and only when genuinely ready for production SMS (not blocking steps 1-13):** the India DLT registration chain (§6) and setting the four real environment variables (§12) in the deployed environment. Steps 1-13 must all be completable and fully testable with zero real MSG91 credential, exactly as designed in §7.

---

## AUDIT COMPLETE

This document is architecture, provider-comparison, and threat-model analysis only. No route, migration, schema change, dependency, UI change, or secret was added to the repository as part of producing it. Implementation begins only on explicit future direction, following the order in §14.
