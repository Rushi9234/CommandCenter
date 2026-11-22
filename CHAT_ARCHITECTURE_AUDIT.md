# CommandCenter Chat — Architecture Audit & V1 Design Proposal

Status: **AUDIT ONLY — no code, migrations, or routes implemented.** This document is the basis for approving a Chat V1 implementation plan. Nothing in this file has been committed or pushed.

---

## A. Current Architecture Findings

### A.1 Backend layering (established, must be followed)
Every module (`backend/src/modules/<name>/`) is: `<name>.routes.ts` → `<name>.controller.ts` (thin) → `<name>.service.ts` (business logic) → `<name>.repository.ts` (all SQL) + `<name>.dto.ts` (zod schemas). Routes chain: `authenticate` → rate limiter → `validate(schema)` → `asyncHandler(controller.fn)`. Response envelope (`common/http/respond.ts`): `{ success: true, message?, data? }` via `ok()`/`created()`. Errors: `AppError` subclasses (`BadRequestError`/`UnauthorizedError`/`ForbiddenError`/`NotFoundError`/`ConflictError`) thrown from service/repository, caught centrally by `errorHandler.ts`, rendered as `{ error: string }`. Validation is zod, via a `validate()` middleware.

### A.2 Authentication / authorization
JWT payload: `{ userId, role, pwv?, ecv?, iat, exp }`. `authenticate` middleware sets `req.user = { userId, role }` — **no team_id on the token**; all team-scoped checks are live DB queries per request. Two authorization primitives exist:
- `authorize(...roles)` — coarse global-role gate.
- `requireTeamRole(resolveTeamId, allowedRoles)` / `requireTeamMembership(resolveTeamId)` (`common/middleware/requireTeamRole.ts`) — resolves a team ID from params/body/query, calls `teamsRepository.getMemberRole(userId, teamId)` (a **fresh, uncached DB query every request**), 404s if team missing, 403s if not a member or wrong role.

Rate limiting: `RateLimitProvider` abstraction, never `express-rate-limit` imported directly. **BUG-003 lesson (verified still enforced everywhere)**: any per-user limiter's `keyGenerator` reads `req.user.userId`, so it must be mounted **after** `authenticate` on the specific route, never globally — otherwise it silently degrades to a shared-IP bucket.

### A.3 Teams + membership (the authoritative source)
- `team_members(team_id, user_id, role CHECK IN ('owner','admin','manager','member','viewer'), UNIQUE(team_id,user_id))`. **No soft delete** — removal is a hard `DELETE`, so `getMemberRole(userId, teamId)` returning a row is always a live, current, correct answer to "can this user act as a member of this team right now."
- `teams.parent_team_id` (self-referential FK) models hierarchy. Parent-team membership **never** implicitly grants access to a child team's own resources (explicit Milestone 50 rule). The one exception (Milestone 51 "coordinator dashboard") is narrow, read-only, aggregate-counts-only, and gated by ordinary `requireTeamRole` on the parent team's own ID — it is not a general access-inheritance mechanism and must not be treated as precedent for chat.
- **Conclusion: `team_members` (live-queried) is the sole authoritative source for "can user X participate in team Y's chat."** No caching, no derived/materialized permission table should be trusted for authorization.

### A.4 Realtime (SSE)
- Single in-process `InMemoryRealtimeProvider` (`backend/src/realtime/`): a `Set<Subscription>` of `{ userId, teamIds, subscriber, deliveredEventIds }`. `publish(event)` where `event = { id, type, occurredAt, teamId?, recipientUserId? }` delivers to a subscription if `event.recipientUserId === subscription.userId` OR `subscription.teamIds.has(event.teamId)`.
- Every existing event (`join_request.*`, `blocker.*`, `notification.created`, `task.*`, `goal.*`) is deliberately **thin** — a signal to refetch, never the payload itself.
- **Confirmed: no Redis/queue/cross-instance mechanism exists at all.** This is single-backend-process only. An event published on instance A never reaches a client connected to instance B. This is a pre-existing platform limitation, not something Chat should attempt to fix.
- Frontend: one shared singleton connection (`useRealtime` + `services/realtime.ts`), `fetch()`-based streaming (not native `EventSource`, so it can send `Authorization: Bearer`), exponential backoff reconnect (1s→30s cap), pauses on `document.hidden`, dedups by event `id`.

