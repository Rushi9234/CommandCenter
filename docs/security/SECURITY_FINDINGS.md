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

## 11. Resource-reference fields validated for shape but not for membership, and privileged-action staleness

**Vulnerability class:** A field that references another resource by ID
(a task's `owner`/`reviewer`/`contributors`/`dependencies`) was validated
for *format* (Milestone 35: must be a well-formed UUID) but never for
*membership* — whether the referenced user actually belongs to the same
project/team, or the referenced task actually exists in the same project.
This is a sibling of [Section 2](#2-cross-reference-fields-validated-against-the-wrong-resource)
(which covers a field that points at a *different top-level resource*,
e.g. `team_id`) but distinct from it: here the field points at a
*member/sub-resource* of the very resource being written, so it's easy to
assume "the caller can write this task, therefore any ID they put in it is
fine" — the caller's own authorization says nothing about whether the
*referenced* ID is a legitimate participant.

**Root cause:** `updateTaskSchema`/`createTaskSchema` (M35) closed the
"is this a UUID at all" gap but stopped there — no query ever asked "is
this UUID a real user, and is that user actually on this project's team?"
or "is this UUID a real task, and is it in the same project?" A
well-formed but otherwise arbitrary UUID (a random value, another team's
real user, another project's real task) was accepted identically to a
legitimate one.

**Fix pattern — reuse the existing access predicate, don't invent a new
one:** `projectsRepository.canAccessProject(userId, projectId)` already
answers "is this user a legitimate participant in this project" for the
*caller's own* access gate. The same predicate, called with the
*referenced* user's ID instead of the caller's, answers the identical
question for `owner`/`reviewer`/`contributors` — a nonexistent or
random UUID can never match its join, so existence and membership close
in one check with no new authorization concept. Deliberately
`canAccessProject` (any role, including viewer), not `canWriteProject` —
being *referenced* as an owner/reviewer/contributor is a membership fact,
not a write-permission fact, and even a viewer can legitimately be a
project's stated point of contact in this product's model. For
`dependencies`, a new `tasksRepository.tasksExistInProject(taskIds,
projectId)` proves existence and same-project-scoping for every dependency
ID in one query (`ANY($1) AND project_id = $2`); a task depending on
itself is rejected by a direct ID-equality check (only reachable on
update, since a task has no ID yet at creation).

**Database vs. application-level integrity — the decision, not just the
fix:** `owner`/`reviewer` are real FK columns (`UUID REFERENCES
users(user_id)`), so a completely nonexistent user ID was already
impossible at the DB level — the missing check was *membership*, which a
plain FK constraint cannot express (FKs prove existence, not "is a member
of this specific project's team"). `contributors`/`dependencies` are
JSONB arrays with no FK support at all short of a normalized
junction-table redesign, which this milestone deliberately did not do —
the fix is application-level validation for all four fields, consistently,
rather than a mixed model where two fields get a DB-level partial
guarantee and two don't. **The decision to stay application-level, not
migrate to junction tables, was made explicitly** — a schema migration
was not "needed," it was considered and rejected because application-
level validation already closes the actual security gap (unauthorized
cross-team/cross-project reference) without the churn of a data-model
change.

**Privileged invite/join-request authorization — re-verified, not
new:** Every invite/join-request mutation (`inviteMember`,
`approveJoinRequest`, `rejectJoinRequest`, `addMember`) was already gated
by `requireTeamRole`/`requireTeamMembership` middleware from prior
milestones (M5, M27, M36) checked against the *target team ID in the
URL* — re-audited this milestone with an explicit matrix (viewer/member/
manager rejected, owner/admin allowed, non-member rejected, an admin of a
*different* team rejected when the target team ID differs from their
own) and confirmed no gap; the new tests in this section exist to prove
the matrix holds, not because a hole was found in it.

**Stale invite staleness — a real, asymmetric gap between invites and
join-requests:** A team invite is accepted unilaterally by the *invited
person* — no fresh admin/owner decision gates the moment of acceptance,
only the moment of issuance. If that person is later removed (or leaves)
and a prior invite to their email is still `pending`, nothing previously
stopped them from accepting that old invite and silently regaining
membership with zero live authorization decision behind the second entry.
A join *request*'s approval, by contrast, is always a fresh, live
admin/owner action at the moment of approval — approving an "old" request
carries the exact same authorization weight as a brand-new `addMember`
call an admin could issue at will anytime — so join-requests were
deliberately left unchanged; treating both cases identically would have
fixed a problem invites have and join-requests don't.

**Fix:** Whenever a user's membership on a team ends (`removeMember`,
`leaveTeam`), any still-`pending` invite issued to their email for that
*same* team is proactively moved to a new `revoked` status (no `CHECK`
constraint exists on `team_invites.status`, confirmed by inspecting the
schema directly — introducing the new value required no migration).
`acceptInvite`'s own check (`assertInviteBelongsToCaller`, which reads
only `status = 'pending'` invites) then naturally rejects the now-revoked
invite before the accept logic ever runs.

**Concurrency — the atomic-conditional pattern (Section 4) applied to a
new case:** `acceptInvite` used to `SELECT` the invite with no status
filter, then separately `UPDATE` its status and `INSERT` the membership —
a TOCTOU gap in which a concurrent `removeMember`/`leaveTeam` could revoke
the invite in between the read and the write, letting a stale invite still
silently restore membership. Fixed with the same pattern as Section 4:
one atomic `UPDATE team_invites SET status = 'accepted' WHERE invite_id =
$1 AND status = 'pending' RETURNING *` inside `withTransaction`, and the
membership `INSERT ... ON CONFLICT DO NOTHING` only proceeds if that
returned a row. Zero rows affected (already accepted, or revoked in the
interim) is treated as a real error (`BadRequestError`), not a silent
no-op, since — unlike removeMember's "target already isn't a member"
case — there is no prior legitimate state this could be conflated with.
Proven deterministically with the same held-transaction-lock technique as
Section 4 (calling the repository method directly, since the
service-layer `assertInviteBelongsToCaller` pre-check already catches the
common HTTP-level case first and would mask the repository-level atomicity
otherwise). Concurrent duplicate `addMember` calls for the same user were
re-verified safe under the *pre-existing* `team_members(team_id, user_id)`
unique constraint + `ON CONFLICT DO NOTHING` (Milestone 24/25) — no new
code was needed there, only a confirming regression test.

**A narrow, deliberately-accepted residual:** `validateTaskReferences`
(check referenced users/tasks are legitimate, then write) has its own
small TOCTOU window — a referenced user could theoretically be removed
from the team in the instant between the check and the `INSERT`/`UPDATE`.
This is real but was deliberately left unfixed: the practical impact is a
transient data-integrity nicety (a task briefly references a
just-removed member), not an authorization bypass, and closing it would
require locking machinery disproportionate to the risk. Recorded here
explicitly as a reviewed, accepted residual — not silently ignored and
not over-engineered.

**Negative-test strategy:** For every rejected reference (nonexistent
user, non-member user, cross-project/cross-team task, self-dependency),
assert the 400 *and* that no task/row was created or changed — re-query
the DB, don't infer from the response. For every rejected privileged
action (viewer/member/manager on invite/approve, non-member, wrong-team
admin), assert the 403 *and* the final membership/invite state is exactly
what it was before the attempt. For stale-invite tests, assert the DB row
itself transitions to `revoked` (not just that a later accept attempt
fails) and that no membership row was silently inserted.

**Reusable checklist question:** *For every field that references
another resource by ID, ask two separate questions, not one: (a) does
this ID exist at all (format + existence), and (b) is the referenced
resource a legitimate participant in the SAME scope as the resource being
written (same project, same team) — existence alone is not membership.
For fields naming a sub-resource's participant (an assignee, a reviewer,
a dependency), reuse the existing any-role access predicate for that
scope rather than inventing a new membership rule. Separately, for any
privileged action a *non-admin* party can trigger unilaterally (accepting
an invite, redeeming a token) rather than an admin approving in the
moment: if the underlying relationship the action grants can be revoked
by some other action, does revocation actually invalidate this one too,
or can the non-admin party still redeem a now-stale grant with no fresh
authorization decision behind it?*

---

## 12. Untranslated database errors, unvalidated route-param UUIDs, and non-atomic multi-statement writes

**Vulnerability class:** Three related but distinct gaps, all sharing the
same symptom (an expected, nameable client mistake or transient failure
producing a generic 500 instead of a clean 4xx, or a multi-statement write
leaving inconsistent state behind):
1. A repository INSERT/UPDATE/DELETE that can throw a specific, known
   Postgres error code (unique violation, FK violation, invalid input
   syntax) had no translation anywhere between it and the global error
   handler.
2. A route param used directly in a DB query (`:teamId`, `:goalId`,
   `:taskId`, etc.) had no format validation at all — only body fields
   ever got a Zod check.
3. A service method that runs two or more sequential mutating statements
   with no transaction between them, where the second statement failing
   after the first committed leaves a real, reachable inconsistent state.

**Root cause (database errors):** `errorHandler.ts` (Milestone 11) has
always safely redacted anything that wasn't a hand-thrown `AppError` down
to a generic `{ error: 'Internal server error' }` 500 — correct for
preventing a leak, but it meant every *expected* constraint violation
(a duplicate that raced past an application-level pre-check, a delete
blocked by a still-referencing child row, a malformed UUID reaching a
query with no earlier validation) surfaced identically to a genuinely
unexpected server failure, with no clean 4xx and no way for a client to
tell "you made a mistake" apart from "something broke." Each repository
method would have needed its own try/catch to translate this, repeated at
every call site, forever.

**Root cause (route-param UUIDs):** `validate()` (Milestone 5) was always
capable of validating `req.params` (it takes a `source` argument), but
every actual call site only ever passed `'body'` or `'query'` — no route
in the app validated its own path params before using them in a query.
Every `:teamId`/`:projectId`/`:goalId`/`:blockerId`/`:taskId`/`:logId`/
`:requestId`/`:inviteId`/`:userId` flowed straight from the URL into a
repository call.

**Root cause (createTeam/removeMember/leaveTeam atomicity):**
`createTeam` ran the team INSERT and the owner-membership INSERT as two
separate statements with no transaction, inherited unchanged from the
original controller-era code; `removeMember`/`leaveTeam`'s stale-invite
revocation (Milestone 39) was added as a second, separate call *after*
the membership mutation rather than folded into the same atomic
operation, since Milestone 39 was scoped to closing the staleness gap
itself, not to re-auditing atomicity of the code that called it.

**Fix pattern — database error translation:** A single, narrow
code → `AppError` table added directly inside `errorHandler.ts`
(`translatePgError`), consulted only for errors that aren't already an
`AppError`. Deliberately narrow — only the three codes this project has
a confirmed, reachable case for (`23505` unique violation → `ConflictError`,
`23503` FK violation → `ConflictError`, `22P02` invalid UUID syntax →
`BadRequestError`) are translated; anything else (or no `.code` at all)
still falls through to the generic 500 unchanged. This is the *one* place
every thrown error already funnels through, so it closes the whole class
at once instead of needing a bespoke try/catch at every repository call
site — the same "fix it at the one choke point, not at N call sites"
reasoning as [Section 6](#6-unthrottled-sensitive-endpoints-rate-limit-coverage-gaps)'s
reused-abstraction principle, just applied to error handling instead of
rate limiting. The message returned to the client is always the
hand-written, generic `AppError` message — never the raw Postgres error's
own `.message`, which can embed the table/column/constraint name; the
original error's code and message are still logged server-side for
debugging, exactly as an untranslated error already was.

**Fix pattern — route-param UUID validation:** A new `validateUuidParams(
...paramNames)` helper in `validate.ts`, built on the *existing*
`validate()` machinery pointed at `'params'` instead of `'body'`/`'query'`
— no new validation concept, just the same one aimed at a source it had
never been used against. Applied as the first middleware after
`authenticate` on every route with a UUID path param (before
`requireTeamRole`/`requireAccess`/any other DB-touching middleware), so a
malformed ID is rejected with a clean 400 before any query runs at all —
closing the gap at the earliest possible point, not relying on the
database-error-translation fix above as the only backstop (that fix still
covers a route this pass missed, or a UUID arriving some other way, but
route params should never need to reach the database to be validated).

**Fix pattern — deleteGoal FK violation, specifically:** Deliberately
*not* changed to `ON DELETE CASCADE` and *not* given an app-level
pre-check-then-delete — "reject a delete that would orphan children" is
the correct product invariant (the same shape as `removeMember`/
`leaveTeam` refusing to violate the owner-hierarchy invariant), so the
existing `RESTRICT`-by-default foreign key is left exactly as it was; the
fix is entirely the generic database-error-translation layer turning its
`23503` into a clean 409 instead of a 500. No new code was added to
`goals.repository.ts`/`goals.service.ts` beyond a comment — this is the
translation layer doing its job, not a special case.

**Fix pattern — createTeam atomicity:** The team INSERT and the owner-
membership INSERT now run inside one `withTransaction` block (same
mechanism as `acceptInvite`/`approveJoinRequest`/password reset) — if the
second statement fails after the first committed, both roll back
together, so a team can never exist with zero members. Proven with the
same technique Milestone 38 established for password-reset atomicity:
reproduce the exact statement sequence inside a raw `withTransaction`
call, throw between the two statements, and assert the first one's effect
was rolled back — this proves the *mechanism* directly rather than trying
to force a real network failure mid-transaction.

**Fix pattern — removeMember/leaveTeam atomicity:** New repository
methods (`removeMemberAndInvalidateInvites`, `leaveTeamAndInvalidateInvites`)
fold the membership-ending mutation and the stale-invite revocation
(Milestone 39) into one transaction each, closing the narrow window where
a transient failure between the two separate calls would leave a
departing member's invite still `pending` and silently re-usable — a
smaller instance of the exact staleness gap Milestone 39 closed for the
common path, just reachable only on a genuine partial failure rather than
every time.

**Duplicate invite/join-request — investigated, and genuinely fixed (not
deferred):** Unlike the FK-violation case above, this one warranted an
actual schema change. Before writing a migration, the live dev and test
databases were queried directly for existing duplicate pending rows
(zero found in either) — the same "verify before constraining" discipline
Milestone 24's `daily_logs` unique-constraint migration established,
reused here rather than assumed. A partial unique index — `(team_id,
email) WHERE status = 'pending'` for `team_invites`, `(team_id, user_id)
WHERE status = 'pending'` for `join_requests` — allows unlimited
*historical* (accepted/rejected/revoked) rows to repeat (a legitimate
product case: leave and be re-invited later) while permitting at most one
*open* invite/request at a time. `createInvite`/`createJoinRequest` now
use `ON CONFLICT ... DO NOTHING`, matching the exact `ON CONFLICT`-on-a-
partial-unique-index pattern; the service layer turns a "no row returned"
result into a clean `ConflictError` (409) instead of a silent no-op that
would otherwise look like success while sending no email or leaving the
caller unsure whether their request registered.

**authController.ts error redaction — a related, independently-found
gap:** While auditing every path an unexpected error could reach the
client through (Phase 9 of this milestone's audit, not the database-error
work above), three legacy controller methods (`verifyEmail`, `refresh`,
`resetPassword`) were found to have their own local `try/catch` that
returned `error.message` unconditionally — bypassing `errorHandler.ts`'s
redaction entirely for any error without a `.status` (i.e. anything
*not* a hand-thrown `AppError`). Every other controller in the codebase
uses `asyncHandler` + `next(err)` with no local catch, or (like `register`/
`login`) already gated the message correctly (`error.status ? error.message
: 'safe fallback'`) — these three were simply missed when that pattern was
established. Fixed by applying the identical gate.

**Input-boundary hardening — array lengths and AI text lengths:**
`contributors`/`dependencies` (tasks) and `affected_tasks` (blockers) had
UUID-*format* validation (Milestone 35/39) but no length cap — a client
could submit an array of thousands of entries, which `tasksExistInProject`
runs through `ANY($1)` on every create/update. Capped at 50 (comfortably
above any legitimate team/task size in this product's model). Free-text
fields that feed directly into an AI provider prompt with no bound at all
(`analyzeProjectSchema.description`/`.requirements`, `chatSchema.message`/
`.context`) are now capped at 5000, matching the bound `logEntrySchema.entryText`
already established. **Deliberately NOT done:** pagination on unbounded
list endpoints (`getUserTeams`, `getUserProjects`, `getTeamMembers`, etc.)
— a real gap, but a materially larger, cross-cutting change (every list
endpoint, plus its frontend caller) than this milestone's scope; recorded
as a deferred finding, not silently dropped.

**`permissions: z.any()` — re-verified, still deferred:** Re-checked
against current code (not assumed from Milestone 35's original review):
no code path anywhere reads a specific key out of this JSON blob for an
authorization decision, so there is still no real shape to constrain it
to. Separately verified (new test, this milestone) that even with a
fully unconstrained body, `updateMemberPermissions` cannot be used to
escalate privilege — `permissions` is its own JSONB column, entirely
independent of `team_members.role`; sending `{ role: 'owner' }` *inside*
the permissions object has no effect on the actual role column. The
deferral is about "no established schema to validate against," not "this
field is a live authorization bypass."

**Reusable checklist question:** *(a) For every repository method that
runs an INSERT/UPDATE/DELETE: could it throw a unique violation, FK
violation, or invalid-input-syntax error that's currently uncaught? If a
project-wide error handler already exists, translate the small, known set
of codes there once rather than per call site. (b) For every route
parameter used in a DB query: is it validated for format BEFORE any
handler runs, the same way body/query fields already are — not just
relying on the database itself to reject a bad value? (c) For every
service method with 2+ sequential mutating statements: if statement 2
fails after statement 1 commits, is there a reachable state a client or
admin would see as broken (an orphaned parent, a silently-unrevoked
grant)? If yes, wrap them in the project's existing transaction helper —
but prove the failure window is real before adding one. (d) Before adding
ANY unique constraint: query the actual data for existing duplicates
first, and scope the constraint as narrowly as the real invariant allows
(a partial index on the "still open" state, not the whole table) so
legitimate historical repeats aren't blocked. (e) For every controller
method: does it have its own local catch that could echo an error's raw
`.message` for a case with no `.status` — bypassing the global handler's
redaction? A codebase-wide grep for `catch` in controllers, checked
against the global handler's own redaction rule, catches this in one
pass.*

---

## 13. Read-side authorization, cross-team data exposure, and collection scope

**Vulnerability class:** A collection/list endpoint returns rows from a
table with no `WHERE` clause scoping the result to the caller's own
teams/resources — every other read endpoint in the codebase is scoped to
"my teams," "this team's members," "this project's tasks," etc., but one
endpoint (`GET /users`) had no scoping concept applied to it at all,
making it the one place a plain `authenticate`-only check quietly stood
in for a real authorization boundary.

**Root cause:** `GET /users`'s repository method (`usersRepository.getAllUsers`)
was a straight `SELECT ... FROM users` with no join back to `team_members`
— written once, early, and never revisited as every *other* collection
endpoint in the app grew its own team/ownership scoping over milestones
5–39. It has **zero frontend consumer** (confirmed by grep across
`frontend/src` — `api.ts`'s `getAllUsers` is defined but never called by
any page/component), so the gap was never surfaced by exercising the UI.

**Distinguishing a real gap from a deliberately global feature:**
`GET /leaderboard` (audited the same way this milestone) is **also**
global/org-wide — no team scoping, no team_id in the response — but this
is a *confirmed, deliberate* design, not an oversight: `leaderboard.service.ts`'s
own comment documents that `team_id` has been `undefined` since the
original implementation ("`getAllUsers()` never selected `users.team_id`"),
and the frontend (`Grid.tsx`, `ExecutiveBrief.tsx`) computes the caller's
*rank* by finding their position in the **full, unpaginated, all-teams**
array — a company-wide leaderboard is the actual product feature, not a
data-exposure bug. The two endpoints looked identical from the outside
(global, authenticate-only, no team filter) but required opposite
conclusions once traced to their actual product intent and frontend
usage — the lesson isn't "global = bad," it's "trace to the real product
intent before concluding either way."

**Fields exposed, and why this matters even with a safe column list:**
`GET /users`'s column list was already a hand-written allowlist (`user_id,
username, full_name, email, role, impact_score, streak_count, total_logs`)
— no credential/token column was ever at risk. The actual exposure was
**`email`, organization-wide**, to any authenticated user regardless of
team membership — a real PII leak under this app's own team-based privacy
model (every other resource requires shared team membership to be
visible), just via a safe-looking column list rather than a raw-row
spread. This is the same lesson as [Section 5](#5-raw-database-errors-reaching-the-client-as-generic-500s)'s
sibling classes: a column allowlist prevents the *credential-leak* shape
of bug, but says nothing about whether the *rows themselves* are scoped
correctly.

**Fix pattern:** Scoped `getAllUsers` to "shares at least one team with
the caller" — the exact same invariant every other list endpoint already
uses, not a new authorization concept:
```sql
SELECT DISTINCT u.user_id, u.username, u.full_name, u.email, u.role,
       u.impact_score, u.streak_count, u.total_logs, u.created_at
FROM users u
INNER JOIN team_members tm ON u.user_id = tm.user_id
WHERE tm.team_id IN (SELECT team_id FROM team_members WHERE user_id = $1)
ORDER BY u.created_at DESC
```
A caller with no team at all now sees zero users (not even themselves,
since the join has nothing to match) — correct, since "share a team with"
is vacuously false with no teams to share. `created_at` is required in
the `SELECT` list by Postgres's `SELECT DISTINCT ... ORDER BY` rule but
was never part of the original response shape — stripped in the service
layer before the response is built, so the client-visible contract is
unchanged for every field that already existed.

**Alternate-route check:** `teamsService.getAllUsers()` called the exact
same `usersRepository.getAllUsers()` but had **zero route/controller
wiring anywhere** (confirmed by grep) — dead code, not a live bypass.
Removed rather than updated in place, since keeping an unused duplicate
of a just-fixed method around is how the next author accidentally
reintroduces the same bug by "fixing" the wrong one.

**`GET /logs/my`'s `?limit=` — a related but distinct input-validation
gap, not an authorization gap:** The only place in the codebase where a
client-supplied query parameter reached a real SQL `LIMIT` was `parseInt(req.query.limit)
|| 30` — no upper bound, and a negative value (`parseInt('-1')` = `-1`,
truthy, so the `|| 30` fallback never triggers) reached Postgres directly,
which rejects a negative `LIMIT` and previously surfaced as an
untranslated 500 (would now be caught as a generic 500 still, since `LIMIT`
syntax errors aren't one of Milestone 40's three translated codes). Not a
cross-user exposure (`WHERE user_id = $1` elsewhere in the same query
already scopes it to the caller's own logs) — purely an unbounded/
unvalidated-input gap. Fixed with a Zod query schema (`getMyLogsQuerySchema`,
`z.coerce.number().int().min(1).max(100).optional().default(30)`), applied
via the same `validate(schema, 'query')` middleware every other validated
query param already uses.

**Reviewed and confirmed NOT vulnerabilities (documented per this
milestone's own instruction not to silently drop a reviewed-but-rejected
finding):**
- **`GET /leaderboard`'s global scope** — deliberate, as detailed above.
  Also confirmed: hidden (`leaderboard_visible=false`) users cannot leak
  via rank/position/count (removed from the array entirely before
  sorting, not replaced with a placeholder — a gap in the sequence
  carries no signal), and the `leaderboard_visible` field itself is
  stripped from every returned row (pre-existing M32 behavior,
  re-verified). Adding pagination here would break the frontend's
  existing full-array rank computation (`Grid.tsx`/`ExecutiveBrief.tsx`) —
  not attempted.
- **`GET /projects/:projectId/details`'s `access_denied: true` partial-
  disclosure pattern** — a caller with no access to a real project still
  gets `200` with `{project_name, status, priority, is_public,
  access_denied: true, message: 'Request access from team admin...'}`.
  Confirmed deliberate (the message text itself instructs the recipient
  to request access) and low-sensitivity (no field disclosed is
  itself private data) — this is the only endpoint in the codebase with
  this exact shape; every other `requireAccess`-gated endpoint returns a
  flat 403 with no data. Left as-is — a genuine, singular product design
  choice, not a bug to normalize away.
- **404-vs-403 inconsistency between `requireTeamRole`/`requireTeamMembership`
  (404 `'Team not found'` for a nonexistent ID, 403 `'Not a member'` for
  an existing one) and `requireAccess`-gated routes (flat 403 for both
  cases, no existence signal)** — a real, evidence-based inconsistency in
  the codebase's enumeration posture, but low severity (team/resource IDs
  are random UUIDs, not sequential or guessable) and normalizing it would
  touch the 404 branch of every `requireTeamRole`/`requireTeamMembership`
  call site with no demonstrated abuse case. Documented rather than fixed
  this milestone — a candidate for a future pass if `requireTeamRole` is
  ever touched for another reason.
- **`GET /teams`/`GET /teams/search`/`GET /projects/public` (discovery
  features, `is_public AND is_discoverable`)** — unbounded like `GET /users`
  was, but this is the *intended* shape of a "browse public resources"
  feature (see [Section 9](#9-hierarchicalrelationship-resource-authorization-at-read-boundaries)'s
  discovery-vs-hierarchy distinction) — not paginated this milestone since
  no demonstrated scale problem exists and pagination was explicitly
  scoped to "confirmed" issues, not applied preemptively everywhere an
  endpoint happens to be unbounded.

**Reusable checklist question:** *For every collection/list endpoint,
name the invariant that bounds its result set ("my own teams," "this
team's members," "public+discoverable resources") — if the only answer
is "whatever `authenticate` lets through," that's this class of bug. A
safe, hand-written column allowlist (no credential/token fields) is
necessary but NOT sufficient — the rows themselves must also be scoped;
check both independently. Before concluding a global (non-team-scoped)
endpoint is a bug, trace its actual frontend usage and any code comments
describing its history — a genuinely global feature (a company-wide
leaderboard, a public directory) looks identical to an oversight from the
route/controller alone, and the two require opposite fixes. For any
client-controlled numeric query parameter reaching a SQL `LIMIT`/`OFFSET`,
confirm it's validated (reject negative/NaN, cap a maximum) via the same
schema-validation middleware already used for body params — an
unvalidated number reaching raw SQL is an availability/error-boundary
gap even when the query itself is already correctly scoped to the
caller.*

---

## 14. Missing destination-authorization on CREATE paths, unrated repeatable AI reads, and N+1 query amplification

**Vulnerability class 1 — the M29/M30/M35 cross-reference-authorization
class, recurring a fourth and fifth time, specifically on CREATE (not
UPDATE) paths:** `POST /teams` and `POST /goals` each accept a client-
supplied reference to a destination resource (`parentTeamId`/
`parentGoalId`) that gets linked at creation time, with no check that the
caller has any access to that destination — while the *update* path for
the exact same field (`PUT /teams/:teamId/settings`'s `parent_team_id`,
`PUT /goals/:goalId`'s `parent_goal_id`) already had the correct
destination-authorization check, added in M35 and M30 respectively.

**Root cause:** Every prior instance of this class (§2: M29 `projects.team_id`,
M30 `goals.parent_goal_id`, M35 `teams.parent_team_id`) was found and
fixed on an *update* endpoint. The audits that found and fixed those
never re-checked whether the *sibling create* endpoint for the same field
had the same gap — and it did, twice, because "does creating X with a
reference to Y need to check access to Y" is exactly as easy to miss the
first time a field is added as "does updating X to reference Y." The
create and update code paths are usually written and reviewed separately
(often different milestones entirely), so a fix applied to one doesn't
propagate to the other without a deliberate cross-check.

**Attack scenario:** An authenticated user with zero relationship to
`Team A` calls `POST /teams` with `{ teamName: "Evil", parentTeamId:
<Team A's UUID> }` — the new team is created and linked as a child of
Team A with no authorization check at all. Team A's actual owner/admin
now has an unwanted, attacker-controlled sub-team hierarchy entry (visible
via `GET /teams/:teamId/sub-teams`, M37-protected reads notwithstanding —
the read protection says nothing about who could *create* the link in the
first place). Same shape for `POST /goals`'s `parentGoalId` against a
goal in a team the caller has no write access to.

**Confirmed live, not theoretical:** the frontend's `createTeam()` API
call and the Goals page's create-goal form both already pass these
exact fields through to the backend — this is a reachable bug through the
existing UI, not a dead capability nobody could trigger.

**Fix pattern:** Identical to the already-established M29/M30/M35 pattern
— `requireTeamRoleIfSpecified`/`canWriteGoal` applied to the destination
reference, at creation time, not just on update. For `POST /teams`, this
required a **new, distinct resolver** (`parentTeamIdFromCreateBody`) —
the existing `parentTeamIdFromBody` resolver reads `req.body.parent_team_id`
(snake_case, matching `updateTeamSettingsSchema`'s raw-column-name
convention), but `createTeamSchema` uses camelCase `parentTeamId`; reusing
the wrong resolver would have looked like protection while silently
resolving to `null` on every request. Always verify a shared resolver's
field-name assumption actually matches the schema of the route reusing it
— a resolver's own field name is not self-documenting from its usage
site alone. For `POST /goals`, the destination check was added directly
in `goalsService.createGoal`, reusing `canWriteGoal` exactly as
`updateGoal` already does.

**Vulnerability class 2 — a GET endpoint calling an AI provider has no
natural request cap, unlike its sibling creation endpoints:**
`GET /blockers/:blockerId/ai-advice`, `GET /logs/suggestions`,
`GET /logs/insights`, and `GET /logs/standup` each call the AI provider
fresh on every request, gated only by the caller's own `ai_enabled`
privacy setting — no rate limiter at all, despite M22/M34 already
establishing that "a direct, repeatable, no-side-effect AI call" needs
one.

**Root cause:** M22/M34's own reasoning for *not* rate-limiting most AI
call sites was "these only run as a side effect of creating a resource,
which already has its own natural rate limit (you can only create so
many logs/blockers)." That reasoning is correct for the CREATE-triggered
AI calls (`analyzeBlocker` inside `createBlocker`, log-creation's own
analysis) — but these four are GET-triggered *reads* of the same kind of
AI output, and re-reading an existing resource's advice/suggestions has
no such natural cap; a caller can loop any of them indefinitely against
one already-existing blocker/their own log history.

**Fix pattern:** Reused `createApiLimiter()` — the exact same method, not
a new one — wired independently at each of the four call sites (each gets
its own separate 20-per-5-minute budget, matching M34's established
"independent wiring, not a shared budget" principle). No new rate-limit
infrastructure needed; the abstraction already fit.

**Vulnerability class 3 — N+1 query amplification with no cap on the
amplifying dimension:** `GET /projects/:projectId/tasks` fetched each
task's `owner`/`reviewer`/`contributors`/`dependencies` with its own
per-ID `SELECT` inside a per-task `Promise.all` — for a project with `N`
tasks, each carrying up to 50 contributors + 50 dependencies (M40's
per-task cap), that's up to ~102`N` round trips for a single read, with
**nothing capping `N`** (how many tasks a project can have). Any team
member with ordinary write access could create many tasks and turn every
subsequent read of that project's task list — by *any* team member,
including a low-privilege viewer just loading the page — into an
increasingly expensive query.

**Distinguishing this from "add pagination":** The fix is NOT limiting
how many tasks are returned (that would change the response's actual
content, a product-visible behavior change with no upside) — it's
collapsing the *access pattern* from O(N) round trips to O(1), regardless
of N. Two bulk `WHERE id = ANY($1)` queries (new `usersRepository.getUsersByIds`,
`tasksRepository.getTasksByIds`) replace the entire per-task fan-out; the
results are joined in memory via a `Map`, producing the identical output
shape as before. This is the general lesson for N+1 amplification: when
the *number of rows returned* is legitimate and correct, but the *number
of queries required to build them* scales with an attacker-influenceable
count, batch the fan-out rather than capping the output.

**Reusable checklist question:** *(a) Whenever a cross-reference-
authorization check is added to an UPDATE endpoint for some field, grep
for a sibling CREATE endpoint accepting the same field — the two are
almost always written and reviewed separately, so a fix to one doesn't
imply the other got it. When reusing a resolver/helper across routes,
verify its field-name assumption (camelCase vs. snake_case, nested vs.
flat) actually matches the calling route's own schema, don't assume
"same field, same resolver" is safe. (b) For every endpoint that calls an
AI/expensive-provider client: is it a CREATE whose natural resource-
creation cap already bounds it, or a READ with no such cap? A rate limit
justified for the create side does not automatically cover a read side
that returns the same kind of AI output on demand. (c) For every
`Promise.all(...map(...))` doing a per-item DB call: is the item count
bounded by a real, un-influenceable invariant, or could a legitimate
writer inflate it and turn every future reader's request into an
amplified cost? If the per-item work is genuinely needed, batch it into
O(1) queries rather than capping the output or leaving it O(N).*

---

## 15. Write-side state-machine transitions missing the atomic-conditional guard their sibling already had

**Vulnerability class:** A status-transition mutation (`UPDATE ... SET
status = 'x'`) has no guard on the row's *current* status — it will
happily overwrite a status that has already moved past the state this
transition assumes, producing a self-contradictory result (a status
column and the real side effects it implies disagree with each other).
This is the exact TOCTOU shape Section 4 established the fix for
(`acceptInvite`), but three sibling methods on the same two tables never
received it.

**Root cause:** `acceptInvite` (Milestone 39) got the atomic conditional
`WHERE status = 'pending'` guard because a specific, demonstrated race
(concurrent invite revocation) motivated it. `rejectInvite`,
`approveJoinRequest`, and `rejectJoinRequest` are the same shape of
mutation on the same two tables (`team_invites`, `join_requests`) — but
each was written independently, at different milestones (`rejectInvite`
predates Milestone 39 entirely; `approveJoinRequest` got a `withTransaction`
wrapper in Milestone 25 for an unrelated reason — the `ON CONFLICT DO
NOTHING` membership insert, not a status guard), and the fix that closed
the gap for their sibling `acceptInvite` was never propagated to them.
This is the general lesson Section 14 already named for CREATE-vs-UPDATE
authorization checks, recurring here for a different pair: *sibling
mutations on the same resource, written at different times, drift apart
even when one of them gets fixed.*

**Exploit/inconsistency scenario (demonstrated, not theoretical):**
1. An invitee has one still-`pending` invite. They call `accept` and
   `reject` on the *same* invite in quick succession (a double-submit, two
   open tabs, or simply two requests racing).
2. If `acceptInvite`'s atomic UPDATE commits first (membership inserted,
   status → `accepted`), the still-in-flight `rejectInvite` — which had
   no status guard — would unconditionally flip status back to `rejected`.
3. Result: the invitee is a real `team_members` row, but their own invite
   record reads `rejected` — a permanent, self-contradictory audit trail
   with no error surfaced to either request.

The join-request pair has the identical shape without even needing a
race: an admin can call `reject` on an already-`approved` request (or
`approve` on an already-`rejected` one) through the ordinary UI, since
neither checked the request's current status at all. Approving an
already-rejected request would silently re-grant membership (relying on
`ON CONFLICT DO NOTHING` to avoid a crash, but with no signal to the
caller that this was a no-op-if-already-a-member versus a fresh grant);
rejecting an already-approved request would flip its status to `rejected`
with **zero effect on the membership that approval had already granted**
— an admin's own request list would show "rejected" for a person who is,
in fact, a full team member.

**Severity note:** none of these three is a privilege-escalation or
authorization-bypass path — `approveJoinRequest`/`rejectJoinRequest` are
already gated to the target team's `owner`/`admin` (who could add/remove
the member directly through an entirely different, already-authorized
route anyway), and `rejectInvite`'s race requires the *same* invitee who
legitimately accepted to also be racing their own reject call. The
vulnerability class is state-machine/audit-trail integrity, not
unauthorized access — but a security-relevant audit trail (who is
actually a member, and why the system's own records say otherwise) being
wrong is still a real finding worth closing, not a cosmetic one.

**Fix pattern:** Identical to `acceptInvite`'s existing pattern, applied
to the three missed siblings — no new concept:
- `rejectInvite`: `UPDATE team_invites SET status = 'rejected' WHERE
  invite_id = $1 AND status = 'pending' RETURNING *` — a null result
  (already accepted/rejected/revoked) is now a `BadRequestError`, not a
  silent flip.
- `approveJoinRequest`: the previous shape (`SELECT`, then unconditional
  `INSERT ... ON CONFLICT DO NOTHING`, then unconditional `UPDATE`) is
  now the same atomic-conditional-UPDATE-first pattern as `acceptInvite`
  — the status transition runs first, inside the transaction, and the
  membership insert only proceeds if it affected a row.
- `rejectJoinRequest`: same `AND status = 'pending'` guard as `rejectInvite`.

**Reusable checklist question:** *Whenever a status-transition mutation
gets an atomic-conditional-UPDATE fix (because a specific race or bug was
found), grep for every OTHER mutation on the same table that also writes
to the same status column — was the fix a one-off patch to the method
that happened to be reported, or does the underlying resource have
multiple methods that can each move its status, all of which need the
same guard? A resource with N possible transitions needs the guard N
times, not once.*

**A sibling finding, same milestone — `blockers.affected_tasks` missed
the M39 reference-integrity treatment given to `tasks.dependencies`:**
`affected_tasks` references tasks by ID (a blocker "affects" certain
tasks) but, unlike `tasks.dependencies`, never received an existence or
same-scope check — the create path didn't even validate UUID *shape*,
and the update path checked shape but not existence/scope. Since a
blocker is team-scoped (not project-scoped like a task's own
dependencies), the correct invariant is "the referenced task belongs to
*some* project within the blocker's own team," proven via a join through
`projects` (`tasksRepository.tasksExistInTeam`), the same one-query-
proves-every-ID-at-once shape as `tasksExistInProject`. Confirmed
low-impact in practice (zero read/frontend consumers of this field today
— a pure data-integrity gap, not an exposed authorization bypass) but
fixed for consistency with the established pattern rather than left as a
visibly-inconsistent exception. **Reusable checklist question:** *whenever
a reference-integrity fix (existence + scope check) is applied to one
JSONB/array reference field, list every OTHER reference field in the
codebase with the same shape (an array of foreign IDs with no real FK) —
was the fix applied to all of them, or just the one instance that
prompted the audit?*

---

## 16. Milestone 44 — fresh authorization/state-machine/transaction audit: three deferred findings resolved, no new findings

**Context:** M41/M42/M43 each deferred a specific finding rather than fix
it speculatively, in keeping with this project's own established
discipline ("fix only confirmed issues"). M44 was a dedicated pass to
either confirm each is genuinely unreachable (with concrete evidence) or
find the specific exploit path that changes the assessment — plus a
fresh, full-repository re-scan across authorization targets, state
machines, capacity-style TOCTOU, and AI/rate-limit bypass paths. **No
code changes resulted from this milestone** — every investigation
concluded with either "already correctly mitigated" or "confirmed not
exploitable, with a specific reason." This is itself a legitimate
milestone outcome (the same shape as M31's audit-only pass) — an audit
that finds nothing actionable is not a wasted audit, it's evidence the
prior thirteen hardening milestones actually worked.

**Finding 1 — 404-vs-403 enumeration inconsistency (deferred since M41):
re-confirmed NOT exploitable.** `requireTeamRole`/`requireTeamMembership`
(`common/middleware/requireTeamRole.ts`) return 404 for a nonexistent
team vs. 403 for an existing-but-unauthorized one; `requireAccess`
(`common/middleware/requireAccess.ts`) collapses both into a flat 403.
This inconsistency is real and unchanged, but every primary key in
`database/schema.sql` is `UUID PRIMARY KEY DEFAULT gen_random_uuid()` —
random v4 UUIDs, ~122 bits of entropy, never sequential and never derived
from any guessable input. To exploit the 404-vs-403 distinction, a caller
needs a *candidate* ID to submit in the first place; the only realistic
way to have one is to already possess a real ID (former membership, a
leaked link), at which point the existence signal reveals nothing they
didn't already know. **The invariant that makes this safe: ID
unguessability, not response-code normalization.** Left unchanged
deliberately — normalizing it would touch every `requireTeamRole`/
`requireTeamMembership` call site in the app for a distinction that
cannot be exploited given the actual ID space.

**Finding 2 — `removeMemberAndInvalidateInvites`/`leaveTeamAndInvalidateInvites`
email-read-then-transaction window (deferred since M40): re-confirmed
NOT reachable.** The claimed race requires a user's email to change
between the read and the transaction. A repository-wide search for any
code path that can write `users.email` — every `UPDATABLE_COLUMNS`
allowlist (`users.repository.ts`, `auth.repository.ts`), every route
file — found **none**; `email` is not a client-settable column anywhere
in the application, and no profile-edit/admin-edit/account-merge feature
exists. **The invariant that makes this safe: the precondition for the
race (an email that can change) has no code path to trigger it at all.**
This is not "low probability," it is currently impossible given the
product's actual feature set — re-confirm this conclusion if an
email-change feature is ever added, since that would be the moment this
residual becomes real.

**Finding 3 — `max_team_size` bounded but unenforced (deferred since
M42): re-confirmed as decorative metadata, deliberately not fixed.**
`max_team_size` is written once at team creation (`teams.repository.ts`)
and **never read** by `addMember`/`acceptInvite`/`approveJoinRequest` or
any other membership-creation path — no capacity check exists anywhere.
The frontend (`Teams.tsx`) collects the value on the create form and
never displays it again (no "X/Y members" indicator, no capacity gate).
This is, functionally, a second live instance of [Section 1](#1-persisted-but-unenforced-settings)'s
exact vulnerability class ("a setting round-trips correctly but nothing
in the codebase enforces it") — except here there is no evidence *any*
enforcement was ever intended: no code comment, no partial
implementation, no UI hint anywhere across 43 milestones of this
project's history. **Deliberately NOT implemented as a real capacity
limit this milestone** — doing so now would mean inventing new product
behavior with no basis in the existing design, the same reasoning
already applied to `permissions: z.any()` (§12) and `blockers.affected_tasks`
before its M43 fix (which *did* have an established sibling pattern to
match; this field has none). If team capacity is ever meant to become a
real constraint, the correct fix is an atomic conditional INSERT —
`INSERT INTO team_members ... SELECT ... WHERE (SELECT COUNT(*) FROM
team_members WHERE team_id = $1) < (SELECT max_team_size FROM teams
WHERE team_id = $1)` or equivalent — never a `COUNT(*)` read followed by
a separate conditional `INSERT`, which would reopen exactly the TOCTOU
class M36/M39/M40 spent several milestones closing elsewhere. Recorded
here as the fix pattern to use *if and when* this becomes a real
requirement, not implemented speculatively now.

**Fresh full-repo re-scans (authorization-target-vs-mutation-target,
state-machine, capacity-TOCTOU, AI/rate-limit bypass) — no new findings.**
Every mutating route's authorization check resolves the same ID the
controller/service actually mutates (no route found where `req.params`
authorizes one resource while a different `req.body` ID is what gets
written). `updateMemberPermissions` re-confirmed inert — no code path
anywhere reads `team_members.permissions` for an authorization decision
(re-verified after M40 and M42's prior confirmations, still true). Every
status-transition method for every stateful resource (`users.is_verified`,
`refresh_tokens.revoked_at`, verification/reset token lookups,
team_invites/join_requests post-M43) either has no un-transition path at
all or is already correctly guarded. No capacity-style `COUNT(*)`-then-
`INSERT` pattern exists anywhere outside the (unenforced, see Finding 3)
`max_team_size` field. Every AI-provider function (`generateMentorAdvice`,
`generateLogSuggestions`, `generateProductivityInsights`, `generateStandup`,
`analyzeProjectWithAI`, the `/api/ai/chat` handler) has exactly one
service caller, one controller caller, and one already-rate-limited
route — no alternate/unrated path exists.

**Reusable checklist question:** *When a finding is deferred rather than
fixed, what specific, falsifiable condition would need to become true
for it to turn into a real exploit (a new endpoint, a changed invariant,
a new caller)? Write that condition down explicitly (not just "low
severity") so a future audit doesn't need to re-derive it from scratch —
and re-check that exact condition, not the finding's general shape, the
next time the relevant code area changes. For any persisted setting/field
with an obvious real-world meaning (a "max size," a "limit," a
"capacity"): does ANYTHING in the codebase actually enforce it, or does
it just round-trip? A field name implying a constraint is not evidence
the constraint exists — verify by reading every write path AND grepping
for every read of the same column.*

---

## 17. Unbounded recursive query as a low-privilege DoS vector, plus two architectural findings deliberately deferred

**Vulnerability class: a recursive query with no cycle guard, over data
whose cycle-freedom was never enforced at write time.** `goals.parent_goal_id`
forms a tree by convention, not by any database constraint — nothing
stops a `parent_goal_id` chain from looping back on itself. Two
consumers of that chain existed: `buildGoalTree` (walks *down* from
actual roots, `parent_goal_id IS NULL`) and `calculateGoalProgress`'s
`WITH RECURSIVE` CTE (walks in whatever direction the query is aimed,
starting from an arbitrary caller-supplied `goalId`). A tree-shaped
consumer that only ever starts at real roots cannot enter a cycle even
if one exists elsewhere in the data (a cyclic "island" has no root, so
it's simply invisible to that traversal) — but a consumer that starts
from an arbitrary node has no such protection.

**Root cause:** `updateGoal`'s M30 fix (destination-authorization on
`parent_goal_id`) checks the caller's *access* to the new parent — it
was never extended to also check whether that new parent is already a
*descendant* of the goal being updated, which is a completely different
question (authorization vs. graph topology) that happened to live next
to each other in the same method. `UNION ALL` in the recursive CTE never
deduplicates rows, so once a cycle exists, the query has no natural
terminating condition — it repeats the cycle's members forever, bounded
only by the database server running out of memory/CPU or an external
`statement_timeout` (none is configured anywhere in this application).

**Exploit scenario (concretely reachable, no elevated privilege
required):** Any ordinary team member (not admin/owner — any writer)
who owns or has write access to two goals in the same team can: (1)
`PUT /goals/:A` with `parent_goal_id: B` — accepted, no cycle yet. (2)
`PUT /goals/:B` with `parent_goal_id: A` — under the pre-fix code, also
accepted (the caller has write access to `A`, which is all M30's check
verified), completing the cycle `A → B → A`. (3) `GET /goals/:A/progress`
(or `:B`) — gated only by `canAccessGoal` (any team member, including
`viewer`, can trigger this step even if steps 1–2 required write access)
— starts `calculateGoalProgress` at the cyclic node, entering the
infinite walk. Three ordinary API calls, no special role, no timing
trick — a genuine low-privilege denial-of-service vector against the
shared Postgres instance.

**Fix pattern — closed at both the root and the point of damage
(deliberate belt-and-suspenders, not redundancy for its own sake):**
1. **Root fix**: `goalsRepository.wouldCreateCycle(goalId, candidateParentId)`
   walks the candidate parent's own ancestor chain and rejects the
   update (`BadRequestError`) if the goal being updated appears anywhere
   in it — this is exactly the condition under which the update would
   close a cycle, checked *before* the write, not after. Also correctly
   catches the trivial self-parent case (`goalId === candidateParentId`).
2. **Defense in depth at the point of damage**: `calculateGoalProgress`'s
   CTE itself was independently hardened using the standard Postgres
   cycle-safe recursive-query idiom — carry a `visited` array of node IDs
   through each recursive step, and add `WHERE NOT (next_node = ANY(visited))`
   to the recursive term. This means even if a cycle somehow entered the
   data through a path this milestone didn't anticipate (a direct DB
   write, a future code path that bypasses the service layer), the query
   itself still terminates instead of hanging — the same reasoning this
   project has applied before (e.g. M39's TOCTOU residual documented as
   accepted specifically because the *write-time* check was judged
   sufficient; here, given how much cheaper a query-level guard is
   compared to the severity of an unbounded query, both layers were
   applied).
3. The write-time check (`wouldCreateCycle`) is *itself* built with the
   same cycle-safe idiom, so that even running the check against
   already-cyclic data (verified absent from both the dev and test
   databases before this fix, matching the established "verify before
   constraining" discipline from M24/M40) terminates rather than hanging.

**Why `teams.parent_team_id` does NOT need the same fix:** the identical
missing-cycle-check pattern exists at the data level for team hierarchy
too, but `getSubTeams` (the only consumer) is a flat, single-level
`WHERE parent_team_id = $1` query — not recursive. `RECURSIVE` appears
exactly once in the entire backend (`goals.repository.ts`). A
`parent_team_id` cycle is possible to create but has no code path that
would ever walk it recursively, so it cannot cause a hang or unbounded
query. Confirmed by grep, not assumed — the fix is scoped to the actual
vulnerable consumer, not applied reflexively to every superficially
similar field.

**Two architectural findings investigated and deliberately deferred
(not fixed this milestone — documented per this project's own
discipline of not fixing without evidence a fix is warranted, and not
silently dropping a real finding):**

- **Legacy bearer JWT stored in `localStorage`** (`frontend/src/services/api.ts`,
  `frontend/src/hooks/useAuth.tsx`) — a 7-day-lived credential sitting in
  a location any injected script could read, with no `httpOnly`
  protection, unlike the cookie-based access/refresh pair the backend
  already supports in parallel (M4's design). No live XSS injection
  point was found in this pass (zero `dangerouslySetInnerHTML` usage
  anywhere in the frontend), so this is a **latent architectural
  weakness, not an actively exploited vulnerability today** — it would
  only become one if a future XSS bug, a compromised dependency, or a
  malicious browser extension were also present. Not fixed this
  milestone because doing so properly means migrating the legacy bearer
  frontend flow onto the cookie-based path entirely — a frontend
  authentication redesign, explicitly out of scope for a backend-focused
  hardening milestone. **Reopening condition: revisit the moment any
  future audit finds even one place user-controlled content reaches the
  DOM unescaped, or when frontend architecture work is ever undertaken.**
- **AI prompt injection between co-workers via `generateStandup`** — one
  team member's freely-authored log text (already capped at 5000 chars,
  M40) enters the same AI prompt as other members' logs with no
  per-author sanitization, so a member could attempt to steer the AI's
  summary of the *whole team's* standup. Judged not worth fixing: the
  only effect is on AI-*generated display text*, never on the underlying
  log data (which every team member can already see raw and unfiltered
  elsewhere in the product) and no automated action is ever taken on the
  AI's output. This is the identical, already-acknowledged residual
  `logs.service.ts`'s own comment names ("filtering AI usage of each
  individual team member's log content is a separate, larger
  per-subject-consent design this milestone deliberately doesn't take
  on") — re-confirmed, not newly discovered. **Reopening condition:
  revisit if `generateStandup`'s output is ever used for anything beyond
  display (an automated decision, a stored record treated as fact).**

**Reusable checklist question:** *For every recursive query (`WITH
RECURSIVE`) in the codebase, does the underlying data have any database-
level constraint preventing a cycle in the relationship it recurses
over? If not (a self-referencing foreign key alone never prevents a
cycle — only an application-level check can, since a cycle spans
multiple rows/statements), does EVERY consumer of that data start only
from a position a cycle can't reach (e.g., true roots), or can ANY
consumer start from an arbitrary, caller-supplied node? If even one
consumer can be pointed at an arbitrary node, the query itself needs a
cycle-safe guard (the visited-path idiom) regardless of whether a
write-time cycle-prevention check also exists — the two are
complementary, not substitutes for each other, and the query-level guard
is cheap enough that "we already prevent cycles at write time" is not a
sufficient reason to skip it.*

---

## 18. A pervasive N+1-against-a-shared-pool class, recurring in five places M42's own fix never got generalized to

**Vulnerability class:** M42 fixed exactly one instance of "fetch N related
records with N separate per-item queries inside a `Promise.all`, where N
is an attacker-inflatable collection size" (`GET /projects/:projectId/tasks`)
and wrote the exact checklist question that would have caught every other
instance — but that checklist question was apparently never actually
re-run against the rest of the codebase. M46's fresh audit did run it
(grepping every `Promise.all(...map(...))` doing a per-item DB call) and
found the identical shape recurring in five more places, two with
concretely worse reachability than the original.

**Root cause — why this differs from an ordinary performance bug:** the
app's entire Postgres access goes through one shared pool of **20
connections** (`db/client.ts`/`utils/database.ts`). A single request that
fans out N concurrent queries doesn't just make itself slow — once N
exceeds the pool size, that one request starves the connection pool for
*every other in-flight request across the whole application*, not just
the caller's own. This is the same "one caller's cost is every caller's
cost" shape as M45's recursive-CTE finding, just via query *count*
instead of query *hang time*. Combined with M44's confirmed conclusion
that `max_team_size` is unenforced decorative metadata, "N" here is
genuinely attacker-inflatable — nothing stops a team from growing to
hundreds of members via ordinary invites/join-requests.

**Confirmed instances, by severity:**
1. **`teams.repository.ts`'s `searchTeams` (most severe)** — the SQL
   itself had no `LIMIT` at all, and the service-layer enrichment fanned
   out 2 queries per matched team. Reachable by ANY authenticated user
   with zero relationship to any matched team, and the route carries no
   rate limiter — the worst reachability of the whole class, since every
   other instance at least requires membership in the team whose
   collection is being fanned out over.
2. **`logs.service.ts`'s `getStandup`** — one query per team member, no
   cap on team size, compounding with an AI-cost amplification (the
   `generateStandup` prompt itself scales with member count, see §17's
   AI-cost note) at the *same* rate-limit price M42 already established.
3. **`blockers.service.ts`'s `getTeamBlockers`/`getMessages`/`getAIMentorAdvice`** —
   the latter two were not even genuine N+1s once inspected: `getBlockerMessages`
   already joins `users` and returns `username`/`full_name` on every row
   — the per-message `getUserById` re-fetch was **pure unforced N+1 with
   no query ever actually needed**, the cheapest possible class of this
   bug to close (delete the redundant call, don't even need to batch it).
4. **`teams.service.ts`'s `getMyInvites`/`getJoinRequests`** — lower
   severity (self-scoped inbox / per-team collections realistically
   bounded by actual invitations sent, not simple to inflate arbitrarily),
   fixed for consistency with the rest of the class.

**Fix pattern:** Where a real query was needed, replaced the per-item
fan-out with exactly two bulk queries (`WHERE id = ANY($1)` for entities,
`GROUP BY` for counts) regardless of collection size — the same pattern
M42 established for `getProjectTasks`, `usersRepository.getUsersByIds`
reused directly, and new siblings added (`teamsRepository.getMemberCounts`/
`getTeamsByIds`, `blockersRepository.getMessageCounts`, `logsRepository.getTodaysLogsForUsers`).
Where no query was ever needed (`getMessages`/`getAIMentorAdvice`),
removed the redundant fetch entirely rather than "batching" something
that shouldn't have run at all. `searchTeams`'s SQL also gained a `LIMIT 50`
(matching M40's established array-length-bound convention) as a second,
independent layer of protection — even a correctly-batched query against
an unbounded match set is still an unbounded *result set* to serialize
and transmit.

**A genuine, unrelated bug this rewrite's own test caught and fixed
along the way:** `getStandup`'s "only show today's log" filter compared
a Postgres `DATE` column's value (which node-postgres returns as a JS
`Date` object, constructed at *local* midnight) against a plain
`"YYYY-MM-DD"` string via `===` — always `false` outside UTC+0, and even
at UTC+0 fragile to round-tripping through `.toISOString()` (which
converts local midnight to UTC, shifting the date by the server's offset
whenever it isn't literally zero). This filter had **no prior test
coverage** and had likely never actually worked. Fixed by filtering
`log_date = CURRENT_DATE` directly in SQL instead of comparing dates in
JS at all — Postgres's own date comparison has no such ambiguity, and
`daily_logs`' existing `UNIQUE(user_id, log_date)` constraint (M24) means
the bulk query already returns at most one row per user, no `DISTINCT ON`
even needed. This is exactly the kind of thing this project's own
discipline says to fix when found incidentally while touching the exact
code, rather than either silently leaving a known-broken filter in place
or weakening the new test to avoid catching it.

**A related O(n²) CPU-bound finding, same milestone, different
mechanism:** `goals.service.ts`'s `buildGoalTree` re-filtered the
*entire* goals array at every node of the tree it built — O(n) work per
node visited, O(n²) total for a team with n goals. Unlike the pool-
exhaustion findings above, this is single-threaded CPU cost on the
Node.js event loop, not a database connection cost, but the effect is
the same shape: one request (any read-authorized member, including
`viewer`) can stall the whole process for its own duration. Fixed by
building a `parent_goal_id -> children` index once (O(n)) and having the
recursive tree-build only ever look up that index — O(n) total instead
of O(n²), correctness unchanged (verified by a new regression test
against a real multi-level hierarchy).

**Defensive hardening investigated and applied, though not an active
vulnerability:** `jwt.ts`'s `jwt.verify` call named no explicit
`algorithms` option. Confirmed, against the installed `jsonwebtoken`
library's own source, that it already refuses an unsigned/`alg: none`
token unless the caller explicitly opts in, and defaults to
HS256/384/512 for a plain string secret (which `env.jwtSecret` is) — so
this was never a live algorithm-confusion vulnerability (that class
requires an asymmetric public key reachable as a would-be HMAC secret,
which doesn't apply to a symmetric string secret). Named the algorithm
explicitly on both sign and verify anyway (`algorithms: ['HS256']`) as
cheap, zero-risk defensive clarity — a future change to the secret's
type or the library's own defaults can no longer silently widen what
gets accepted without a corresponding, deliberate change here. Verified
with a new test that a manually-crafted `alg: none` token is rejected.

**Investigated and confirmed NOT vulnerabilities this milestone:** task
`dependencies` cycles (confirmed no consumer ever recurses over them —
`getProjectTasks` does one flat, single-level lookup; a 2-cycle has zero
DoS consequence, unlike the goal-hierarchy case M45 fixed). Production
configuration (no fallback JWT secret, `AUTO_VERIFY`/CORS/cookie flags
all correctly environment-gated, bcrypt cost uniform, error verbosity
identical in every environment). Mechanism-interaction ordering (CSRF →
auth → authorization → the M45 cycle-check all correctly sequenced in
`updateGoal`, cheapest/most-authoritative gate first). Index coverage
(every query in the N+1 chains above was itself already indexed and
cheap — the vulnerability was the multiplication factor, not per-query
cost). Frontend trust boundary (no identity/role/permission field is
ever sent by the frontend and trusted by the backend instead of being
derived server-side; re-confirmed, not newly discovered).

**Reusable checklist question:** *When a fix closes one instance of a
vulnerability class (an N+1, a missing cap, a missing check), the
checklist question that fix's own documentation writes is not
self-executing — schedule an explicit, later pass that actually re-runs
it against the rest of the codebase (a grep for the same code shape),
rather than trusting that writing the question down was equivalent to
asking it everywhere it applies. For any per-item fan-out inside a
`Promise.all`: first check whether the "related data" is already present
on the base query's own joined columns (no query needed at all) before
reaching for a batch-query fix — the cheapest fix is deleting an
unnecessary re-fetch, not batching one that shouldn't exist. For any
JS-side comparison involving a database DATE/TIMESTAMP column: prefer
filtering by that condition in SQL over fetching broadly and comparing
in application code — timezone/type-representation mismatches between a
driver's parsed value and a hand-constructed comparison value are a
recurring, easy-to-miss class of their own.*

---

## 19. Release-readiness hardening (M47) — frontend audit, max_team_size enforcement, connection-pool tuning, and load-test evidence

**Context:** M46 classified the project "B — requires M47 with four specific,
evidence-based blockers": (1) the frontend had never been the PRIMARY
subject of a dedicated security milestone, (2) no realistic load/capacity
test had ever validated the backend, (3) the 20-connection pool size had
never been evaluated against the stated 50-100+ team deployment target,
(4) `max_team_size` needed a real decision, not further documentation.
M47 investigated all four.

### Finding 1 — frontend security audit: no active vulnerability found; `localStorage` JWT storage reclassified

A full, dedicated frontend audit (every file under `frontend/src`, not
spot-checks) searched for every pattern in the milestone's own checklist
(`localStorage`, `dangerouslySetInnerHTML`, `eval`, open-redirect
patterns, `postMessage`/`iframe`, unsafe external links, environment-variable
leakage) and inventoried every API call the frontend makes.

**Resolved the M45-deferred finding.** The legacy bearer JWT in
`localStorage` (`frontend/src/hooks/useAuth.tsx`, read by
`frontend/src/services/api.ts`'s axios interceptor on every request) is
confirmed **live, not dead code** — it is the app's *only* authentication
mechanism; no parallel cookie-based session exists in the frontend at all
(`withCredentials`/`document.cookie` — zero hits). The token's exposure to
XSS is real IN PRINCIPLE, but **no injection point exists to exploit it
today**: every user-controlled or AI-generated string rendered anywhere in
the app (log entries, blocker titles/messages, team/goal text, AI chat
output) goes through plain JSX interpolation (`{value}`), which React
escapes by default; `dangerouslySetInnerHTML`/`eval`/`new Function` have
zero occurrences in `frontend/src`, and no markdown/HTML-rendering library
is even a dependency. **Reclassified from "open finding" to "accepted
architectural risk with no live exploit path"** — the correct fix (migrating
onto the existing but frontend-unused cookie-based session flow) remains a
frontend-authentication-redesign task, appropriately out of scope for a
hardening milestone; reopen the moment ANY future change introduces
`dangerouslySetInnerHTML` or an HTML/markdown renderer, since that is the
exact precondition this conclusion depends on.

**No open-redirect, unsafe-external-link, or postMessage/iframe surface
exists.** All `window.location` usage is two hardcoded-path cases (a 401
redirect to `/login`, an error-boundary reload); no `location.search`,
`location.hash`, or query-param-built redirect exists anywhere; no
`target="_blank"`, `<iframe>`, or `postMessage` exists anywhere.

**Role-based UI is confirmed cosmetic-only, matching the backend-authoritative
model.** `Teams.tsx` disables/hides role-editing controls for the owner row
as a UX nicety, but never gates the underlying API call behind a client-side
role check — every mutating call (`removeTeamMember`, `updateMemberRole`,
`approveJoinRequest`, etc.) reaches the backend regardless of what the UI
shows, and the backend's own `requireTeamRole`/hierarchy checks (already
covered extensively M27-M46) are what actually enforce it. This is the
correct model, re-confirmed rather than assumed.

### Finding 2 — `max_team_size`: previous milestones' non-enforcement conclusion was based on incorrect evidence; now enforced for real

M42/M44/M46 all concluded `max_team_size` was decorative metadata,
explicitly citing "never displayed in the frontend" as supporting evidence.
**That evidence was wrong.** `frontend/src/pages/Teams.tsx`'s create-team
form has a **required** field labeled `"Team Size Limit *"` with the
helper text `"Maximum number of team members"` (`Teams.tsx:527-544`) — the
product visibly promises an enforced capacity limit that never existed.
This is exactly Section 1's "a setting round-trips correctly but nothing
enforces it" class, except here the UI doesn't just collect the value —
it actively tells the admin it's a real limit.

**Fix — atomic capacity check on every membership-creation path**
(`teams.repository.ts`): `addTeamMemberIfAuthorized`, `acceptInvite`, and
`approveJoinRequest` (the three places `team_members` ever grows) now
gate their `INSERT` on `(SELECT COUNT(*) FROM team_members WHERE team_id =
$1) < (SELECT max_team_size FROM teams WHERE team_id = $1)`, with an
`EXISTS` escape hatch so re-adding/re-approving an EXISTING member (which
doesn't grow headcount) is never blocked by a full team. `createTeam`
needs no check — the first member (the owner) is exempt by construction.

**A genuine race condition was found and fixed in this milestone's OWN
first attempt, caught by its own concurrency test — worth recording as a
cautionary, reusable lesson.** Unlike the single-row conditional
statements M36/M39/M40 established (where a plain row lock is sufficient
because the check and the mutation target the SAME row), a capacity check
is an AGGREGATE over many OTHER rows (`COUNT(*) FROM team_members`) with
no single row to lock. Two attempts were made:
1. **First attempt (broken):** wrap the INSERT in `withTransaction`,
   explicitly `SELECT ... FOR UPDATE` the team's own row, THEN run the
   capacity-gated INSERT as a SEPARATE statement. This is correct, but
   costs 4 round trips (BEGIN/lock/insert/COMMIT) instead of the original
   1 — see Finding 3 for the real, measured cost this had.
2. **"Optimization" attempt (INCORRECT, caught by testing, reverted):**
   fold the lock into a CTE on the SAME statement as the INSERT (`WITH
   team_lock AS (SELECT ... FOR UPDATE) INSERT ... FROM team_lock WHERE
   COUNT(*) < team_lock.max_team_size`), to avoid the extra round trip.
   **This is not race-safe.** In READ COMMITTED, a statement's snapshot is
   taken once at that statement's start. Postgres's EvalPlanQual mechanism
   re-checks ONLY the specific locked row against its latest committed
   version once the lock is granted — it does NOT refresh the snapshot for
   the rest of that same statement. The `COUNT(*)` subquery (over a
   different table from the locked row) still read the ORIGINAL, pre-wait
   snapshot even after the lock unblocked, and could miss a
   concurrently-committed insert. A dedicated concurrency test (5
   simultaneous `addMember` calls against a team with exactly 2 open
   slots) caught this immediately: 3 successes landed instead of 2. Fixed
   by reverting to attempt 1 (lock and insert as two separate statements,
   both inside one transaction) — the extra round trip is the price of
   correctness here, not an oversight to optimize away.

**Verified via `maxTeamSizeEnforcement.test.ts` (12 tests, isolated-run
clean, twice):** direct `addMember` blocked at capacity without touching
existing members' role changes; invite acceptance and join-request
approval both blocked at capacity while leaving the invite/request
`pending` (not silently consumed) so a later capacity increase lets a
retry succeed; and — the test that caught the race above — 5 concurrent
`addMember` calls against exactly 2 open slots produce exactly 2 successes
and 3 conflicts, never more.

### Finding 3 — a real, measured regression from Finding 2's own fix, caused and fixed within this same milestone

The correct (attempt-1) capacity check adds 3 extra network round trips
per membership-creation call (BEGIN, `SELECT...FOR UPDATE`, COMMIT, on top
of the original single INSERT). In isolation this is a few hundred
milliseconds. Stacked across `buildTeamWithRoles()` (the shared test
fixture used throughout `backend/tests/`, which calls `addMember` 4 times
per team) plus bcrypt's own real hashing cost per registration, this
pushed `teamMembershipConcurrency.test.ts`'s heaviest tests past Jest's
30-second per-test ceiling — confirmed as a genuine regression (not
pre-existing flakiness) by reverting the M47 diff via `git stash` and
observing the exact same test file pass 7/7 cleanly on the pre-M47 code,
then reproducing the failure 3 consecutive times on the M47 code before
diagnosing it.

**Fixed at the actual cost driver, not by touching Jest's timeout**
(forbidden by this project's own standing rule, and the wrong fix even if
it weren't): `buildTeamWithRoles()`'s 6 `registerAndLogin` calls have no
dependency on each other, and were running one at a time for no reason —
parallelized via `Promise.all` (`tests/utils/fixtures.ts`), the same
"reduce the fixture's own wall-clock cost" fix M39 already established
for this exact shape of problem. This bought back more wall-clock time
than the capacity check's extra round trip cost, and
`teamMembershipConcurrency.test.ts` passed cleanly (7/7) on two
consecutive isolated re-runs afterward.

### Finding 4 — database connection pool: `connectionTimeoutMillis` was measurably too tight; `statement_timeout` was completely unset

**Pool architecture confirmed:** one shared `pg.Pool` (`max: 20`,
`utils/database.ts`), used by every repository through `db/client.ts`'s
`query`/`queryOne`/`withTransaction` helpers, which always `.connect()`
then `.release()` in a `finally` block — verified no connection-leak path
exists (every call site was re-checked, not assumed). The backend deploys
to Vercel as a Node serverless function (`backend/vercel.json`); the
configured `DATABASE_URL` (dev/test) points at Neon's own **pooled**
endpoint (hostname contains `-pooler`), which is the correct choice for a
serverless topology where each function instance may run its own
independent `pg.Pool` — the "one shared 20-connection pool" framing used
throughout M40-M46 describes the app-level client pool correctly, but the
REAL multiplexing against Postgres itself happens at Neon's pooler layer,
one level below what this app's own code controls. This app-level detail
could not be fully verified against the live Vercel/Neon account
configuration (outside this audit's access) and should be confirmed
operationally, not assumed, before treating any pool-size number as final.

**`statement_timeout` was not configured anywhere** — a residual M45
explicitly flagged but didn't fix. `wouldCreateCycle`/the cycle-safe CTE
rewrite prevent the ONE known unbounded-recursion shape at the point a
cycle could be written, but nothing bounded how long ANY query could hold
one of the 20 shared connections. Added `statement_timeout: 30000` to the
pool config — generous for every real query in this app, a real backstop
against a future runaway one.

**`connectionTimeoutMillis: 5000` was measurably too tight — this is a
genuine finding, not a tuning guess.** Direct, repeated measurement
(a bare `pg.Pool` connecting straight to the real Neon endpoint, bypassing
every layer of this app's own code) showed fresh-connection establishment
taking 5.2-11.5 seconds under the network conditions encountered during
this milestone's own test runs — a meaningful fraction of which would be
flatly rejected by a 5-second ceiling, not because anything was overloaded
(a single connection, checked via `pg_stat_activity`, confirmed no
concurrent contention) but because that is simply how long a connection
can legitimately take against a serverless-autosuspend database provider.
Bumped to `connectionTimeoutMillis: 10000` — still a real ceiling, just
one reflecting measured reality instead of an arbitrary round number.

### Finding 5 — realistic load/capacity testing: methodology and tooling delivered; clean numeric results blocked by a live, independently-confirmed Neon connectivity episode

A load-test harness (`backend/scripts/loadTest.ts`, kept as a reusable
tool, not a one-off) seeds N teams with real members/logs/blockers/goals,
then fires an increasing number of concurrent "ordinary session" bundles
(login + `GET /teams/my` + `GET /logs/standup` + `GET /teams/:id/blockers`
+ `GET /goals/hierarchy` + `GET /leaderboard` — the exact endpoints M46
hardened against N+1 fan-out) against the real Express app + local test
database, measuring success rate, p50/p95/p99 latency, and the shared
pool's own `waitingCount`.

**An early, buggy run surfaced two script-level bugs worth recording
because they'd otherwise be mistaken for app bugs:** (1) `addMember` calls
made during seeding weren't checked for success before their token was
added to the "confirmed members" list — under concurrent seeding load, a
failed add still left a token that later produced a correct-but-confusing
403 on every team-scoped read, looking exactly like an app-side capacity
bug. Fixed by checking each `addMember` call's actual HTTP status before
trusting it. (2) The first version's seeding had no per-team error
isolation, so one team's transient failure crashed the whole seeding
loop. Fixed with a try/catch per team and an explicit skipped-team count
(never a silent truncation — logged).

**A severe, live Neon connectivity episode delayed but did not ultimately
block clean results.** Partway through this milestone's own verification,
the live connection to Neon degraded severely and persistently for over an
hour: a hard DNS resolution failure (`getaddrinfo ENOTFOUND ...neon.tech`),
repeated raw `Connection terminated due to connection timeout`/`Connection
terminated unexpectedly` errors from the `pg` driver itself (reproduced by
calling `authService.register()` directly, bypassing the HTTP layer,
controller, and every app-level retry/pool setting), and
connection-establishment times of 5.2-11.8 seconds measured directly and
repeatedly. This is the same class of severe, environmental instability
this project has documented before (M37's operational note,
`PROJECT_HANDOFF.md` §9) — confirmed here with an unusually direct,
code-bypassing measurement, not inferred from test failure patterns alone.
Connectivity later recovered (confirmed via the same direct measurement,
back to ~1.5s) and the load test was re-run cleanly to completion.

**Final results (30 teams, 240 members, real logs/blockers/goals seeded,
against the local test database with a healthy Neon connection):**

| Concurrency | Requests | Success rate | `GET /teams/my` p50/p95 | `GET /logs/standup` p50/p95 | Peak pool `waitingCount` |
|---|---|---|---|---|---|
| 25 sessions | 125 | **100%** | 859ms / 2005ms | 1666ms / 1801ms | 16 |
| 50 sessions | 250 | **100%** | 946ms / 1132ms | 2737ms / 2959ms | 73 |
| 100 sessions | 500 | **100%** | 1784ms / 2195ms | 5416ms / 5502ms | 174 |
| 200 sessions | 1000 | **100%** | 3597ms / 4430ms | 10591ms / 10638ms | 377 |

**Zero functional failures at any tested concurrency level** — every one
of 1,875 requests across all four levels succeeded, including at 200
concurrent sessions (roughly 2-4x the simultaneous-active-user count a
50-100 team deployment would realistically produce even at a worst-case
"everyone checks in at 9am" peak, given not every member of every team is
active in the same instant). The pool degrades LATENCY under load, not
correctness — no error, no dropped request, no timeout was observed even
as queuing pressure (`waitingCount`) grew to 377 at the heaviest level
tested. This is the graceful-degradation shape a capacity-constrained but
correctly-implemented shared resource should have, not a capacity failure.

**What this means for the pool-size question:** 20 connections comfortably
serves 25-50 concurrent sessions (sub-3-second p95 on every endpoint) and
still correctly serves 100-200 concurrent sessions, at the cost of
multi-second latency on the heaviest endpoint (`getStandup`, which is also
the one M46 already batch-loaded and this milestone confirmed still
correct under load). This is real, measured evidence — not a guess — that
20 is *adequate but not generous* for the stated 50-100+ team target: safe
today, worth revisiting (a pool-size increase, or splitting read-heavy
endpoints onto a dedicated smaller pool) if actual production usage
consistently clusters near the 100-200-concurrent-session end of what was
tested here.

**Reusable checklist question:** *When a load test's own numbers look
wrong (impossible success/failure patterns, latencies that don't scale
smoothly with concurrency), check the load-test SCRIPT for a bug before
concluding the application has one — an unchecked setup-phase HTTP call
whose failure silently propagates into later assertions produces exactly
the same symptom shape as a real capacity bug. Separately: when a
database-heavy test suite shows severe, widespread instability that
doesn't correlate with the code actually under test, get ONE piece of
direct, code-bypassing evidence (a bare driver connection with precise
timing) before spending further effort chasing what might be an
environmental problem no code change can fix.*

### Finding 6 — dependency vulnerability scan: already running in CI since M16, not "never run"; two known backend findings re-confirmed, two new frontend findings triaged

M46's own classification stated `npm audit` "has never been run and
reported on in this project's history." **This was incorrect** —
`.github/workflows/ci.yml` has run `npm audit` on every push/PR for both
backend and frontend since M16, with `continue-on-error: true` (a
deliberate choice, not an oversight — see its own comment) because two
pre-existing findings were already known and triaged as of M7. Re-running
it manually as part of this milestone re-confirmed those two and found
two new frontend ones:

- **Backend (re-confirmed, unchanged since M7):** `bcrypt` (a direct,
  necessary dependency) pulls in `@mapbox/node-pre-gyp`, which pulls in a
  vulnerable `tar` (1 high, 1 critical — path traversal / DoS issues in
  tar extraction). This tool runs ONLY at `npm install` time, to fetch
  bcrypt's prebuilt native binary — it is never imported or executed by
  the running application. `npm audit fix` (non-forced) makes no change;
  the only fix path is a major-version bump to `bcrypt`/`node-pre-gyp`,
  which would need its own dedicated dependency-upgrade testing cycle for
  a library this central to authentication — correctly deferred, not
  forced through here.
- **Frontend (new since M16's original wiring — CVE dates confirm this):**
  `react-router-dom@6.30.4` (the latest 6.x release; no non-breaking fix
  exists) carries two CVEs: an open-redirect via a backslash in
  `<Link>`/`useNavigate`, and an arbitrary-constructor-injection via
  `deserializeErrors()` during SSR hydration. **Neither is exploitable in
  this app**, confirmed directly by Finding 1's own frontend audit: the
  open-redirect requires a navigation target built from user/URL-controlled
  input, and this codebase's audit already confirmed every `Link`/`navigate()`
  target is a hardcoded literal; the SSR-hydration vulnerability requires
  SSR, and this is a client-only Vite SPA with none. The fix requires a
  major-version bump to react-router v7 (breaking API changes) — deferred
  as a dedicated frontend dependency-upgrade task. `esbuild`'s separate
  moderate finding (a dev-server-only issue, irrelevant to the built
  production bundle) is likewise deferred, needing a breaking Vite major
  bump to resolve.

**Reusable checklist question:** *Before accepting a previous milestone's
claim that some standard check "has never been run," grep the CI
configuration for it first — a check that runs in CI but is deliberately
non-blocking (`continue-on-error`) can look, from a pure code-reading
audit, like it was never run at all.*

---

## 20. New authorization surface: team preview-by-ID (M48)

**Context:** M48 is a product-architecture milestone (multi-context
workspace foundation for classrooms/hackathons/companies), not a security
audit — but it added one new route, `GET /teams/:teamId/preview`, which
deliberately has neither `requireTeamMembership` nor `requireTeamRole`
nor an `is_public`/`is_discoverable` check. Recorded here because "a new
endpoint with no membership gate" is exactly the shape every prior
audit (M37, M41, M44) has flagged as a real vulnerability when found
elsewhere — this entry exists so a future audit doesn't have to
re-derive from scratch whether this one is the same class or a deliberate
exception.

**Why this one is not the same class:** `POST /teams/:teamId/join`
(`teams.service.ts`'s `requestJoin`, present since early milestones) has
never had a membership/role/discoverability gate either — knowing a
`team_id` and sending a join request has always been enough to queue a
request an owner/admin must explicitly approve, regardless of whether the
team is `is_public`/`is_discoverable`. `GET /teams/:teamId/preview` reveals
*strictly less* than what a caller could already learn by just calling
`requestJoin` and inspecting the team afterward via any membership-gated
endpoint once approved — it only front-loads a narrow, deliberately
minimal field set (`team_name`, `description`, `team_type`, `department`,
`is_public`, `is_discoverable`, `max_team_size`, `member_count`,
`owner.{full_name,username}`, `created_at`) so a caller can decide
whether to bother requesting at all. No member list, `permissions`,
`parent_team_id`, or child-resource data is exposed. Enumeration risk is
unchanged from M44's standing conclusion (`gen_random_uuid()` v4, ~122
bits of entropy — guessing a valid ID is infeasible; this only matters to
someone who already has a specific ID, the same precondition `requestJoin`
already required).

**What would reopen this:** if `requestJoin` ever gains a
membership/discoverability gate of its own (closing the precondition this
finding relies on), `getTeamPreview` would need the identical gate added
at the same time, or it would become a genuine gap. If the preview's
field set is ever widened (e.g., to include a member list preview),
re-run this same "does this reveal more than `requestJoin`'s own
precondition already allowed" analysis before shipping it.

**Reusable checklist question:** *Before flagging "an endpoint with no
membership gate" as an authorization bug, check whether an EXISTING,
already-reviewed endpoint already has the identical exposure as its own
established precondition — a new endpoint that reveals a strict subset of
what an existing, unchanged endpoint already allowed is not a new gap,
it's the same gap (already accepted) wearing a friendlier shape.*

---

## How to use this document

- Add a new numbered section per *vulnerability class*, not per milestone —
  if a class recurs, add evidence to its existing section instead of
  duplicating it.
- Every section should end with a **reusable checklist question** phrased so
  it can be asked cold, on a different codebase, without this project's
  context.
- This file is a checklist, not a changelog — `git log` is the changelog.
