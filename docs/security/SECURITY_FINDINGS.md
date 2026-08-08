# Security Findings & Lessons Learned

A living checklist of vulnerability classes found in this project, organized by
class rather than by date. Each entry is meant to be directly reusable on a
future project: "does my new code have this shape? Then it probably has this
bug too."

When a new class of finding is fixed, add a section here. Don't just log what
happened — extract the general pattern and the checklist question that would
have caught it earlier.

---

## 1. Persisted-but-unenforced settings

**Pattern:** A user-facing setting is correctly validated, persisted, and
returned by its own read/write endpoints — but nothing in the rest of the
codebase actually reads it at the point where it's supposed to change
behavior. The feature *looks* complete (round-trips correctly, has tests for
the round-trip) while doing nothing.

**Root cause:** The persistence layer and the enforcement points are owned by
different modules, added in different milestones. Fixing persistence (a
visible bug — the setting doesn't stick) gets a milestone; enforcement (an
invisible bug — the setting sticks but is ignored) can pass unnoticed
indefinitely, because every test written against the setting's own module
only exercises its own read/write path.

**How it was detected:** Milestone 28 fixed `privacy_settings` not
persisting. Milestone 31's adversarial audit asked, for every setting,
"where in the codebase is this actually *read* outside of its own
get/update handlers?" — a repo-wide grep for `ai_enabled` and
`leaderboard_visible` outside `privacy.service.ts` found zero hits. The
setting was a no-op everywhere it mattered.

**Fix pattern:** One reusable helper (`privacyService.isAiEnabledForUser`)
consulted at every real entry point that the setting is supposed to gate,
rather than re-deriving the check per call site. For an aggregate/list
endpoint (leaderboard), filter the *returned* data, not the query that also
drives other side effects (see §3 below).

**Reusable checklist question:** *For every boolean/enum setting a user can
toggle, list every code path whose behavior the setting name implies it
should change. Grep for the setting's key outside its own module. If the
only hits are the get/update handlers themselves, the setting is decorative.*

---

## 2. Cross-reference fields validated against the wrong resource

**Pattern:** An update endpoint correctly checks the caller's access to the
resource being *modified*, but a field in the update body references a
*different* resource (another team, another goal, another parent), and
nothing checks the caller's access to *that* resource.

**Root cause:** `canWrite<Resource>(userId, resourceId)`-style checks are
naturally written against `req.params.resourceId` — the URL, not the body.
A cross-reference field hiding in `req.body` is easy to miss because the
existing authorization middleware already "looks like" it covers the
endpoint.

**How it was detected:** First found in Milestone 29 (`projects.team_id`),
then found again in Milestone 30 (`goals.parent_goal_id`) after being
specifically asked to check whether the same shape recurred, then a third
time in Milestone 31 (`teams.parent_team_id`) once auditing started
explicitly searching for the pattern across every module rather than
waiting to trip over it.

**Fix pattern:** Whenever an update body can carry an ID that references
another resource of the same type as the one being written, re-run the same
`canWrite`/`requireTeamRoleIfSpecified`-style check against *that* ID before
the write, not just the resource in the URL.

**Reusable checklist question:** *For every update DTO, list every field
whose value is itself a foreign-key-shaped ID (not just the literal `team_id`
name — `parent_X_id`, `X_id` pointing at the same or a related table). For
each one, is the caller's access to the pointed-to resource checked
anywhere?*

---

## 3. A query serving two purposes silently couples an unrelated fix to a side effect

**Pattern:** One query/result set is reused for two different jobs (e.g.
"compute the leaderboard" and "bulk-refresh everyone's stored score"). A
fix aimed at one job (hide opted-out users from the leaderboard) that
filters at the query layer would have also silently broken the other job
(their score stops being refreshed) — a regression with no test failure to
catch it, because no existing test asserted the score-refresh side effect
for a user who'd also become invisible.

**How it was detected:** Caught during implementation review before coding,
by reading the existing code comment that explicitly said the bulk update
runs "including updating users who get filtered out below" — i.e. a prior
author had already hit and documented this exact coupling for a different
filter (`recent_activity > 0`). Reading existing comments near the change,
not just the function being modified, is what surfaced it.