### A.5 Notifications
- `notifications` table: free-text `category`, entity-ref columns (`team_id/project_id/goal_id/task_id/blocker_id`, all `SET NULL` on delete), `read_at` (NULL = unread). Preferences are a JSONB column on `users`, checked against a small `NOTIFICATION_PREFERENCE_KEYS` array (coarser groups than `category`).
- `notifyUser(params)` — always awaited, never throws (best-effort, logged on failure), writes the DB row **and** publishes a thin `notification.created` SSE ping in the same call. Silently no-ops if the recipient disabled that preference group.
- Recipients are always computed server-side from trusted data (never client input) — either a direct `recipientUserId` or `notifyTeamMembersByRole(teamId, roles, ...)`.
- Deep-linking: `notificationDestination.ts` maps `category` prefix (`team.`/`goal.`/`task.`/`blocker.`) to a flat route + query params; `NotificationBell.tsx` navigates on click. No `chat.` prefix exists yet — this is the exact extension point.

### A.6 Frontend navigation/layout
- All routes are flat, no dynamic segments (`/teams`, `/goals`, etc.) — deep links use query strings, by existing convention.
- `Sidebar.tsx` already has a **disabled placeholder**: `{ path: '#chat', label: 'Chat', tourTarget: 'chat' }` under a "Workspace" section. Any path starting with `#` and not `isButton` renders disabled (`cursor-not-allowed`, click prevented).
- Shared panel styling: `.pro-card` / `.pro-card-hover` (`styles/index.css`), used across every existing page — Chat UI should reuse this, not invent new panel styling.
- `Navigation.tsx` top bar has a `NotificationBell` and profile menu; a "global search" placeholder already exists center-aligned (unused today).
- The global Quick Overview (`SpotlightTour.tsx`) already has a "Chat (Coming Soon)" step targeting this same disabled stub (added just prior to this audit).

### A.7 Roadmap docs — already-recorded constraints (must be honored, not rediscovered)
- `COMMANDCENTER_PRODUCT_ROADMAP.md` "Chat Security (When Implemented)" checklist (already written, verbatim): participant list validation, message authorization at **retrieval time** (not just creation), team-membership enforcement, attachment security (deferred — no attachments in V1), conversation deletion cascade, **do not claim E2EE unless implemented**.
- Explicit open questions already on record: DMs-only-vs-team-chat, threaded-vs-flat, attachment scope, E2EE (resolved: no), moderation/abuse controls, retention policy. Section B below resolves each explicitly.
- A `messages` table **already exists** in `schema.sql`, scoped to blocker comment threads (`blocker_id` FK). A new chat table must use a distinct name (`chat_messages`) to avoid collision/confusion. An unrelated `POST /api/ai/chat` (AI assistant) endpoint already exists — a human Chat feature must live under a clearly distinct path (e.g. `/api/chat/...`, no collision, but worth calling out so nobody conflates the two).

---

## B. Recommended Chat V1 Architecture — scope decisions

Resolving the roadmap's own open questions, deliberately minimal per the "no unnecessary complexity" instruction:

| Question | V1 Decision | Why |
|---|---|---|
| DMs only or + team chat? | **Both** — direct (1:1) and one canonical group conversation per team | Explicit product intent |
| Threaded or flat? | **Flat** | No stated need; threads add real complexity |
| Attachments? | **None in V1** | No virus-scan/storage infra audited yet; explicitly deferred |
| E2EE? | **Not implemented, not claimed.** Messages are private to participants and authorized server-side, transported over TLS. | Roadmap explicitly forbids a false claim |
| Edit/delete messages? | **None in V1** — messages are immutable once sent | No stated requirement; removes an entire class of "who can still see the edited/deleted version" complexity |
| Moderation (mute/block/report)? | **None in V1** beyond authorization + rate limiting | Explicitly deferred, flagged as an accepted V1 gap |
| Retention policy? | **Indefinite in V1** (cascade-deletes only if the team itself is deleted) | Revisit only if/when compliance requires it |
| Can any two users DM, or only teammates? | **Restrict to users who share at least one team** | Prevents cold-DM spam between strangers on a workplace tool; consistent with "strict participant/team authorization" |

