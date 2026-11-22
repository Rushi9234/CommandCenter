# Profile Phase 4 — Email/Phone Verification: Architecture & Security Audit

**Date:** 2026-09-19
**Status:** AUDIT ONLY — NO IMPLEMENTATION, NO SCHEMA CHANGES, NO ROUTES
**Scope:** Email-change verification, phone verification, related security/session/notification design
**Canonical Profile status at time of writing:** Phase 1 COMPLETE · Phase 2 COMPLETE · Phase 3 COMPLETE · **Phase 4 NOT STARTED (this document)** · Phase 5 FUTURE

---

## 1. CURRENT-STATE FINDINGS

Every claim below is sourced from reading the actual current code, not assumed. Each finding is tagged **[EXISTS]** (already true in the codebase today, Phase 4 must account for it) or **[MISSING]** (does not exist, Phase 4 must decide whether to build it).

### 1.1 Email storage & identity

- **[EXISTS]** `users.email VARCHAR(255) UNIQUE NOT NULL`, indexed (`idx_users_email`) — `database/schema.sql`.
- **[EXISTS]** Email is the login identifier. `authService.login(email, password)` looks up by email; there is no username-based login path.
- **[EXISTS]** Verification state is a single boolean, `users.is_verified`, with **no distinction between "account verified" and "email address verified"** — the same flag that gates login today was designed only for the initial-signup verification flow, not for tracking whether the *current* email address has ever been proven reachable after a change.
- **[MISSING]** There is no `email_verified_at` timestamp, no per-address verification history, and no concept of "this specific email string was verified" separate from "this account was verified at signup."

### 1.2 Is email currently treated as verified, and does login depend on it?

- **[EXISTS]** Yes — `authService.login()`: `if (!user || !user.is_verified || !validPassword) throw new UnauthorizedError('Invalid credentials')`. An unverified account cannot log in at all, full stop. This is a hard, unconditional gate, not a soft warning.
- **[EXISTS]** `is_verified` is set exactly two ways: (a) `env.autoVerify` (dev/demo only, forced `false` in production regardless of the env var — see `config/env.ts`), or (b) a successful `POST /api/auth/verify-email` consuming a valid `verification_token`.
- **Implication for Phase 4:** if an email *change* is added, the design must decide explicitly whether changing email touches `is_verified` at all. Recommendation in §3 below: it must not — `is_verified` should continue to mean "this account completed its original signup verification," and a *new*, separate state should track "the current email address has been confirmed to belong to this account."

### 1.3 Is email exposed in any profile/public response?

- **[EXISTS]** `GET /api/users/me` (`usersRepository.getProfileById`) returns `email` — expected, it's the caller's own profile.
- **[EXISTS — pre-existing exposure, not introduced by this audit, worth flagging]** `GET /api/users` (`usersRepository.getAllUsers`, Milestone 41) returns `u.email` for every user who shares at least one team with the caller. This was a deliberate scoping decision made in Milestone 41 (narrowed from "every user in the database" to "teammates only") but the email field itself was never subsequently reconsidered. Phase 4 does not need to fix this (out of scope — it is a pre-existing, already-shipped exposure, not a Phase 4 regression), but any new "is this email pending change / verified" indicator must **not** be added to this teammates-scoped endpoint, since that would leak a user's in-progress email-change attempt to every teammate.
- **[MISSING]** `is_verified` itself is **not** currently returned by `getProfileById`'s `SELECT` list at all — the Profile page today has no way to show "email verified" / "email unverified," not even read-only. Phase 4 must add this (or a Phase-4-specific equivalent) to the profile response before the frontend can render any verification badge.
- **[EXISTS]** Frontend: `Profile.tsx` renders `profile.email` as plain read-only text with the caption *"Email changes coming in a future phase"* — i.e., the current UI already anticipates this exact phase and intentionally blocks editing.

### 1.4 Every existing API/UI dependency on the email field

| Consumer | Reads email? | Writes email? |
|---|---|---|
| `POST /api/auth/register` | writes (initial) | — |
| `POST /api/auth/login` | reads (identifier) | — |
| `POST /api/auth/forgot-password` / `reset-password` | reads (lookup only) | — |
| `POST /api/auth/verify-email` / `resend-verification` | reads (lookup only) | — |
| `GET /api/users/me` | reads, returns to caller | — |
| `GET /api/users` (teammates list) | reads, returns to teammates | — |
| `PUT /api/users/me/profile` | — | **does not** — `email` is absent from both `UPDATABLE_COLUMNS` (`users.repository.ts`) and `AUTH_UPDATABLE_COLUMNS` (`auth.repository.ts`) |
| `frontend/src/pages/Profile.tsx` | reads, displays read-only | **no** edit control exists |
| `team_invites.email` | separate column, invite-flow only, unrelated to a user's own account email | — |

**Conclusion: there is currently no code path anywhere in the application, backend or frontend, capable of changing a user's email after account creation.** This is not a bug to fix — it is the accurate starting line for Phase 4.

### 1.5 Phone: current state

- **[MISSING] Everything.** No `phone`/`phone_number` column in `database/schema.sql` or any migration. No SMS/OTP provider abstraction anywhere under `backend/src/services/`. No phone-related route, DTO, or frontend field. Phone verification is **100% greenfield** — there is nothing to reconcile, only to design.

### 1.6 Reusable primitives already established (Phase 4 should not reinvent these)

