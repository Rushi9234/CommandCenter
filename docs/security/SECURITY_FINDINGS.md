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

## 4. TOCTOU in check-then-act authorization (stale authorization decision)

**Pattern:** A hierarchy or ownership check (`getRole` / `getMemberRole`)
is a separate read from the write that follows it, with no transaction or
row lock between them. Two concurrent requests can both pass the check
against the same pre-mutation state before either write commits — the
authorization *decision* was correct for the state it observed, but that
state was stale by the time the *mutation* actually executed.

**Status: fixed (Milestone 36).** Identified in Milestone 31
(`removeMember`/`updateMemberRole` in `teams.service.ts`; the same shape
was also found in `addMember` during the M36 audit and fixed alongside
the other two, since it shares the identical read-then-write gap and the
identical security invariant).

**Database-level atomicity — the fix pattern:** Collapse the "read
current state, decide in application code, write" sequence into a
single SQL statement whose `WHERE` clause encodes the authorization
condition directly, instead of a separate `SELECT` followed by a separate
`UPDATE`/`DELETE`. Concretely, for `removeMember`:

```sql
-- Before (two statements, a gap in between):
SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2;
-- ...decide in JS...
DELETE FROM team_members WHERE team_id = $1 AND user_id = $2;

-- After (one statement, no gap):
DELETE FROM team_members
WHERE team_id = $1 AND user_id = $2
  AND role != 'owner'
  AND (role != 'admin' OR $3 = 'owner')  -- $3 = requester's role
RETURNING role;
```

This works without an explicit `BEGIN`/`COMMIT` or `SELECT ... FOR
UPDATE` because Postgres already takes an implicit row lock as part of
finding and mutating the rows a single `UPDATE`/`DELETE` statement
matches — there is no window between "check" and "act" because they are
literally the same statement. A concurrent transaction that changes the
same row is either fully committed before this statement's `WHERE` is
evaluated (so the check sees the new state) or blocks until this
statement finishes (so it, in turn, sees this statement's result) —
either ordering is safe. The same technique extends to an upsert: Postgres
supports a `WHERE` clause on `ON CONFLICT ... DO UPDATE`, so `addMember`'s
upsert path got the identical guard with no separate statement at all
(`addTeamMemberIfAuthorized`, `teams.repository.ts`).

**Distinguishing "blocked by the authorization condition" from "target
doesn't exist":** Both cases return zero affected rows from the
conditional statement, and the caller needs different behavior for each
(a specific `ForbiddenError` message vs. a silent no-op, matching prior
behavior for "target isn't a member"). The fix uses a follow-up plain
read (`getMemberRole`) *only* to select the right error message — never
to gate the mutation, which already happened atomically in the
conditional statement above. A stale read at that point can produce a
slightly imprecise error message in a vanishingly rare edge case; it
cannot reopen the security hole, because the mutation already committed
or was already blocked before that read ever runs.

**Concurrency testing strategy:** A fix that closes a TOCTOU race removes
the very race window a test would otherwise exploit to prove the bug
existed — there's no longer a gap in application code to inject a delay
into. Two complementary strategies were used instead:
1. **Deterministic barrier via a held transaction lock** — open a raw
   `pgPool.connect()` client, `BEGIN`, run the conflicting `UPDATE`
   *without committing*, then call the atomic repository method under
   test. Postgres physically blocks that call until the held transaction
   commits or rolls back — this is a guaranteed lock-wait, not a timing
   hope. Committing then lets the blocked statement proceed and
   re-evaluate its `WHERE` against the now-current (committed) state,
   which a correct fix must reject. A short delay before committing only
   ensures the blocked query has reached Postgres before the lock is
   released; it is not what makes the test's assertion valid — the lock
   itself is.
2. **Realistic concurrent HTTP requests via `Promise.all`** — fire both
   real requests at once and assert the invariant holds *regardless of
   which one Postgres actually serialized first*, by checking the final
   database state and branching the assertion on it, rather than
   asserting one specific ordering must occur. A true race has more than
   one valid outcome; the test must accept every valid one and reject
   every invalid one, not assume a single expected order.

**Reusable checklist question:** *For every `check-then-act` authorization
pattern (read a role/state, branch in application code, then mutate),
could two concurrent requests both pass the read before either mutation
commits? If so: can the check be folded into the mutating statement's
`WHERE` clause (or an `ON CONFLICT ... DO UPDATE ... WHERE` guard for an
upsert) so the database enforces it atomically? If a bare DB constraint
(unique index, as used for M24/M25) already makes the outcome safe
regardless of ordering, that's sufficient and no additional guard is
needed — reach for the conditional-statement pattern only when the
invariant is genuinely about *who* is allowed to act, not just about
preventing a duplicate.*

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

## 8. Generic/unbounded update schemas (`z.record(z.any())`)

**Vulnerability class:** An update endpoint's request-body schema accepts
*any* key with *any* value (`z.record(z.string(), z.any())`), so the only
thing standing between a client and the repository's raw
`UPDATABLE_COLUMNS` allowlist is whatever the *service* layer happens to
special-case. Every column in that allowlist the service doesn't
explicitly intercept is fully client-writable, with no type check, no
range check, and no distinction between "this is a normal editable field"
and "this is metadata the server is supposed to own."

**Root cause:** The schema was written once, when the update endpoint was
first built, as "accept whatever the repository's allowlist accepts" —
a shortcut that made sense when the allowlist was small and every column
on it really was client-editable. As the table grew columns for
server-derived data (a resolution timestamp, an AI-generated suggestion
list, a completion timestamp), those new columns landed in the
*repository's* allowlist (they still need to be written by the server
via the same `buildSetClause` path) but nobody went back and asked
whether the *schema* should keep accepting them from a client body too.
The schema and the allowlist drifted apart — the allowlist tracks "what
this SQL statement is capable of setting," the schema should track "what
a client is allowed to ask for," and only the second one was frozen in
`z.any()` while the first kept growing.