---

## C. Database Model Proposal (design only — no migration created)

```sql
-- One row per direct (1:1) or team (group) conversation.
CREATE TABLE conversations (
    conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('direct', 'team')),
    team_id UUID NULL REFERENCES teams(team_id) ON DELETE CASCADE,       -- set only when type='team'
    direct_pair_key VARCHAR(73) NULL,                                    -- set only when type='direct': '<smaller_user_id>:<larger_user_id>'
    created_by UUID NOT NULL REFERENCES users(user_id),
    last_message_at TIMESTAMP NULL,                                      -- denormalized for conversation-list ordering
    last_message_preview VARCHAR(200) NULL,                              -- denormalized, plain text, truncated
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_conversations_team_unique ON conversations(team_id) WHERE type = 'team';
CREATE UNIQUE INDEX idx_conversations_direct_pair_unique ON conversations(direct_pair_key) WHERE type = 'direct';

-- Only needed for DIRECT conversations' fixed 2 participants, and as a per-user
-- read-cursor cache for BOTH types. NOT the authorization source for team chat
-- (see rationale below) — it is only ever a cache/cursor there.
CREATE TABLE conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    last_read_seq BIGINT NULL,
    last_read_at TIMESTAMP NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_conversation_participants_user ON conversation_participants(user_id);

-- Named distinctly from the existing blocker-comment `messages` table.
CREATE TABLE chat_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seq BIGSERIAL NOT NULL,                          -- global monotonic cursor value (UUIDs aren't sortable)
    conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_chat_messages_conversation_seq ON chat_messages(conversation_id, seq DESC);
```

### C.1 The key authorization design decision: don't materialize team participants
For **team** conversations, `conversation_participants` rows are *never* the source of authorization — only a lazily-created read-cursor cache. Authorization for a team conversation is always "does `team_members` currently have a row for `(user_id, conversations.team_id)`" — the exact same live query `requireTeamRole`/`getMemberRole` already does. This means:
- A removed team member loses chat access **instantly**, automatically, with zero new code to keep anything in sync (there is nothing to desync — `team_members` already hard-deletes on removal).
- No membership-materialization job, no stale-row risk, no double-source-of-truth bug class.