- **[EXISTS]** `generateOpaqueToken()` — `crypto.randomBytes(32).toString('hex')` (256-bit random) — used for verification tokens, password-reset tokens, and refresh tokens.
- **[EXISTS]** `hashToken()` — SHA-256, one-way — every one of the above token types is stored **only as its hash**, never raw. This is the established, audited convention; a raw token exists only transiently in memory and in the one-time email/SMS sent to the user.
- **[EXISTS]** One-active-token-per-purpose-per-user pattern: `verification_token`/`verification_token_expires` and `password_reset_token_hash`/`password_reset_expires` are single-slot columns on `users` (not a separate multi-row token table). Generating a new token overwrites the old one in the same UPDATE, which **automatically invalidates any previously-issued token of that kind** — there is no scenario today where two valid tokens of the same purpose coexist for one user.
- **[EXISTS]** Expiry enforced at the query level (`WHERE ... _expires > CURRENT_TIMESTAMP`), not just at generation time.
- **[EXISTS]** Anti-enumeration convention: `resendVerification` and `forgotPassword` both silently no-op (200/202-shaped success either way) for a nonexistent or already-satisfied account, never revealing which case occurred. `register` is the one deliberate exception (it must tell the caller their chosen email/username is taken).
- **[EXISTS]** Timing-attack mitigation on `login`: a dummy bcrypt hash of matching cost is compared even when no user is found, so response time doesn't leak account existence. This pattern is specific to password comparison and does not directly transfer to token/OTP comparison (see §11), but the *principle* (equal-cost response regardless of branch taken) is the established house style.
- **[EXISTS]** Notification categories are **free text** on the `notifications` table — adding a new category (e.g., `email_change_requested`) requires **zero schema change**. The only code-level list that must be extended is `NOTIFICATION_PREFERENCE_KEYS` (`notifications.dto.ts`), which currently is `['team_join_request', 'goal_creation', 'goal_completion', 'task_assignment', 'blocker', 'password_change']`, plus a corresponding `notifyUser()` call site.
- **[EXISTS]** Rate-limit infrastructure: `RateLimitProvider` interface → `getRateLimitProvider()` factory → `ExpressRateLimitProvider` implementation. Every existing limiter (`createAuthLimiter`, `createRefreshLimiter`, `createPasswordChangeLimiter`, `createAvatarLimiter`) follows the same shape: a new interface method, a new provider implementation, applied as route-level middleware **after** `authenticate` when the limiter is per-user (this exact ordering mistake was just found and fixed for the password-change limiter — see `COMMANDCENTER_BUG_AUDIT.md` BUG-003 — and must not be repeated for any new Phase 4 limiter).
- **[EXISTS]** Email delivery is **not hypothetical infrastructure** — it exists as a provider abstraction (`EmailProvider` interface, `emailProviderFactory.ts`) with three real implementations: `ConsoleEmailProvider` (default, logs only, dev-safe), `SmtpEmailProvider`, and `ResendEmailProvider` (a real transactional-email API integration). **However:** the default in `config/env.ts` is `emailProvider: process.env.EMAIL_PROVIDER || 'console'`. Whether a real provider (`EMAIL_PROVIDER=resend` or `smtp`) is actually configured in the live deployed environment is a **deployment/operations fact this audit cannot verify from source alone** — this document does not claim email delivery is live in production, only that the code-level capability to send real email already exists and does not need to be built from scratch for Phase 4.
- **[MISSING]** No equivalent `SmsProvider` abstraction exists. Any phone-verification design must either build one (mirroring the `EmailProvider` pattern) or explicitly decide to route the phone OTP through email as a stand-in (see §4).

### 1.7 Session/JWT architecture relevant to Phase 4