**Affected classes of fields, and why each is dangerous specifically:**
- **Server-derived timestamps** (`completed_at`, `resolved_at`): freely
  settable to any date, independent of the state transition that's
  supposed to produce them. Lets a client fabricate history (a task that
  "completed" in the past, a blocker "resolved" before it was ever
  touched) with no correctness signal anywhere that anything is wrong.
- **Server-derived identity** (`resolved_by`): whoever resolves something
  should be the caller, not whoever the caller names. Before this class
  of fix, `resolved_by` was *usually* set correctly (when the request
  also flipped `status` to the resolved value) but fell through to the
  raw client value the moment the request touched `resolved_by` without
  also completing the transition in the same call — a conditional
  override is not the same thing as the field being unwritable.
- **AI/system-generated metadata** (`ai_suggestions`, `similar_blockers`,
  `suggested_helpers`): populated once at creation by server-side logic,
  never meant to be touched again — but present in the same
  `UPDATABLE_COLUMNS` allowlist as genuinely editable fields, so an
  unrestricted schema exposed them for a client to simply overwrite with
  fabricated values.
- **Unbounded numeric/enum fields** (`progress`, `status`, `priority`,
  `goal_type`, `blocker_type`): no upper/lower bound, no restriction to
  the values the rest of the application actually understands. A
  malformed value doesn't fail loudly — it gets stored and silently
  breaks whatever code assumed the field could only hold one of a known
  set (aggregate math, UI color-mapping, business logic branches).
- **Cross-reference fields already covered by [Section 2](#2-cross-reference-fields-validated-against-the-wrong-resource):**
  `team_id`, `parent_goal_id`, `parent_team_id` need the destination-
  resource authorization check *in addition to* the type check this
  section is about — fixing the schema alone (adding a UUID format
  check) is necessary but not sufficient; the two problems are related
  but distinct, and this audit found one more instance of the
  cross-reference gap (`teams.parent_team_id`, PUT
  `/teams/:teamId/settings`) that had never been closed.

**Server-controlled field protection:** The fix is not "reject the
request if it contains a server-controlled field name" — it's "don't
list it in the schema at all." Because the validation middleware
(`common/middleware/validate.ts`) replaces `req.body` with the *parsed*
result of `schema.safeParse(...)`, and a plain Zod object schema silently
strips any key it doesn't recognize (verified directly against the
installed Zod version, not assumed), a field that was never named in the
schema simply never reaches the service or repository — no error, no
special-case code, nothing to remember to keep doing correctly. The
service layer then derives the real value itself, unconditionally, from
the fields that *are* legitimate — not "override the client's value if
it looks wrong," but "the client's value for this field never existed in
the first place."