For **direct** conversations, the 2 rows in `conversation_participants` *are* authoritative (fixed for the conversation's lifetime in V1 — no leave/remove concept for DMs).

### C.2 Preventing the specific risks the task asked about
- **Unauthorized reads/sends**: every message endpoint re-verifies participation live, server-side, on every request — never trusts a client-supplied `conversation_id` alone.
- **Foreign-team access**: team-conversation checks join through `conversations.team_id → team_members`; a user with no row in `team_members` for that `team_id` gets no access, full stop — no parent-team shortcut (per Milestone 50 rule).
- **ID enumeration / data leakage**: `conversation_id`/`message_id` are `gen_random_uuid()` (non-sequential, non-guessable). A non-participant requesting any conversation-scoped endpoint gets **404**, not 403 — deliberately different from the existing team-role convention (which 403s, because teams are semi-public/discoverable) — because conversation existence itself should not be confirmable to a non-participant.
- **Deleted/inactive participant access**: for team chat this is automatic (see C.1). For direct chat, V1 has no removal concept, so this risk doesn't yet exist there — flagged as future work only if "leave a DM" is ever added.

### C.3 Indexes / retention
- `idx_chat_messages_conversation_seq (conversation_id, seq DESC)` is the only index needed for both message pagination and unread counting.
- Retention: V1 keeps messages indefinitely; a team's conversation (and its messages) cascade-delete automatically only if the team itself is deleted (existing `ON DELETE CASCADE` behavior, nothing new to build).

---

## D. API Design (proposed — no routes created)

New module `backend/src/modules/chat/` (routes/controller/service/repository/dto), mounted at `/api/chat`.

| Endpoint | Authorization | Validation | Response shape | Pagination | Key index used |
|---|---|---|---|---|---|
| `GET /api/chat/conversations` | `authenticate` only; query filtered to caller's own rows | — | `{ success, data: [{ conversation_id, type, team_id?, team_name?, other_user?, last_message_preview, last_message_at, unread_count }] }` | None needed (bounded by user's team+DM count); cap `LIMIT 100` | `idx_conversation_participants_user`, `idx_team_members_user` |
| `POST /api/chat/conversations/direct` `{ other_user_id }` | shared-team check: caller and target must share ≥1 `team_members` row | `other_user_id` is a valid UUID, not self | `{ data: conversation }` | n/a | `idx_conversations_direct_pair_unique` (atomic get-or-create via `INSERT ... ON CONFLICT ... DO NOTHING RETURNING *` + fallback select) |
| `POST /api/chat/conversations/team/:teamId` | `requireTeamMembership(teamIdFromParams)` | — | `{ data: conversation }` | n/a | `idx_conversations_team_unique` (same atomic get-or-create pattern) |
| `GET /api/chat/conversations/:id/messages?cursor&limit` | `requireConversationParticipant` (new middleware, live-checks per C.1) — **404** if not authorized | `limit` capped at 100 | `{ data: { messages: [...], next_cursor: seq \| null } }` | Cursor = `seq`; `WHERE conversation_id=$1 AND seq < $cursor ORDER BY seq DESC LIMIT $limit` | `idx_chat_messages_conversation_seq` |
| `POST /api/chat/conversations/:id/messages` `{ body }` | `requireConversationParticipant`, 404 if not authorized; per-user rate limit (mounted after `authenticate`, per BUG-003) | `body`: 1–4000 chars, trimmed, non-empty | `{ data: message }` | n/a | insert only; updates `conversations.last_message_at/preview` in the same transaction |
| `POST /api/chat/conversations/:id/read` `{ up_to_seq? }` | `requireConversationParticipant` | `up_to_seq` optional, defaults to latest | `{ success: true }` | n/a | upsert on `conversation_participants` PK |
| `GET /api/chat/unread-count` | `authenticate` only | — | `{ data: { total: number } }` | n/a | same indexes as list-conversations, single aggregate query |

