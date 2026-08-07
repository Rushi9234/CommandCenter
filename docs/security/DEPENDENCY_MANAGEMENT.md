# Dependency Management & Supply Chain Security

## Why this exists

CommandCenter has no automated dependency-update or vulnerability
monitoring (confirmed during the pre-Milestone-13 architecture audit).
`npm audit` was run manually and ad hoc, at milestone boundaries, rather
than continuously. Milestone 12 committed lockfiles for the first time,
which pins the current dependency tree exactly -- meaning it will now
stay exactly as it is until something explicitly bumps it. This document,
GitHub Dependabot, and a CI audit step (Milestone 16) close that gap
using only free, native GitHub/npm tooling -- no paid scanning service,
no new vendor dependency.

## Dependency update process

1. Dependabot (`.github/dependabot.yml`) checks `backend/` and
   `frontend/`'s npm dependencies weekly and opens one PR per outdated
   package (or group, depending on Dependabot's own batching).
2. Each PR runs through the normal CI pipeline (`.github/workflows/ci.yml`)
   like any other change -- backend's `tsc --noEmit` / build / test, and
   frontend's build.
3. A human reviews and merges each PR. **Dependabot never auto-merges** --
   `dependabot.yml` has no auto-merge configuration, and none should be
   added without a deliberate decision to do so.

## Dependabot workflow

- **Ecosystem**: npm, for both `backend/` and `frontend/` independently
  (they have separate `package.json`/`package-lock.json` files and
  unrelated dependency trees).
- **Schedule**: weekly. Frequent enough to catch drift without generating
  a PR flood.
- **Scope**: Dependabot only opens PRs. It does not run `npm audit`,
  modify CI, or touch application code beyond `package.json`/
  `package-lock.json`.

## Vulnerability handling process

1. CI's "Dependency audit" step (added in both the `backend` and
   `frontend` jobs) runs `npm audit --audit-level=$AUDIT_LEVEL` on every
   push and pull request, so its output is visible in every CI run's log
   without needing to remember to check manually.
2. **This step is currently `continue-on-error: true`** -- it reports but
   does not fail the build. See "Severity policy" below for why, and what
   changes when that's revisited.
3. When a genuinely new finding appears (i.e., one that wasn't already
   known and accepted per the list below), it should be triaged before
   the next milestone begins:
   - Check whether a non-breaking `npm update`/version bump resolves it.
   - If the vulnerable path isn't actually reachable in this app's usage
     (as with the two findings below), document that explicitly here
     rather than silently ignoring it.
   - If neither applies, treat it as its own scoped fix -- don't bundle
     an unrelated dependency bump into an unrelated feature milestone.

## Severity policy

`AUDIT_LEVEL=high` in both CI jobs (`.github/workflows/ci.yml`) means the
audit step's own pass/fail logic (were `continue-on-error` not set) would
only trigger on high or critical findings -- moderate/low findings are
visible in the step's output but wouldn't fail the build even without
`continue-on-error`.

**Why `continue-on-error: true` is set today**: as of Milestone 16, this
repository has two known, pre-existing findings that predate this
milestone and haven't been individually triaged:

- **Backend**: 1 high + 1 critical, both tracing to `node-tar` via
  `@mapbox/node-pre-gyp`, a transitive dependency of `bcrypt`'s native
  build tooling (confirmed during Milestone 7 -- this is build-time
  tooling used to compile bcrypt's native module, not a runtime code path
  this application's own logic ever executes against untrusted input).
- **Frontend**: 3 moderate + 1 high, in the Vite/build-tooling dependency
  tree.

Failing every future PR's CI on these two *already-accepted* findings
would block unrelated work for a decision this milestone isn't scoped to
make. Once they're explicitly triaged (fixed, confirmed unreachable and
formally accepted with a tracked justification, or replaced), remove
`continue-on-error: true` from both jobs' "Dependency audit" step so the
`high` threshold actually enforces itself against any *new* finding.

To tighten or loosen the threshold later, change `AUDIT_LEVEL` in
`ci.yml` (one line per job) -- e.g. `moderate` to catch more, `critical`
to catch less.

## Rollback approach

- **`dependabot.yml`**: delete the file. Dependabot stops opening PRs;
  nothing about the running application changes.
- **CI audit step**: remove the "Dependency audit" step from either job in
  `ci.yml`. Since it's `continue-on-error: true` today, removing it also
  can't change whether any build currently passes or fails.
- **This document**: informational only: no code depends on it.

Every piece here is additive and independently reversible -- none of it
touches application source, the database, migrations, or any API
contract.