**State consistency protection:** For every server-derived
timestamp/identity field, the fix is symmetric: setting it when the
triggering state transition happens, *and* clearing it when the state
transition reverses. A goal/task marked complete gets `completed_at` set
to now; moving it to any other status clears `completed_at` back to
null. A blocker resolved gets `resolved_by`/`resolved_at` set to the
actual caller and now; reopening it clears both. Fixing only the
"set on completion" half and leaving the "clear on reopen" half undone
would still leave a reopened item carrying a stale, misleading timestamp
from its previous completion — a subtler version of the same
"contradictory state" bug the client-writable version had, just harder
to trigger.

**Authorization interaction:** Hardening the schema does not replace or
weaken the route/service-level authorization checks (role middleware,
`canWrite*` ownership checks, the M29/M30/M35 destination-resource
checks) — it closes a *different* gap one layer down. A request can be
fully authorized to update a resource and still have no business setting
`resolved_by` to someone else, or `completed_at` to an arbitrary date.
Schema hardening and authorization are complementary, independently
necessary checks, not substitutes for each other; both must remain
intact and were both re-verified (not just the new one) in this
milestone's regression pass.

**Negative-test strategy:** For every hardened field, prove absence of
effect, not just presence of an error code. A malformed/out-of-range
value should get a 400 *and* leave the row unchanged (re-query the DB,
don't infer from the response). A server-controlled field sent alongside
an otherwise-valid update should NOT error the whole request — the rest
of the update should still succeed, and the server-controlled field's
real, derived value (not the client's attempted value) is what ends up
in the row. An unauthorized caller's attempt should 403 *and* leave the
row unchanged, same as an unauthorized request always should.

**Reusable checklist question:** *For every `z.record`/`z.any()` update
schema: list every column in the corresponding repository's
`UPDATABLE_COLUMNS` allowlist. For each column, ask (a) is this
legitimately client-editable at all, (b) what type/format/range should
it be restricted to, (c) is it actually server-derived and should not
appear in the schema at all, (d) does changing it require a check on
some OTHER resource it references, and (e) does changing it require a
COUPLED field (a timestamp, an identity) to change in the same request.
If the allowlist and the schema were both looked at only once, at
different times, assume they've drifted — verify column-by-column
instead of trusting either one.*

---

## 9. Hierarchical/relationship resource authorization at read boundaries

**Vulnerability class:** A resource that exposes *another* resource's
metadata through a parent/child (or any owns-a/references-a)
relationship — "give me team X's sub-teams," "give me project Y's
tasks" — has write-side authorization (can you *create* or *modify* the
relationship) but no read-side authorization (can you *view* it). The
write path was hardened; the read path exposing the same relationship
was not, and the two are easy to treat as one problem when they are
actually two separate gates.

**Root cause:** The route's own comment documented the intended rule
correctly — "membership only, no role tier required," grouping this
endpoint with a sibling endpoint that *does* enforce it — but the
middleware for this specific route was never added. A sibling read
endpoint for the exact same parent resource had the correct guard
(`requireTeamMembership`); this one had only `authenticate`. The gap
wasn't a missing concept, it was one route in a list of routes that
didn't get the line of middleware its own neighbor already had.

**Private vs. public/discoverable resources — these are different
questions:** This codebase already has a "browse public resources you
are not a member of" feature (`is_public`/`is_discoverable`, used by the
general team-search/listing endpoints) — that feature deliberately has
no membership requirement, by design, for a *different* query shape
("what teams exist that I could join"). A hierarchy-specific endpoint
("what are THIS team's sub-teams") is answering a different question —
"show me this specific resource's internal structure" — and defaulting
it to the discoverability rule would let anyone enumerate a private
team's sub-team relationships just by knowing its UUID, `is_public` or
not, since discoverability governs whether a team shows up in a listing,
not whether its relationships can be read once you already have (or
guessed) its ID. The correct rule for a hierarchy-read endpoint is the
same membership rule that already gates every other read of that
resource's internals (its member roster, in this codebase) — not the
discovery feature's rule, and not a new rule invented for the occasion.