- **[EXISTS]** JWT payload is `{ userId, role, iat, exp }` only (`jwt.ts`'s `AccessTokenPayload`). **Email is never embedded in the token.** Changing a user's email therefore does **not** make any existing JWT's *payload* stale — there is no cached email string inside the token that would need re-issuing.
- **[EXISTS]** The established pattern for "force logout on sensitive account change" is `password_changed_at`: `authenticate()` rejects any JWT whose `iat` predates the account's `password_changed_at`. This is the exact mechanism Phase 4 should reuse (not reinvent) if the decision is made to invalidate sessions on email change (see §5).
- **[EXISTS]** Refresh tokens are a separate, revocable, DB-backed mechanism (`refresh_tokens` table, hash-only storage, rotation on use). `resetPasswordAndRevokeSessions` atomically updates the password and revokes all refresh tokens in one transaction — the established pattern for "this account event ends every other session," reusable for email change if that's the chosen design.

---

## 2. EMAIL VERIFICATION DESIGN (for a *change*, not initial signup — initial signup verification already exists and is out of scope for changes)

### 2.1 Initial-account verification vs. verification-after-change

These are **two distinct, already-partially-divergent flows** and must stay that way:

- **Initial signup verification** (existing, Phase 4 does not touch): gates login entirely (`is_verified`). Unverified = cannot use the account at all.
- **Verification after an email change** (Phase 4, new): must **never** gate login or lock the account out. The account is already verified and active; a pending email change is an *in-progress update*, not an account-access gate. If it gated login, a user who requested an email change but never clicked the link would be locked out of an account they already legitimately verified — that is a self-inflicted denial-of-service the design must explicitly avoid.

### 2.2 Recommended flow (two-step, verify-new-address-first)

1. User (authenticated, already logged in) submits `new_email` + current password (see §3 for why password confirmation is required).
2. Server validates `new_email` is syntactically valid, not already in use by another account, and not identical to the current email.
3. Server generates an opaque token (reuse `generateOpaqueToken()`), hashes it (reuse `hashToken()`), stores the hash with an expiry, and records `new_email` in a pending-change field (see §6 for exact column proposal).
4. Server sends the verification link **to `new_email`**, not the current one. This is the single most important design decision in this section (see §11.2): verifying possession of the *new* address before it becomes authoritative is what prevents an attacker who has merely hijacked the *session* (not the current email inbox) from silently redirecting the account to an address they control.
5. **Current email is unchanged and remains authoritative for login until step 6 completes.** A notification (not the verification link) is also sent to the *old* email at step 3, informing the account owner a change was requested (see §3.2 and §9) — this is the user's chance to notice and react if they didn't initiate it.
6. User clicks the link sent to `new_email`, submits the token. Server validates hash + expiry + one-time-use, then atomically: sets `email = new_email`, clears the pending-change fields, and (decision point, see §3.4) optionally revokes other sessions / requires re-login.
7. A confirmation notification is sent to **both** the old and new addresses after the swap completes.

### 2.3 Token generation, storage, hashing, expiry, one-time-use

All identical in mechanism to the existing password-reset/verification tokens — no new primitive needed:
- Generate via `generateOpaqueToken()` (256-bit random, hex).
- Store only `hashToken(rawToken)` — never the raw value — in a new column (see §6).
- Expiry: **1 hour**, matching the existing `PASSWORD_RESET_TTL_MS` precedent (an email change is a sensitive, security-adjacent action, not a routine 24-hour signup-verification window; shorter-lived reduces the window a leaked link is exploitable).
- One-time-use: enforced the same way as today — the token hash column is cleared the moment it is successfully consumed, and the lookup query filters on `_expires > CURRENT_TIMESTAMP` so an expired-but-not-yet-cleared row can never be replayed.

### 2.4 Invalid / expired / replayed token behavior

- **Invalid** (hash not found): generic `400 Bad Request`, message identical to "Invalid or expired verification token" (matches existing `verifyEmail`'s exact wording) — never reveal *why* it's invalid (wrong token vs. no pending change at all vs. belongs to a different user).
- **Expired**: same generic message. Do not distinguish "expired" from "never existed" in the response (timing/message parity, matching the existing convention).
- **Replayed** (already consumed): the hash column was already cleared on first use, so a replay is indistinguishable from "invalid" at the database level — same generic response. No special replay-detection logging is strictly required for this flow (contrast with refresh-token reuse detection, which exists because refresh tokens are higher-value/longer-lived; a consumed email-change token is single-purpose and already worthless once used).

### 2.5 Resend behavior & whether a new request invalidates older tokens

- **Yes — invalidate on resend/re-request**, matching the existing single-slot-column pattern. If a user requests a *second* email change (either to the same pending new address, or a different one) before verifying the first, the new request's token generation overwrites the old token hash and old pending-email value in the same UPDATE. There is deliberately never more than one pending email change per user at a time.
- A "resend verification for my pending email change" endpoint should exist, generating a fresh token against the *same* pending `new_email` (not letting the user silently change target mid-flow without re-authenticating) — mirrors `resendVerification`'s shape.

### 2.6 Rate limiting

- **Request email change**: authenticated, per-user key (like `createPasswordChangeLimiter`) — mounted **after** `authenticate` on the router, per the BUG-003 lesson. Suggested: 3/hour (same threshold as password change — both are sensitive account-mutation actions with a legitimate-retry ceiling).
- **Resend verification for pending change**: same limiter or a slightly more generous sibling (e.g., 5/hour) — a user who mistyped the new address and needs to correct it shouldn't burn their "request change" budget on retries of the *same* target.
- **Verify email-change token endpoint**: this one is reached with a token in hand, not by an authenticated user retrying — it should be rate-limited **by IP**, not by user (the caller may not even be logged in as the account in question if verification happens on a different device than the one that requested it), matching `createRefreshLimiter`'s IP-only shape.

### 2.7 Enumeration resistance

- The "request email change" endpoint is authenticated (the caller already knows their own account exists), so classic pre-auth enumeration doesn't apply to *that* endpoint the way it does to `forgotPassword`. However, it must still not reveal *whether `new_email` belongs to another existing account* via response timing or message difference from "email already registered" vs. "invalid email format" — recommend collapsing "email already in use" into the same generic validation-error shape as other input problems, to avoid letting an attacker enumerate registered emails by repeatedly attempting to change their own account's email to guessed targets. (This is a **new** enumeration surface, introduced by this feature — not present today, since no such endpoint exists yet.)
- The verify-token endpoint should behave like §2.4 — generic message regardless of cause.

### 2.8 Behavior after successful verification

- Email is swapped, pending-change fields cleared, confirmation notification sent to both old and new addresses (§9).
- Login going forward uses the new email (email is the login identifier — §1.2).
- `is_verified` is **not** touched (§1.2's recommendation) — the account's original signup-verification status is unrelated to this event.

---

## 3. EMAIL-CHANGE SECURITY

### 3.1 Old email stays authoritative until new email is verified

**Yes, non-negotiable, and already the natural consequence of §2.2's design** — the `email` column is only ever written at the final verification step (step 6), never at the request step (step 3). Login continues to use the *old* email throughout the pending period. There is no intermediate state where the account has "no" email or two simultaneously-valid emails.

### 3.2 Does the old email receive a notification?

**Yes, at request time (not just at completion).** This is the account owner's earliest opportunity to notice and react to an email change they did not initiate — waiting until the *new* email is verified to notify the old one would mean an attacker who successfully completes the takeover has already locked the real owner out before they're ever told. A second notification to *both* addresses fires on successful completion (§9).

### 3.3 What happens to login during the pending change?

Nothing changes. The old email remains the login identifier and the account is fully usable throughout. This directly follows from §3.1 — there is no reason login behavior should differ, since `email` (the column `login()` queries) has not changed yet.

### 3.4 Password / current-session confirmation required to *initiate* a change

**Yes — require current password confirmation on the request-change endpoint** (`request_email_change` body includes `current_password`, verified via `bcrypt.compare` exactly like `changePassword` already does). Rationale: email is the account's recovery/login identifier; changing it is at least as sensitive as changing the password, and the codebase already treats password-change as needing... no wait — actually `changePassword` requires the *current* password too, for the same reason. Requiring re-confirmation of the current password specifically defends against session-hijacking (an attacker who stole a live session/cookie but does not know the password cannot pivot that into a permanent account takeover by silently changing the recovery email).

### 3.5 Concurrent email-change requests

Handled naturally by §2.5's single-pending-slot design: a second request from the same authenticated session simply overwrites the first (last request wins, previous token invalidated). **Genuinely concurrent requests** (two near-simultaneous HTTP requests, e.g. from two open tabs) are a narrow race the existing codebase already tolerates for equivalent flows without a DB-level lock or transaction (see `auth.service.ts`'s own comment on `register()`'s duplicate-email race — the accepted mitigation there is that the second write's constraint violation gets translated into a safe error by `errorHandler.ts`, not that the race is prevented outright). The equivalent, consistent choice for Phase 4: no explicit lock; a genuine double-submit produces either (a) two sequential overwrites that resolve to whichever request's UPDATE commits last (harmless — the user only intended one change anyway), or (b) if both attempt to set `new_email` to the *same* value and that email happens to be claimed by a third party in between, the second one's uniqueness check fails safely. Not adding transactional locking here matches the codebase's established risk tolerance for this class of low-severity, self-inflicted race.

### 3.6 Stale verification links

A verification link becomes stale via either mechanism already covered: (a) natural expiry (1 hour, §2.3), or (b) superseded by a newer request (§2.5, token hash overwritten). Both produce the same generic "invalid or expired" response (§2.4) when the stale link is eventually clicked — no distinct message is needed or wanted.

### 3.7 Can the previous verified email be restored safely?

Only via the **same mechanism** as any other email change — the user (or an account-recovery flow, entirely out of Phase 4's scope) initiates a new email-change request targeting the old address, and must re-verify possession of it via the same link-to-new-address flow. There is no separate "undo" endpoint, and there should not be one: an "instant revert with no re-verification" path would be a direct route around the entire point of §2.2 (verify possession before an address becomes authoritative). If the *new* email was never actually reachable by the real account owner (i.e., the change itself was fraudulent and somehow completed anyway — which §11.2's design should prevent from being possible in the first place), recovery is an out-of-band support/account-recovery matter, not a self-service endpoint.

---

## 4. PHONE VERIFICATION

### 4.1 Optional or required?

**Optional**, consistent with the existing prior audit's own recommendation and with the fact that phone is not currently part of account identity at all. Nothing in the current login/recovery flow requires it, and Phase 4 should not introduce a requirement that didn't exist before.

### 4.2 Storage format / normalization

- Store in **E.164 format** (`+<countrycode><number>`, e.g. `+14155552671`) — the universal, unambiguous international format, avoiding the ambiguity of locally-formatted numbers (leading zeros, varying separators, missing country code). Normalize on input (strip formatting characters, validate via a standard library such as `libphonenumber-js`) before storage or lookup — this is a **new dependency Phase 4 would need to add**, not something already in `package.json`.
- A separate `phone_number` column, distinct from `email`, with its own `phone_verified` boolean and its own verification-token/OTP columns (see §6) — mirroring the existing `email`/`is_verified` pairing structurally, but intentionally **not reusing** the email-verification columns (they serve different purposes and different data types/expiry semantics — see §4.4 OTP vs. link).

### 4.3 Verification state

A dedicated `phone_verified BOOLEAN DEFAULT false` — **not** reusing `is_verified` (which is signup-account-verification, an unrelated concept per §1.2). `phone_number` itself can be `NULL` (never set) independent of `phone_verified`'s value; `phone_verified` is only ever meaningful when `phone_number IS NOT NULL`.

### 4.4 OTP vs. link

**Recommend OTP (numeric code), not a clickable link**, for phone — this is the near-universal convention for SMS verification (SMS clients don't reliably render clickable verification links the way email clients do, and a short numeric code is faster to key in on a phone that just received it). This is a deliberate **divergence** from the email flow's link-based design, not an inconsistency — the two channels have different natural UX, and forcing phone into the email-link pattern (or vice versa) would fight the medium.

- 6-digit numeric OTP, generated via a cryptographically random source (`crypto.randomInt(100000, 999999)`, not `Math.random()`), **stored hashed** at rest (SHA-256, same `hashToken()` primitive, applied to the OTP string) — a 6-digit space is small enough (1,000,000 possibilities) that hashing alone is not sufficient defense against brute force; see §4.6 and §11.4 for the attempt-limiting that must accompany it.

### 4.5 OTP expiration

**10 minutes.** Long enough for a real SMS delivery delay and for the user to switch back to the app/browser tab; short enough to sharply bound the brute-force window described in §11.4.

### 4.6 Maximum attempts

**5 incorrect attempts per issued OTP**, after which that specific OTP is invalidated (cleared) and the user must request a new one (subject to the resend cooldown, §4.7) — this closes the brute-force window described in §11.4 far more tightly than expiry alone (10 minutes at even a generous few-guesses-per-second would otherwise be far too many attempts against a 6-digit space).

### 4.7 Resend cooldown

**60 seconds between resend requests**, separate from and in addition to the hourly rate-limit ceiling (§4.8) — this specifically defeats a rapid-fire "resend immediately, over and over" pattern that a per-hour limit alone wouldn't catch until the ceiling was already hit, and matches the near-universal "resend code" cooldown UX convention users already expect from other products.

### 4.8 Abuse / rate limiting

- **Request/resend OTP**: authenticated, per-user key, e.g. 5/hour (mirrors the password-change/avatar precedent of a per-user express-rate-limit provider method, mounted after `authenticate`).
- **Verify OTP**: also per-user (the caller is authenticated throughout — unlike the email-change-verification link, which may be opened on a different, unauthenticated device/session, phone verification is a same-session, in-app code-entry flow) — the 5-attempts-per-OTP ceiling (§4.6) is the primary defense here, with the per-user hourly limiter as a secondary backstop against attempting many *different* OTPs in sequence.
- **SMS cost containment**: an SMS provider costs real money per message, unlike email — the per-user hourly limiter doubles as basic cost/abuse containment, but a global/IP-level ceiling should also be considered before this ships with a real SMS provider wired in (out of scope to fully design here — flagged as a dependency in §8).

### 4.9 Does verified phone become usable for login/recovery now, or is it just a verified profile attribute?

**Just a verified profile attribute in Phase 4.** Using phone as a login method or as an account-recovery channel is a materially larger feature (new login endpoint accepting phone+OTP instead of email+password, or a "recover via SMS" parallel to `forgotPassword`) that duplicates significant surface area of the existing auth system and introduces its own enumeration/abuse considerations distinct from what this document covers. Recommend treating "phone-based login/recovery" as an explicit **Phase 5 candidate** (2FA-adjacent), not folding it into Phase 4. Phase 4's phone verification exists to let a user *prove* they control a number and display that fact — nothing more.

### 4.10 Privacy / display rules

- Phone number should **never** appear in the teammates-scoped `GET /api/users` response (§1.3's existing email-exposure precedent should not be repeated for phone — if anything, this is a chance to be *more* conservative than the pre-existing email exposure, not equally loose).
- On the user's own `GET /api/users/me`, return phone in a display-masked form by default if a full-reveal isn't needed (e.g., `+1***-***-2671`) with the full value only in the edit-flow context — a UX/security decision, not a hard requirement, flagged for product sign-off rather than dictated here.

### 4.11 Phone uniqueness

**Recommend NOT globally unique** (no `UNIQUE` constraint), unlike email. Rationale: shared/family phone numbers are common and legitimate (unlike shared email accounts, which the existing `UNIQUE` constraint on `email` already correctly forbids); forcing uniqueness would block legitimate multi-account households and has no equivalent security rationale to email's uniqueness (email uniqueness exists because email *is* the login identifier — phone, per §4.9, deliberately is not). If phone is ever promoted to a login/recovery method in a future phase, uniqueness would need to be revisited at that time.

---

## 5. AUTHENTICATION / SESSION IMPLICATIONS

### 5.1 JWT/session invalidation requirements

- **Email change:** recommend reusing the exact `password_changed_at` mechanism (§1.7) via a new column, `email_changed_at`, set at the moment the change completes (step 6 of §2.2), checked by `authenticate()` the same way `password_changed_at` already is. **Decision to make explicitly, not silently default:** should *all* sessions be forcibly logged out on email change (maximally safe, but disruptive — the user who just changed their email on their own phone would also be logged out of their laptop mid-task), or only the login-identifier semantics updated with existing sessions left intact (less disruptive, but means a session that was live *before* an account takeover completed remains live *after* — a real risk if the change was fraudulent)? **Recommendation: invalidate all other sessions**, matching the existing precedent that password changes (a comparably sensitive action) already do this unconditionally (`resetPasswordAndRevokeSessions`) — email-change security should not be held to a lower bar than password-change security.
- **Phone verification:** no session invalidation needed — phone verification is additive (proving a new fact about the account) and does not change any credential or login identifier. No precedent (password/avatar) treats an additive, non-credential change this way either.

### 5.2 Does changing email affect active sessions?

Per §5.1's recommendation: yes, all refresh tokens for the account are revoked at completion (reusing `revokeAllRefreshTokensForUser`, already implemented), and any already-issued JWT becomes invalid on its next `authenticate()` check via the new `email_changed_at` comparison — the user is asked to log in again, on every device, with their new email.

### 5.3 Does password reset / account recovery depend on verified email?

**Currently: no distinction exists** — `forgotPassword` looks up by `email` unconditionally; there is no check of `is_verified` in that path at all (an *unverified* account can still request a password reset today, which simply lets them then log in — since login itself gates on `is_verified` separately, this is presumably intentional and not a gap Phase 4 needs to touch). Phase 4 does not need to change this. It's worth noting for completeness: once email-change verification exists, `forgotPassword` will naturally always operate against whichever email is currently authoritative (the old one, throughout any pending change — §3.1), which is exactly the correct, safe behavior with zero additional code.

### 5.4 Can a verified contact be used for future security features?

Yes, by design — a verified phone number (once phone verification exists) is the natural prerequisite for a future SMS-based 2FA second factor (Phase 5). This document does not implement or design that dependency, only notes that Phase 4's `phone_verified` flag is what such a Phase 5 feature would eventually gate on.

### 5.5 Interaction with Phase 5 (sessions/2FA)

Explicitly deferred. The only forward-looking design constraint Phase 4 must honor is: don't make a decision now that would need to be *undone* to support 2FA later. The recommendations above (separate `phone_verified` from `is_verified`; treat phone as a verified attribute, not yet a login/recovery method) are specifically chosen to keep that door open without building through it prematurely.

---

## 6. DATABASE ARCHITECTURE PROPOSAL

### 6.1 Decision: extend `users` directly, not a dedicated verification table

**Recommendation: extend `users` directly**, matching the exact precedent already set by every other single-purpose verification/token field in this codebase (`verification_token`, `verification_token_expires`, `password_reset_token_hash`, `password_reset_expires` are all columns on `users`, not rows in a separate table). A dedicated table would only be justified if the design needed to support **multiple simultaneous pending tokens of the same kind per user** — and §2.5/§4 both deliberately choose the single-pending-slot model (a new request always supersedes the old one), which is exactly what a set of nullable columns on `users` already expresses cleanly, with no join required on the hot path (`authenticate()` runs on every request; adding a join there for a rarely-populated table would be pure overhead for no benefit).

### 6.2 Proposed columns (illustrative — not applied in this task)

```sql
-- Email-change verification (new, additive, all nullable)
ALTER TABLE users ADD COLUMN pending_email VARCHAR(255);
ALTER TABLE users ADD COLUMN email_change_token_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN email_change_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN email_changed_at TIMESTAMP;

-- Phone verification (new, additive, all nullable)
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);
ALTER TABLE users ADD COLUMN phone_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN phone_otp_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN phone_otp_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN phone_otp_attempts INTEGER DEFAULT 0;
```

**Why each column exists, and why nothing else is needed:**
- `pending_email` — the target address, stored in plaintext (it is not a secret; it's the value being verified, and the verification email must be human-readable in the confirmation UI anyway). Distinct from `email` so the current, authoritative address is never touched until verification succeeds (§3.1).
- `email_change_token_hash` — SHA-256 hash only, matching `password_reset_token_hash`'s exact convention (§2.3). Named `_hash` explicitly (as the existing `password_reset_token_hash` is) so no future reader mistakes it for a raw, sensitive value at rest.
- `email_change_expires` — same expiry-at-query-time pattern as the two existing token columns.
- `email_changed_at` — the new session-invalidation timestamp (§5.1), same role as `password_changed_at`.
- `phone_number` — `VARCHAR(20)` comfortably fits E.164's maximum 15 digits plus the `+` prefix and any minor future format slack.
- `phone_verified` — the dedicated, separate-from-`is_verified` boolean (§4.3).
- `phone_otp_hash` — hashed OTP at rest (§4.4), same reasoning as every other secret-at-rest column in this table.
- `phone_otp_expires` — same expiry pattern.
- `phone_otp_attempts` — the **only genuinely new column shape** in this proposal (nothing existing tracks a per-token attempt counter) — required to enforce §4.6's 5-attempt ceiling. Reset to `0` every time a new OTP is issued; incremented on each failed verify; the OTP is invalidated (hash cleared) once this reaches the limit.

**No new indexes proposed beyond what's implicit.** `email_change_token_hash` and `phone_otp_hash` are looked up by exact value (like the existing `verification_token`/`password_reset_token_hash`, neither of which has a dedicated index today either — they rely on the table being small enough, and lookups being rare enough, that a full-table-scan-free plan isn't currently deemed necessary; Phase 4 should follow the same existing standard rather than introduce an inconsistent new one). If this ever becomes a real performance concern at scale, that is a pre-existing pattern to revisit across *all* these token columns together, not a Phase-4-specific decision.

**No new constraints beyond `NOT NULL`/`DEFAULT` already implied above.** Specifically, **no `UNIQUE` constraint on `phone_number`** (§4.11) and **no `UNIQUE` constraint on `pending_email`** (uniqueness is checked against the authoritative `email` column at request time in application code, exactly like `register()` already checks email/username uniqueness in code rather than relying solely on the DB constraint to surface a friendly error — the `UNIQUE` constraint on `email` itself remains the actual backstop once `pending_email` is promoted to `email` at verification time).

### 6.3 `database/schema.sql` synchronization

Per the established, now twice-repeated pattern (profile fields, then avatar fields), any migration adding these columns **must** be mirrored into `database/schema.sql`'s inline `users` table definition in the same task that adds the migration — CI applies only `schema.sql`, never migrations (confirmed in `.github/workflows/ci.yml`). This audit does not create either file; it documents the requirement for whoever implements Phase 4.

---

## 7. API DESIGN PROPOSAL

All endpoints below are **proposed, not implemented.** All follow the codebase's established response envelope (`{ success: true, data: ... }` via `common/http/respond.ts`'s `ok()`) and error convention (thrown `AppError` subclasses, translated by the centralized `errorHandler`).

| Endpoint | Auth | Rate limit | Request | Success | Notes |
|---|---|---|---|---|---|
| `POST /api/users/me/request-email-change` | `authenticate` | new per-user limiter, ~3/hour, mounted after `authenticate` | `{ new_email, current_password }` | `202 Accepted` (or `200` with `{ pending_email }`, per §7 note below) | Validates password (bcrypt), validates `new_email` uniqueness + format, generates token, sends to `new_email`, notifies old email (§9) |
| `POST /api/users/me/resend-email-change-verification` | `authenticate` | same limiter family, slightly more generous (~5/hour) | *(none — operates on existing `pending_email`)* | `202 Accepted` | 400 if no pending change exists (this is fine to state plainly — the caller is already authenticated as themselves, so "you have no pending change" is not an enumeration leak) |
| `POST /api/auth/verify-email-change` | **none required** (token is the credential — matches `verify-email`'s existing unauthenticated shape) | IP-only limiter (mirrors `createRefreshLimiter`) | `{ token }` | `200 OK`, returns updated public user (or forces re-login per §5.1 — see note) | Generic invalid/expired message (§2.4); on success, swaps email, clears pending fields, sets `email_changed_at`, revokes all refresh tokens, notifies both addresses |
| `POST /api/users/me/request-phone-verification` | `authenticate` | new per-user limiter, ~5/hour | `{ phone_number }` | `202 Accepted` | Validates/normalizes E.164, generates OTP, hashes, stores, resets `phone_otp_attempts` to 0, sends SMS (or logs, pending provider — §8) |
| `POST /api/users/me/resend-phone-verification` | `authenticate` | same limiter + 60s cooldown (§4.7, enforced via `phone_otp_expires`-adjacent timestamp check or the limiter's own window) | *(none)* | `202 Accepted` | 400 if no pending phone verification exists |
| `POST /api/users/me/verify-phone` | `authenticate` | per-user limiter (secondary to the 5-attempt ceiling) | `{ code }` | `200 OK` | Compares hash; on mismatch increments `phone_otp_attempts` and returns generic 400; on reaching 5, clears the OTP and returns a distinct "too many attempts, request a new code" message (this one message *can* be distinct from generic-invalid, since the caller is authenticated and attempt-counting an OTP they themselves requested is not an enumeration vector); on success sets `phone_verified = true`, clears OTP fields |

**Note on `request-email-change`'s success status:** the existing prior-audit draft (`PROFILE_ACCOUNT_ARCHITECTURE_AUDIT.md`) proposed `202 Accepted` with no body; this document's recommendation is compatible but suggests including `{ pending_email }` in the response body so the frontend can immediately render "verification sent to new_email" without a second round-trip — a UX refinement, not a security-relevant change.

**Note on `verify-email-change`'s response:** because §5.1 recommends revoking all sessions, the *caller's own* current session (if they're calling this authenticated, e.g. clicking the link while still logged in on the same device) is also revoked. The cleanest contract: always respond `200 OK` with a message instructing the client to log in again, rather than issuing a fresh session inline — consistent with how `resetPassword` today does **not** auto-login the caller either (contrast with `verifyEmail`, which *does* call `issueSession` — that's the initial-signup flow, an intentionally different UX moment where auto-login is desirable; email-*change* is not the same moment and should not copy that behavior).

**Authorization rule for all six endpoints:** every one operates exclusively on `req.user.userId` from the JWT — none accept or honor a client-supplied user id, matching the codebase's universal existing convention for every `/users/me/*` route.

---

## 8. FRONTEND UX PROPOSAL

All of the following are **proposed flows for `Profile.tsx`**, not implemented. No component code, routes, or state management is created by this audit.

- **Verified email (default/current state for every existing account):** current behavior mostly unchanged — email shown read-only, but the static caption *"Email changes coming in a future phase"* is replaced with a real **"Change email"** action (button/link) that opens the request-change flow. A small "Verified" badge/checkmark could accompany the email field once `is_verified` is actually returned by the profile endpoint (§1.3 — a Phase 4 prerequisite, not yet true today).
- **Unverified email:** in the current codebase this state is unreachable for a logged-in user (login itself is gated on `is_verified` — §1.2), so this UI state realistically never needs to render for anyone who can view their own Profile page today. No UI work needed for this case under Phase 4's scope as defined.
- **Pending email change:** replace the read-only email display with a two-line state — current (authoritative) email, plus *"Verification pending for newaddress@example.com — check your inbox"* with a **"Resend verification"** action and a **"Cancel"** action (cancel = simply clear the pending fields server-side, a trivial addition to §7's surface not separately itemized above since it's a one-line DELETE-shaped variant of the same resource, left to implementation to decide the exact route shape).
- **Resend verification:** button with a cooldown-aware disabled state (matches the existing avatar-upload "uploading..." disabled-button UX pattern already established in `Profile.tsx`) and a success toast ("Verification email resent").
- **Email change (the request form itself):** modal or inline expansion, two fields — new email, current password — submit button, client-side format validation only (server-side remains authoritative, matching the existing avatar-upload client/server validation split already documented in that phase).
- **Optional phone verification:** a new "Phone" section, structurally parallel to the Avatar section — unset state shows an "Add phone number" input + "Send code" button; pending state shows a 6-digit code input + "Verify" + "Resend code" (with cooldown) + attempts-remaining awareness if the design wants to surface it (optional, not required); verified state shows the (optionally masked, §4.10) number with a "Verified" badge and a "Remove" action.
- **Expired/invalid verification (either email-change link or phone OTP):** generic error message matching the backend's generic response (§2.4) — e.g., "This verification link is invalid or has expired. Please request a new one." Never a distinct message per failure cause, mirroring backend behavior exactly so the UI doesn't accidentally leak distinctions the API deliberately withholds.
- **Success/failure messaging:** reuse the existing `saveSuccess`/`passwordSuccess`-style transient success banner pattern already in `Profile.tsx` (auto-clears after ~3 seconds) for every success case above; reuse the existing inline error-banner pattern for every failure case.

---

## 9. NOTIFICATIONS (defined, not implemented)

Reusing the existing free-text-category + `NOTIFICATION_PREFERENCE_KEYS` infrastructure (§1.6). Proposed new preference-group keys (would extend the array in `notifications.dto.ts`, no schema change): `email_change`, `phone_verification`.

| Event | Recipient | Category (example) | Preference group |
|---|---|---|---|
| Email change requested | **old** email/account | `email_change_requested` | `email_change` |
| Email change completed | **both** old and new addresses | `email_change_completed` | `email_change` |
| Phone verification completed | account (in-app notification, no external channel needed — user is already looking at the screen that just succeeded) | `phone_verified` | `phone_verification` |

All three should default **ON** (matching the existing default-true convention for every current preference key, including `password_change` — a security-relevant notification should never default to silent). The email-change notifications are the more security-critical pair (§3.2) and arguably should not even be user-suppressible the way, say, `goal_creation` is — that policy decision (is `email_change` a togglable preference at all, or a mandatory security notification like the existing password-change one already effectively is by never having a UI to disable it) is flagged for explicit product sign-off, not decided unilaterally here.

---

## 10. TESTING STRATEGY (defined, not implemented)

**Backend, focused, by scenario:**
1. Request email change succeeds with correct password; fails with incorrect password (mirrors `changePassword`'s existing test shape).
2. New email already in use by another account → rejected, generic error.
3. New email identical to current email → rejected (no-op change).
4. Verification link sent to the **new** address, not the old one (assert via mocked `EmailProvider`/`sendVerificationEmail`-equivalent call args — old email must never receive the token itself, only the notification).
5. Old email receives a request notification at request time (§3.2), asserted via the notification system, not the email send.
6. Valid token verifies successfully: `email` updates, `pending_email`/token fields clear, `email_changed_at` sets, all refresh tokens for the user are revoked (assert via `getValidRefreshToken` returning nothing for the pre-change tokens).
7. Expired token → generic 400, no state change.
8. Invalid/nonexistent token → generic 400, identical message to #7.
9. Replayed (already-consumed) token → generic 400, identical message.
10. A second request-change call before the first is verified invalidates the first token (old token no longer verifies; only the newest is valid) — direct test of §2.5.
11. Resend generates a new token for the *same* pending email without requiring the password again (matches §2.5's "same target, just resend" case) — or, if the implementation decides resend also requires re-confirmation, that decision is tested explicitly either way.
12. Rate limit enforced on request-change (per-user, exhausted after N, 429) — reuse the just-established pattern from the password-change-limiter fix, including the earlier lesson: **must** test *two different users* are not sharing one bucket (the exact regression class BUG-003 was).
13. Unauthenticated request to `request-email-change` → 401, never reaches the limiter or the handler (same shape as the password-change unauthenticated test added in the BUG-003 fix).
14. `verify-email-change` requires no authentication and works from a fresh/different session than the one that requested the change (simulates "clicked the link on my phone, requested from my laptop").
15. Concurrent/rapid double-submission of request-change (§3.5) does not corrupt state — second request's result is well-defined (overwrites cleanly), no unhandled exception, no orphaned pending state.
16. Phone: valid OTP verifies successfully, sets `phone_verified = true`, clears OTP fields.
17. Phone: wrong OTP increments `phone_otp_attempts`; 5th wrong attempt clears the OTP entirely and further attempts against it fail even if the *next* guess would have been correct.
18. Phone: expired OTP → generic failure, same shape as attempt-exhaustion (or distinct, per whatever the implementation decides for the one message that's allowed to differ per §7's `verify-phone` note — either way, both paths need coverage).
19. Phone: resend before the 60-second cooldown elapses → rejected/cooldown message; after cooldown elapses → succeeds and invalidates the prior OTP.
20. Phone: rate limit enforced per-user, independent-bucket-per-user (same BUG-003-class test as #12).
21. Privacy: `phone_number` never appears in `GET /api/users` (teammates-scoped) response, even for a verified number — explicit negative assertion, not just "not currently tested."
22. Authorization: every one of the six endpoints only ever operates on `req.user.userId`; a request attempting to reference another user's pending change/OTP (however that might be attempted, e.g. guessing another user's token) fails — most of this is already structurally guaranteed by the design (§7's authorization rule), but should be asserted directly, not assumed.
23. Enumeration resistance: `request-email-change` targeting an email already registered to someone else produces a response indistinguishable (same status, same generic message) from a malformed-email rejection.

**Frontend, focused:**
24. Renders "Change email" action instead of the static "coming in a future phase" caption.
25. Pending-change state renders the pending target address and resend/cancel actions.
26. Request form: client-side validation blocks obviously-malformed email before submit (UX only, server remains authoritative — matches avatar's established client/server split).
27. Success/error messaging matches the existing transient-banner pattern.
28. Phone section: unset → pending → verified state transitions render correctly; broken/never-arriving OTP doesn't hang the UI in a loading state indefinitely (matches the existing avatar broken-image-fallback principle of "never a silent infinite-loading dead end").
29. Resend button respects cooldown (disabled state, matches existing disabled-during-upload UX pattern).

---

## 11. THREAT MODEL

| Threat | Mitigation (design decision from this document) |
|---|---|
| **Account takeover via email change** | Verification link sent to the *new* address, not usable until proven reachable (§2.2 step 4); old email notified at request time, not just completion (§3.2); current-password confirmation required to even initiate a change (§3.4); all sessions revoked on completion (§5.1) so a takeover-in-progress can't quietly persist a stolen session past the swap. |
| **Email-change hijacking** (attacker with a live session but not the password) | Current-password confirmation (§3.4) is the specific, direct mitigation — a stolen cookie/token alone is insufficient to initiate a change. |
| **Verification-token theft** (link intercepted in transit/logs) | Token stored only as a SHA-256 hash at rest (§2.3, matching existing convention); raw token never logged (matching the existing Milestone-11 precedent for verification/reset tokens — `emailService.ts`'s explicit comment on why the URL is never placed in the loggable `metadata` field); 1-hour expiry bounds the exploitable window; one-time-use (§2.4) means even a successfully intercepted-and-used link can't be reused by the real owner *or* the attacker a second time. |
| **OTP brute force** (6-digit space is only 1,000,000 possibilities) | 5-attempt ceiling per issued OTP (§4.6) is the primary defense — this bounds worst-case brute-force success probability to 5/1,000,000 per issued code, not "unlimited guesses within the 10-minute window." Per-user rate limiting on the verify endpoint (§4.8) is a secondary backstop. |
| **Replay** (email token or phone OTP reused after consumption) | Both are cleared from storage immediately on successful use (§2.4, §4.6-adjacent) — a consumed credential of either kind cannot be presented again, full stop, not merely discouraged. |
| **User enumeration** | `request-email-change`'s target-email-uniqueness check is the one **new** enumeration surface this feature introduces (§2.7) — mitigated by collapsing "already in use" into the same generic error shape as other validation failures, rather than a distinct message. Every other new endpoint is either authenticated (caller already knows their own account exists — no enumeration question applies) or operates purely on a token/OTP the caller already possesses (nothing to enumerate). |
| **Spam/resend abuse** | Per-user hourly rate limits on both request and resend for both channels (§2.6, §4.8); an additional 60-second hard cooldown specifically for phone resend (§4.7), which SMS's real per-message cost makes more urgent to contain than email's. |
| **Race conditions** (concurrent requests) | Single-pending-slot design (§2.5) means a race resolves to "last write wins," which is a safe, well-defined outcome for a feature where the user only ever intends one change at a time — matches the codebase's existing accepted risk tolerance for the structurally identical `register()` duplicate-email race (§3.5). |
| **CSRF** | No new CSRF surface — every proposed endpoint sits behind the existing `authenticate` middleware (for the five authenticated ones) or is a token-bearing unauthenticated endpoint whose token itself is the unguessable credential (`verify-email-change`, matching the existing unauthenticated `verify-email`/`reset-password` endpoints' own threat model, which the codebase already accepts as sufficient — a CSRF-forged request to a token-bearing endpoint can't succeed without also knowing the private, unguessable token, which is not something a forged cross-site request can supply). Cookie-authenticated state-changing requests to the five authenticated endpoints get the existing double-submit CSRF check automatically, for free, via `authenticate()`'s existing logic (§1.7 area, `csrfTokenMatches`) — no new CSRF code needed. |
| **Leaked verification URLs** (e.g., via browser history, shared screenshots, referrer headers) | Same mitigations as token theft above (hash-at-rest, short expiry, one-time-use) — a leaked URL is functionally identical to a stolen token from the system's perspective, and is bounded the same way. |
| **Privileged/admin bypass** | No admin-override endpoint is proposed anywhere in this design (§7's table is exhaustive) — there is no "admin force-verifies a user's email/phone" path to audit, because none is proposed. If a future need for one arises, it is explicitly **not** part of Phase 4 as designed here and would need its own dedicated authorization review. |

---

## 12. DEPENDENCIES / BLOCKERS

- **No new backend npm dependency is strictly required for email-change verification** — every primitive (`generateOpaqueToken`, `hashToken`, the `EmailProvider` abstraction, the rate-limit provider pattern, the notification system) already exists in the codebase today.
- **Phone verification requires at least one new dependency**: a phone-number normalization/validation library (e.g. `libphonenumber-js`) is effectively required for §4.2's E.164 normalization to be done correctly rather than with ad-hoc regex.
- **A real SMS-sending capability is an explicit, unresolved dependency.** No `SmsProvider` abstraction exists today (§1.6). Before phone verification can be *implemented* (not just designed), either (a) a new provider abstraction + a real SMS vendor integration (e.g. Twilio) must be added, mirroring the existing `EmailProvider` pattern, or (b) a deliberate, explicit product decision to route phone OTPs through email instead of real SMS for an initial version — this document does not choose between these options; it flags the choice as a blocker requiring product/ops sign-off (and, if a real SMS vendor is chosen, a cost/vendor-account setup dependency outside this codebase entirely).
- **Real email delivery in production is an operational dependency, not a code one** (§1.6) — `EMAIL_PROVIDER` must be verified as actually configured to `resend` or `smtp` in the deployed environment before email-change verification can be considered functionally complete in production, even though the code-level capability already exists. This audit does not verify that configuration (out of reach from source alone) and does not claim it is already true.
- **`is_verified` must be added to the `GET /api/users/me` response** (§1.3) before any frontend verification-status UI can render — a small, low-risk prerequisite change, but a real one, and a blocker for the UX proposed in §8's "Verified email" badge.

---

## 13. RECOMMENDED IMPLEMENTATION ORDER FOR PHASE 4

1. **Database migration** (§6): add all nine proposed columns to `users`, mirrored into `database/schema.sql` in the same change (per the established, twice-precedented requirement — §6.3).
2. **Expose `is_verified` on `GET /api/users/me`** (§1.3, §12) — smallest possible standalone change, unblocks frontend badge work early and independently of everything else.
3. **Email-change backend**: `request-email-change`, `resend-email-change-verification`, `verify-email-change` (§7) — including the new rate limiter (§2.6, applied correctly *after* `authenticate` from the start, learning directly from BUG-003 rather than repeating it), the two new notification categories (§9), and the `email_changed_at` session-invalidation check added to `authenticate()` (§5.1).
4. **Email-change backend tests** (§10, items 1–15) — written and passing before frontend work begins, matching this codebase's established backend-then-frontend verification order for every prior Profile phase.
5. **Email-change frontend** (§8's relevant states) + focused frontend tests (§10, items 24–27).
6. **Phone verification dependency resolution** (§12) — the SMS-provider decision must be made *before* step 7 can be considered complete, not deferred silently into it.
7. **Phone verification backend**: normalization library integration, OTP generation/hashing/attempt-tracking, the three phone endpoints (§7), rate limiting (§4.8), notification (§9).
8. **Phone verification backend tests** (§10, items 16–23).
9. **Phone verification frontend** (§8's phone section) + focused frontend tests (§10, items 28–29).
10. **Full verification pass**: focused suites for both halves, full backend suite once, full frontend suite once, backend/frontend TypeScript, backend/frontend production builds — matching the exact verification discipline already established for Phases 2 and 3.
11. **Documentation reconciliation**: mark Phase 4 COMPLETE in `COMMANDCENTER_TASK_STATE.md`/`COMMANDCENTER_PRODUCT_ROADMAP.md` only after step 10 is genuinely green, per the same "do not overclaim" discipline this audit itself follows.

Steps 3–5 (email) and 6–9 (phone) are largely independent of each other and could be reordered or interleaved by whoever implements Phase 4; they are presented sequentially here only for clarity, not as a hard dependency chain between the two halves. The one true hard ordering constraint is **1 → 2 → (3 or 6)**: the schema must exist before any endpoint can be built against it, and exposing `is_verified` is cheap enough to do immediately rather than bundling it into a larger change.

---

## AUDIT COMPLETE

This document is architecture and threat-model analysis only. No route, migration, schema change, UI change, or dependency was added to the repository as part of producing it. Implementation begins only on explicit direction, following the order in §13.
