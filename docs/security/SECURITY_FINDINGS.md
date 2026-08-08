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

## How to use this document

- Add a new numbered section per *vulnerability class*, not per milestone —
  if a class recurs, add evidence to its existing section instead of
  duplicating it.
- Every section should end with a **reusable checklist question** phrased so
  it can be asked cold, on a different codebase, without this project's
  context.
- This file is a checklist, not a changelog — `git log` is the changelog.