`sender_user_id` is **always** `req.user.userId` server-side — never accepted from the request body (matches every existing module's pattern).

---

## E. Frontend UX Proposal

- Sidebar's existing `#chat` stub becomes a real route `/chat` (drop the `#`, keep `tourTarget: 'chat'` already in place; the "disabled" styling naturally disappears since the path no longer starts with `#`).
- Deep-link shape follows the app's existing flat-route/query-string convention: `/chat?conversation=<id>` — this lets a future `chat.` notification-category slot directly into the existing `notificationDestination.ts` mechanism with zero new deep-linking infrastructure.
- Layout: two-pane on desktop (conversation list, `.pro-card` styled rows, left; active thread + composer, right), single-pane on mobile with a back-navigation toggle — mirrors the `lg:` breakpoint convention already used in `Sidebar.tsx`.
- States: empty ("Start a conversation" CTA listing teammates/teams), loading (match whatever simple loading pattern existing pages already use — no new skeleton-loader system), error (reuse existing inline-error convention from Profile/Teams, no new toast system).
- Unread indicators: a badge on the Sidebar "Chat" item (new, small addition — Sidebar has no badge mechanism today) and a per-row unread count in the conversation list.
- Accessibility: `aria-live="polite"` region for incoming messages, labeled composer textarea, Enter-to-send/Shift+Enter-for-newline, focus management on conversation switch.
- Realtime: a `useChatRealtime`-style consumer (same callback-filter pattern as `Teams.tsx`/`NotificationBell.tsx`) listening for `chat.message_created`, refetching messages if that conversation is open, else just bumping unread count/list order.

---

## F. Realtime Design

- **No new realtime primitive.** Reuse `InMemoryRealtimeProvider` exactly as-is: publish `chat.message_created` with `{ teamId }` for team conversations (existing team-fanout logic handles it unmodified), and one `{ recipientUserId }` event per participant for direct conversations (same pattern `notifyUser` already uses for targeted delivery).
- **Deliberately thin, consistent with every existing event**: the event carries only enough to identify *which* conversation changed, never the message body. Clients refetch via the paginated messages endpoint. This is a conscious consistency + security choice (message content never has to pass through the realtime layer, logs, or `deliveredEventIds` dedup structures), not an oversight.
- **Multi-instance limitation is inherited unchanged.** If CommandCenter is ever deployed across multiple backend instances, chat delivery (like every other realtime feature) will silently stop fanning out cross-instance. This is a pre-existing platform constraint; fixing it (e.g. Redis pub/sub) should be a separate infra task, never bundled into Chat V1 scope.

---

## G. Security / Privacy Threat Model

**Required for V1** (all directly map to the roadmap's pre-written "Chat Security (When Implemented)" checklist):
- IDOR — every conversation/message query re-verifies live authorization server-side; conversation IDs are never trusted from the client alone.
- Unauthorized conversation/team access — 404 (not 403) for non-participants; team-chat checks always re-query `team_members` live, no caching, no parent-team shortcut.
- Participant removal — automatic for team chat (C.1); no removal concept yet for DMs (V1 has none, so no gap to close there yet).
- Message spoofing — `sender_user_id` always server-derived from `req.user.userId`.
- Cross-tenant/team leakage — every message query is scoped by `conversation_id` plus a live participant check; no cross-conversation query paths exist.
- XSS — message `body` is plain `TEXT`, rendered via React's default escaping; explicit rule: never `dangerouslySetInnerHTML` on message content.
- Rate limiting/spam — per-user message-send limiter, mounted after `authenticate` (BUG-003-compliant); lighter limiter on conversation-create endpoints.
- Notification leakage — chat notifications carry a generic preview ("New message from X"), not full message content, keeping `chat_messages` the single source of truth for content.
- Retention/deletion — documented as indefinite in V1 (see B); cascade-delete only via existing team-deletion FK behavior, nothing new to build.

**Explicitly deferred for V1** (flagged as accepted gaps, not oversights): attachment security (no attachments exist), mute/block/report/spam-abuse controls beyond rate limiting, message edit/delete (and therefore no "edited/deleted message visibility" question), E2EE (explicitly never claimed).

### Chat Historical Membership Privacy (Implemented & Verified in Task #4 & Task #9)

*Status: Fully Implemented and Empirically Verified in Task #4 and Cross-Surface Audited in Task #9.*

- **Pre-membership message boundary**: A new member joining a team CANNOT see team-chat messages created before that user's membership start timestamp (`created_at >= tm.joined_at`).
- **Immediate removal revocation**: Removing a user from a team revokes team-chat access immediately across all endpoints (returns 404).
- **Rejoin epoch rule**: Rejoining a team starts a new active membership epoch (`joined_at = CURRENT_TIMESTAMP`), preventing access to messages from previous membership epochs.
- **Existing member retention**: Messages legitimately created while a member was authorized remain visible to other authorized members.
- **Cross-surface boundary enforcement**: Messages endpoint (`listMessages`), conversation list & unread count (`listConversationsForUser`), read-state (`markConversationRead`), pagination, SSE realtime events, notifications, search (N/A), AI retrieval, and React state caching all consistently enforce the exact same database-level historical membership boundary without side-channel data leakage. Verified by attack matrix suite (`chatHistoricalPrivacy.test.ts`).

---

## H. Testing Strategy (backend-focused authorization matrix + frontend)

Backend (`chat.test.ts`, following the existing `phoneVerification.test.ts`/`emailChange.test.ts` style — full authorization matrix, run once against the Docker CI-parity Postgres):
1. Sender can send a message in a conversation they're a participant of.
2. Recipient/participant can read messages in that conversation.
3. Non-participant cannot read (404) a direct conversation they're not part of.
4. Non-participant cannot send (404) to a conversation they're not part of.
5. Foreign-team user cannot access another team's team-conversation (404).
6. A user removed from `team_members` immediately loses access to that team's conversation (no stale access).
7. Direct-conversation participant set is fixed — a third user cannot be added or gain access.
8. Get-or-create direct conversation is idempotent (calling twice returns the same `conversation_id`, no duplicate rows) — including a concurrent-request race test against the partial unique index.
9. Get-or-create team conversation is idempotent, same race-safety test.
10. Message pagination: cursor correctness across pages, `limit` cap enforcement, empty-conversation case.
11. Malformed/oversized input: empty body rejected, >4000-char body rejected, invalid UUIDs rejected.
12. Realtime event authorization: only participants' active subscriptions receive `chat.message_created` (existing `InMemoryRealtimeProvider` delivery-matching logic exercised, not reimplemented).
13. Notification behavior: preference-gated (a user who disabled the chat preference group receives no notification row/event), recipient correctly excludes the sender.
14. Rate limiter mounts after `authenticate` (a BUG-003-style regression test, matching the pattern already used for other per-user limiters).

Frontend: conversation list renders/updates on realtime event, message send/optimistic-or-refetch flow, empty/loading/error states, unread badge updates, mobile single-pane navigation, accessibility (`aria-live` announces new messages).

---

## I. Deferred Features (explicitly out of V1 scope)
Attachments, message reactions, threaded replies, typing indicators, read receipts (beyond the simple last-read cursor/unread count), message search, message edit/delete, E2EE, mute/block/report/abuse tooling, multi-instance realtime fan-out (Redis/queue infra).

---

## J. Blockers / Dependencies
- **None are technical blockers.** Findings requiring a decision, not an infrastructure fix:
  - New table must be named `chat_messages`, distinct from the existing blocker-comment `messages` table.
  - New route prefix `/api/chat/...` is clear of the existing unrelated `/api/ai/chat` (AI assistant) endpoint — worth calling out so the two are never confused in code or docs.
  - `NOTIFICATION_PREFERENCE_KEYS` needs one new key (e.g. `chat_message`) — same low-risk pattern as the `email_change`/`phone_verification` additions.
  - The existing disabled Sidebar `#chat` stub and the SpotlightTour "Chat (Coming Soon)" step will need a small follow-up update once Chat ships (enable the link, update the tour copy) — not a blocker, just a noted followup for the commit that ships V1.
  - Section B's scope table is this audit's proposed resolution to the roadmap's previously-open design questions; it should be explicitly confirmed (or amended) before implementation starts.

---

## K. Recommended Implementation Order

1. **Database schema** — `conversations`, `conversation_participants`, `chat_messages`, all indexes and partial-unique constraints (migration + `schema.sql` sync). No routes yet.
2. **Backend module scaffolding** — `chat.repository.ts` (all SQL, including the atomic get-or-create patterns), `chat.dto.ts` (zod), `requireConversationParticipant` middleware, `chat.service.ts`, `chat.controller.ts`, `chat.routes.ts`. Start with conversation list/get-or-create endpoints only.
3. **Messages** — send/list endpoints, rate limiting, `chat.message_created` realtime event, `notifyUser` integration with the new `chat_message` preference key.
4. **Backend test suite** — the full authorization matrix in section H, verified against the Docker CI-parity Postgres container (per this project's established verification discipline).
5. **Frontend** — real `/chat` route, Sidebar enablement, conversation list, message panel, composer, realtime wiring, unread badge.
6. **Frontend tests** — focused suite, then one full-suite run, `tsc --noEmit`, production build.
7. **Documentation** — update `COMMANDCENTER_TASK_STATE.md`/`COMMANDCENTER_PRODUCT_ROADMAP.md`/`MASTER_COMMANDCENTER_INVENTORY.md` to reflect Chat V1 shipped and the deferred-features list.

---

## Final Recommendation

**Start with Task 1: the database schema design (section C), as its own standalone, reviewable unit — write and review the migration + `schema.sql` diff for `conversations`, `conversation_participants`, and `chat_messages` before any service/controller/route code is written.**

Everything downstream (the authorization middleware, every API endpoint, the realtime event shape, the frontend contract) depends on this schema being correct — in particular, the decision in C.1 (team-chat authorization is a live `team_members` query, never a materialized participant table) is the single most consequential design choice in this whole audit, and it should be explicitly signed off on before any code exists that assumes it.