**Fix pattern:** Compute everything the shared query needs to compute in
full (don't filter the query itself), run every side effect against the
full result set, and apply the display/visibility filter only at the very
last step, on the returned payload.

**Reusable checklist question:** *Before adding a filter to an existing
query or its result set, find every consumer of that query's output. Does
any consumer need the "filtered-out" rows for something other than
display?*

---

## 4. TOCTOU in check-then-act authorization

**Pattern:** A hierarchy or ownership check (`getRole` / `getMemberRole`)
is a separate read from the write that follows it, with no transaction or
row lock between them. Two concurrent requests can both pass the check
against the same pre-mutation state before either write commits.

**Status:** Identified (Milestone 31), not yet fixed as of this writing —
tracked as a real, reachable finding (`removeMember`/`updateMemberRole` in
`teams.service.ts`), not a resolved lesson. Recorded here so the fix
pattern is known when it's scheduled: wrap the read + write in a
transaction (or use `SELECT ... FOR UPDATE`) so the hierarchy check and the
mutation it gates observe a consistent snapshot.

**Reusable checklist question:** *For every `check-then-act` authorization
pattern (read a role/state, branch, then mutate), could two concurrent
requests both pass the read before either mutation commits? If so, is
there a DB-level constraint (unique index, as used for M24/M25) that makes
the outcome safe regardless of ordering — or does it need an explicit
transaction/lock?*

---

## 5. Raw database errors reaching the client as generic 500s

**Pattern:** A Postgres error code (unique violation `23505`, foreign key
violation `23503`, invalid input syntax `22P02`) is not translated into a
domain-specific 4xx error, so it surfaces as an opaque 500 — technically not
a data leak (the global error handler in this project has always redacted
error detail from responses), but a reliability and API-quality gap, and it
means the *first* time this is discovered is often a confused bug report
rather than a test.

**Fix pattern applied so far:** Case-by-case, in the repository/service
layer closest to the query (e.g. `logs.service.ts` translates `23505` into
`BadRequestError('Log already submitted for today')`).

**Reusable lesson (not yet acted on):** A one-time, centralized
Postgres-error-code → `AppError` translation layer (in the DB client
wrapper) would close this whole class in one place instead of requiring a
bespoke fix per endpoint per milestone. Recommended, not yet built.

---

## 6. Unthrottled sensitive endpoints (rate-limit coverage gaps)

**Vulnerability class:** An endpoint that triggers a real side effect
(sends an email, validates a security-sensitive token, issues new
credentials) has no rate limiter at all, while functionally similar
endpoints in the same module do. The gap isn't "rate limiting doesn't
exist here" — it's "the team already built and uses a rate-limiting
abstraction, and just didn't apply it to every endpoint that needed it."

**Affected endpoint types (this project):** `POST /api/auth/resend-verification`
(triggers a real email send), `POST /api/auth/reset-password` (validates
a security token — the actual attack surface for token-guessing),
`POST /api/auth/refresh` (issues new credentials from a presented token).
All three sat unthrottled next to `login`/`register`/`forgot-password`,
which had been rate-limited since Milestone 7.

**Root cause:** Rate limiting got added to the endpoints that existed
*when the limiter was built* (Milestone 7's three routes), and never got
revisited as new auth-adjacent endpoints were added in later milestones.
No structural check (a test, a lint rule, a route-registration
convention) enforces "every route under `/api/auth/*` must pass through
some rate limiter" — it's opt-in per route, so it's exactly as complete
as whoever wired up the last route remembered to make it.

**Exploitation/abuse scenario:** `resend-verification` — loop it with a
known email for unlimited mail-bombing (cost/deliverability abuse), and
because M26 already made it return an identical generic response
regardless of account state, the response itself gives no signal to stop
early — nothing else did either, until now. `reset-password` — loop it
with guessed tokens; since the actual secret being brute-forced is the
token, not a login credential, this is a directly guessable-secret attack
with no throttle. `refresh` — loop it with guessed/stolen refresh tokens
for credential-stuffing-style probing.

**Mitigation:** Reused the *existing* `RateLimitProvider` abstraction —
no new limiter system, no new dependency. Two of the three endpoints
(`resend-verification`, which has an email in its body; `reset-password`,
which doesn't) were simply added to the existing `createAuthLimiter()`
wiring — the same IP+email key gracefully degrades to IP-only when there's
no email field, which is *correct* here (there's no account to key on
before a token is verified). The third (`refresh`) got its own new method
on the same interface, because its abuse profile is genuinely different:
it's called automatically and frequently by every legitimate session
(roughly once per access-token TTL), so the login limiter's threshold
(tuned for infrequent human guessing) would false-positive normal usage.
The lesson isn't "always reuse the exact same limiter" — it's "reuse the
*abstraction*, and pick the specific configuration each endpoint's real
traffic pattern calls for."

**Testing strategy:** For each endpoint: (1) requests under the threshold
succeed normally, (2) the request that crosses the threshold gets a 429,
(3) a different key (different email, or nothing distinguishing it from
IP alone) isn't affected, (4) the 429 response is generic enough not to
leak account existence, and — the check that actually matters most for a
security fix, not just a rate-limit fix — (5) a 429'd request must be
proven to have **never reached the underlying service logic**: capture
the relevant DB state (a token hash, a revoked-at timestamp) before and
after the rejected request and assert it's unchanged. A rate limiter that
still lets the blocked request's side effect through is not a fix. For
window-reset behavior, don't wait out a real 15-minute window in a test —
build a tiny standalone app using the identical underlying library call
with a short window instead; it validates the same mechanism without a
slow or flaky test.

**Reusable checklist question:** *List every route in a security-sensitive
module (auth, payments, account recovery). For each one: does it send an
email, validate a bearer/reset/invite token, or issue new credentials? If
yes to any of those and there's no rate limiter on it, that's this class
of bug — and check whether an existing limiter's config actually fits
this endpoint's real traffic pattern, or whether it needs its own.*

---

## 7. AI/expensive-provider endpoint cost & DoS protection

**Vulnerability class:** An endpoint that calls out to a paid or
compute-heavy external provider (an LLM, an image-generation API, any
per-call-billed service) has no rate limit, while a *different* endpoint
calling the exact same provider does. The unprotected endpoint isn't
obviously "AI-shaped" from its name (`/projects/analyze` doesn't sound
like an AI feature the way `/ai/chat` does), which is exactly why it gets
missed when someone rate-limits "the AI feature."

**Root cause:** Rate limiting got attached to the one endpoint whose name
and purpose screamed "this calls an AI provider directly" (M22's
`/api/ai/chat`), not to every code path that actually does. `analyzeLog`,
`analyzeBlocker`, `generateMentorAdvice`, `generateLogSuggestions`,
`generateProductivityInsights`, `generateStandup`, and
`analyzeProjectWithAI` all funnel through the same `ai.service.ts` →
`callAI()` → `getAIProvider().generateCompletion()` chain M22's chat
limiter was built for — but most of those only ever run as a side effect
of creating/reading a normal resource (a log, a blocker), which already
has its own natural rate limit (you can only create so many logs).
`/projects/analyze` was the one exception: like chat, it's a bare,
repeatable, no-side-effect call into the AI provider with nothing else
gating its frequency.

**Abuse scenario:** Loop `POST /projects/analyze` with a valid session —
each call is a full LLM completion request with no cap, functionally
identical to hammering `/api/ai/chat` before M22, just under a different
route name that doesn't obviously read as "the AI endpoint."

**Mitigation:** Reused `createApiLimiter()` (the same method, not a copy
of it) at this second call site. Because `createApiLimiter()` constructs
a brand-new `rateLimit()` instance (its own closure-captured store) every
time it's called, wiring it independently into `projects.routes.ts` gives
this route its own separate 20-per-5-minutes budget — it does not share
or drain the chat endpoint's budget, and vice versa. No new limiter
method was needed here (contrast with Milestone 33's `refresh`, which
*did* need its own method because its legitimate traffic pattern
genuinely differs from login's) — the right question each time is "does
this endpoint's abuse profile match an existing limiter's design intent,"
not "is this endpoint in the same module as one that already has a
limiter."

**Rate-limit placement:** After `authenticate` (so the per-user key has
`req.user` available, and so authenticate's own CSRF check for
cookie-authenticated requests has already run) and before `validate`/the
controller (so a request that's already over budget is rejected before
it can reach the AI provider — verified by asserting the provider mock's
call count stops incrementing exactly at the threshold, not just that a
429 comes back).

**Interaction with privacy controls:** The Milestone 32 `ai_enabled`
check lives inside the *service* layer (`projectsService.analyzeProject`),
strictly downstream of the rate limiter. This ordering matters both ways:
a user who has disabled AI never reaches the provider regardless of how
far under their rate-limit budget they are (privacy wins even when
quota is available), and a user who is over their rate limit is rejected
before the privacy check or the service ever runs at all (the limiter is
the outermost gate). Neither control can be used to route around the
other.

**Testing strategy:** Mock the provider (`jest.spyOn(GroqProvider.prototype,
'generateCompletion')`) — never let tests make a real paid call. Assert,
for the same endpoint: (1) a request under the limit both succeeds *and*
increments the provider call count by exactly one — status alone doesn't
prove the provider ran; (2) the request that crosses the threshold gets a
429 *and* the provider call count does not increment past where it was;
(3) a different user's budget and a different route's budget (chat vs.
analyze) are both unaffected; (4) `ai_enabled=false` blocks the provider
call even on the very first request, well inside the rate-limit budget;
(5) unauthenticated and CSRF-invalid requests are rejected before the
limiter or the provider is ever reached.

**Reusable checklist question:** *Grep for every call site of your AI/
expensive-provider client function (not just the routes with "ai" in the
name). For each call site: does it run as a side effect of creating a
resource that already has its own natural rate limit, or is it a bare,
repeatable, no-side-effect call a client can loop directly? Every
endpoint in the second category needs its own rate-limit wiring — reusing
an existing limiter *method* where the abuse profile genuinely matches,
not inventing a new one just because the module already has some
protection somewhere.*

---

## How to use this document

- Add a new numbered section per *vulnerability class*, not per milestone —
  if a class recurs, add evidence to its existing section instead of
  duplicating it.
- Every section should end with a **reusable checklist question** phrased so
  it can be asked cold, on a different codebase, without this project's
  context.
- This file is a checklist, not a changelog — `git log` is the changelog.