**UUID/identifier enumeration:** Any endpoint keyed purely by a resource
ID with no ownership/membership check is enumerable — an attacker
doesn't need to guess a real UUID by brute force (infeasible); they only
need ONE real ID (their own team, a team they were once a member of, one
leaked in a URL) to start walking relationships outward from it with no
further authorization at any hop, unless every hop re-checks membership
independently. A parent/child relationship being valid and correctly
authorized on the *write* side (Milestone 35's `parent_team_id`
destination check) says nothing about whether *reading* that
relationship is authorized — those are independent checks and both must
exist.

**Authorization at read boundaries — the fix pattern:** Add the same
membership middleware the sibling endpoint for the same parent resource
already uses, at the route level, so the check runs before the
controller/service/repository ever executes — not a filter applied to
the response afterward. The service method itself needs no change if
the codebase's convention is "middleware is the sole gate, the service
trusts it ran" (true here, matching the existing `getTeamMembers`
pattern) — verify that convention holds before relying on it silently.

**Reusable checklist question:** *For every endpoint that reads a
resource's relationships to another resource (parent/child, owner/owned,
member/team), find the sibling endpoint that reads a DIFFERENT aspect of
the SAME parent resource (its member list, its settings, its own
detail view). Does it have an authorization middleware this one is
missing? If a route's own code comment states an intended rule ("X
only"), grep for whether every route the comment covers actually has the
middleware that enforces it — a comment describing intended behavior for
multiple routes is not proof all of them received it. Separately: does
this resource have an `is_public`/discoverable-style feature? If so,
confirm that feature's relaxed rule is answering a genuinely different
question ("what can I discover") than this endpoint ("what does this
specific, already-identified resource contain") before reusing it here.*

---

## 10. Authentication/session security model

Unlike the sections above (each one a single vulnerability class), this
section documents the *whole* credential lifecycle as a system, because
the individual pieces (JWTs, refresh tokens, password reset) only make
sense evaluated together — a fix to one that ignores how the others
behave is how the M31 finding in this section existed for as long as it
did.

**Credential lifecycle (as of Milestone 38):**

| Token | Format | Lifetime | Transport | Verified how | Revoked by logout? | Revoked by password reset? |
|---|---|---|---|---|---|---|
| Legacy bearer JWT | signed JWT (`{userId, role, iat, exp}`) | 7 days | `Authorization: Bearer` header | `jwt.verify` + `password_changed_at` check (M38) | No (stateless, expires on its own) | Yes, as of M38 (`iat` predates the reset) |
| Short-lived access JWT | signed JWT (same payload shape) | 15 minutes | `access_token` httpOnly cookie | Same as above | No (stateless, expires on its own) | Yes, as of M38 |
| Refresh token | opaque random value, only its SHA-256 hash stored | 30 days | `refresh_token` httpOnly cookie (scoped to `/api/auth`), or request body | DB row lookup (`revoked_at IS NULL AND expires_at > now`) | Yes (single-token revoke) | Yes (all-tokens revoke, unchanged since before M38) |
| Email verification token | opaque random value, hash stored | 24 hours | one-time link | DB row lookup + expiry | N/A (single-use, cleared after verification) | N/A |
| Password reset token | opaque random value, hash stored | 1 hour | one-time link | DB row lookup + expiry | N/A (single-use, cleared after reset) | N/A |

**JWT/session revocation model — the gap and the fix:** Both JWT types
are otherwise pure bearer tokens — `middleware/auth.ts`'s `authenticate()`
used to do nothing but `jwt.verify` and trust the result for the token's
entire remaining lifetime, with zero server-side state check. That's a
deliberate, reasonable tradeoff for *most* JWT use (no DB hit per
request) right up until the moment you need to revoke one before it
naturally expires — which is exactly what "a password reset means every
existing session should end" requires, and a pure bearer token
architecturally cannot do on its own.

The fix (a per-user `password_changed_at` timestamp, compared against
the JWT's own `iat` claim) is the standard, minimal way to add
revocation to an otherwise-stateless token without a full session store
or a blocklist: one nullable column, no change to how tokens are signed,
and exactly one narrow (single-column, primary-key) DB lookup added to
the one place — `authenticate()` — that already gates every protected
route. It intentionally does NOT invalidate anything for a user who has
never reset their password (`password_changed_at` stays `NULL`), so
shipping this fix doesn't force a logout on every existing session the
moment the migration runs — only future resets gain the new guarantee.

**Refresh-token rotation — unchanged, re-verified:** Rotation (new
token issued, old one revoked in the same call), reuse detection
(a revoked/expired token's hash simply doesn't match `getValidRefreshToken`'s
`WHERE` clause, so replay after rotation is rejected the same way an
expired token is), and expiry were already correct before this
milestone and were not touched — re-verified with regression tests, not
assumed.

**Account enumeration + timing-oracle prevention (login):** Before this
milestone, `login()` short-circuited (no `bcrypt.compare` call) for both
a nonexistent email and an existing-but-unverified one, while a verified
account's password check always ran the full bcrypt cost — meaning a
fast response revealed "nonexistent or unverified" and a slow one
revealed "verified account" regardless of whether the password was even
right, and unverified accounts additionally got a distinct 403 +
message no other case produced. The fix: `bcrypt.compare` now runs
*exactly once* on every login attempt, against the real password hash if
the account exists or a fixed-cost dummy hash otherwise — so the
computational cost paid is the same regardless of which branch is taken
— and every failure case (nonexistent, unverified, wrong password)
throws the identical error (401, `"Invalid credentials"`). The real
reason is still logged server-side (unchanged monitoring value); it
never reaches the response. `resendVerification` (Milestone 26, already
anti-enumeration) remains the legitimate self-service path for a real
user who doesn't know they're unverified — normalizing login's failure
response doesn't remove their way to recover, it just stops that
information leaking to someone probing a *different* account.

**Password-reset atomicity:** The password update and the refresh-token
revocation used to be two separate statements with no transaction
between them — if the second failed after the first had already
committed (a transient error, a dropped connection), the new password
would take effect but old sessions (before M38: refresh tokens only;
as of M38: also any not-yet-expired JWT) would survive the reset meant
to end them. Both statements (now including the `password_changed_at`
update) run inside one `withTransaction` block — proven with a test that
forces a failure between two statements in the same pattern and confirms
the first one's effect rolls back, not just that the happy path works
once.

**Reusable security checklist:**
- *For any bearer/stateless token: if this token needs to be revocable
  before its natural expiry for even one legitimate reason (password
  reset, "log out everywhere," account suspension), does the
  verification path check ANY server-side state at all, or does
  `verify()` alone decide? If the latter, that token cannot currently be
  revoked early — decide whether that's acceptable, and if not, add the
  smallest state check that fixes it (a version/timestamp comparison,
  not necessarily a full session store).*
- *For any login-style endpoint with multiple distinct failure reasons
  (account doesn't exist, account not yet verified/active, wrong
  credential): do any of those reasons (a) return a different
  status/message, or (b) take a measurably different amount of
  computation? Either one is an oracle. Fix status/message by making
  every failure path throw the same error; fix timing by making every
  path pay the same fixed cost (a dummy comparison against a
  precomputed value with the same cost factor as the real one).*
- *For any multi-statement "this operation should end existing sessions"
  flow: if statement 2 fails after statement 1 already committed, does
  the system end up in a state where the visible effect (password
  changed) happened but the security effect (sessions ended) didn't? If
  yes, wrap both in a transaction — but verify the failure scenario is
  real (two statements, no transaction, a plausible failure point
  between them) before claiming one is needed.*

---

## How to use this document

- Add a new numbered section per *vulnerability class*, not per milestone —
  if a class recurs, add evidence to its existing section instead of
  duplicating it.
- Every section should end with a **reusable checklist question** phrased so
  it can be asked cold, on a different codebase, without this project's
  context.
- This file is a checklist, not a changelog — `git log` is the changelog.
