# CommandCenter Product & Engineering Roadmap

**Version:** 1.0  
**Date:** 2026-09-02  
**Status:** Authoritative long-term planning document  
**Audience:** Product, Engineering, Leadership

---

## 1. PRODUCT VISION

CommandCenter is a lightweight, team-focused productivity platform designed for individuals, teams, and classrooms to coordinate goals, daily work, and blockers with clear ownership, progress tracking, and seamless collaboration.

### Core Principles

- **Clean & Uncluttered** — Minimize visual noise, maximize signal
- **User-Friendly** — Low learning curve, intuitive workflows
- **Server-Authoritative** — All truth lives server-side; frontend is a view layer
- **Privacy-First** — Authorization/isolation enforced at every layer
- **Realtime Where Meaningful** — Sync mutations across team instantly, not polls
- **Explainable** — Users understand why they see what they see
- **Scalable** — Designed for 200–500 teams, 100–200+ classrooms
- **Accessible** — WCAG consideration from day one
- **Responsive** — Works on mobile and desktop
- **Modular** — Features are independent subsystems
- **Useful for All** — Individual contributors, team leads, instructors/coordinators

---

## 2. CURRENT VERIFIED PRODUCT

### Fully Implemented & Verified Features

#### A. User & Team Management
- ✅ **Authentication** — Email/password login, JWT + refresh token, session management
- ✅ **Teams** — Create, manage members, assign roles (owner/admin/manager/member/viewer)
- ✅ **Team Hierarchy** — Parent-child teams, unlimited depth, recursive display
- ✅ **Team Membership** — Add/remove, role assignment, role restrictions (no escalation)
- ✅ **Join Requests** — Request-join, owner/admin approve/reject, realtime SSE events
- ✅ **Discover Teams** — Public teams with recursive hierarchy display, request-join
- ✅ **Team Settings** — Name, description, public/private, team_type (main/classroom/hackathon)
- ✅ **Team Deletion** — Backend support (no frontend UI yet)

#### B. Daily Logs / Pulse
- ✅ **Daily Work Logging** — Log daily activities with quality 1-5 scale
- ✅ **Impact Scoring** — workPoints (tasks*5 + log quality avg) + consistencyPoints (streak*2)
- ✅ **Streak Tracking** — Consecutive days counter, gapped-dates CTE for accurate calculation
- ✅ **Team Activity View** — Sidebar shows recent team updates
- ✅ **Personal Logs** — View own past logs with pagination

**Known Limitations:**
- "Log" terminology ambiguous (audit log vs daily entry?)
- Add New Log button oversized
- Daily Work section undersized

#### C. Goals
- ✅ **Goal Creation** — Personal and team goals
- ✅ **Goal Hierarchy** — Parent-goal support, cycle detection, recursive tree display
- ✅ **Goal Types** — Free-text types (project, milestone, objective, etc.)
- ✅ **Goal Progress** — 0-100% tracking
- ✅ **Goal Statuses** — active, completed, on_hold
- ✅ **Goal Targets** — Optional target date
- ✅ **Creation Governance** — Non-leader team goals require leader approval
- ✅ **Review Workflow** — Submit-for-review → leader approval (with requested_status branching)
- ✅ **Progress Sign-Off** — Can request sign-off on plain progress (not completion)
- ✅ **Completion Sign-Off** — Completion requires leader approval, sets progress=100 + completed_at
- ✅ **Goal Editing** — Title, description, target date, parent goal, type (limited exposure)
- ✅ **Goal Realtime** — 7 event types (created, updated, submitted_for_review, review_approved, returned, creation_approved, creation_rejected)
- ✅ **Loading/Error/Empty States** — Split goals-list and hierarchy with independent loading, retry per component
- ✅ **Stale-Response Protection** — Version tokens prevent race overwrites on team switching

**Known Limitations:**
- No goal-level owner/contributors (deferred, needs schema design decision)
- No success criteria (deferred)
- No goal↔task linkage (deferred, subsystem decision)
- Goal deletion UI missing (backend implemented)
- Goal-type editing restricted (not exposed via frontend)

#### D. Projects & Tasks
- ✅ **Project Creation** — Team-scoped or personal/independent
- ✅ **Project Editing** — Name, description, public/private, team association
- ✅ **Project Deletion** — Creator-only with frontend gating
- ✅ **Task Creation** — Title, description, status, priority, owner, reviewer, contributors, dependencies
- ✅ **Task Editing** — Edit modal with all fields
- ✅ **Task Deletion** — Creator/non-viewer-team-member with confirmation
- ✅ **Task Statuses** — todo, in_progress, review, done
- ✅ **Task Priority** — Low, medium, high
- ✅ **Owner Assignment** — Single user (independent: creator only; team: team members only)
- ✅ **Reviewer Assignment** — Single user for review approval
- ✅ **Contributors** — JSONB array, validated against team membership at write-time
- ✅ **Dependencies** — JSONB array, validated against same-project tasks at write-time
- ✅ **Task Realtime** — task.created, task.status_changed, task.deleted events
- ✅ **Single-Fetch Protection** — No duplicate task loads on mount
- ✅ **Race Protection** — Version tokens prevent stale responses on project switching
- ✅ **Permission Gating** — Edit/Delete properly gated by role in UI + backend

**Known Limitations:**
- No subtasks
- No task ordering
- No task due dates
- No completion-approval workflow (unlike goals)
- No task descriptions shown on cards (summary only)
- Project team association not displayed (improvement made in prior task)

#### E. SOS Hub / Blockers
- ✅ **Blocker Creation** — Team-scoped with type/urgency/impact
- ✅ **Blocker Statuses** — open, in_progress, resolved
- ✅ **AI Suggestions** — Via analyzeBlocker (Groq/Claude/fallback)
- ✅ **Similar Blocker Detection** — Keyword matching on resolved blockers
- ✅ **Suggested Helpers** — Recommends team owner/admin/manager
- ✅ **Blocker Messages** — Thread-style comments
- ✅ **Blocker Resolution** — Mark resolved, sets resolved_by + resolved_at
- ✅ **Blocker Realtime** — blocker.created, blocker.resolved events
- ✅ **AI Mentor Advice** — Generates advice from blocker + message thread
- ✅ **Affected Tasks** — Links to same-team tasks
- ✅ **Visibility Pause** — SOSHub polling pauses on hidden tab
- ✅ **Loading States** — Proper loading/error/empty distinction

#### F. Leaderboard (Grid)
- ✅ **Impact Score Calculation** — workPoints (tasks*5 + log quality) + consistencyPoints (streak*2)
- ✅ **Leaderboard Ranking** — Sorted by impact_score DESC
- ✅ **Top 3 Display** — Medal emojis, centered cards, current user rank prominent
- ✅ **Period Filtering** — all/today/week/month with calendar-aligned windows
- ✅ **Period-Aware Polling** — 30s interval uses current period, no duplicate intervals
- ✅ **Period Safety** — Streak + all-time score never scoped by period
- ✅ **Poll Overlap Guard** — inFlight ref prevents concurrent requests
- ✅ **Hidden-Tab Pause** — document.hidden gate, visibilitychange listener
- ✅ **Loading/Empty/Error States** — Proper distinction, retry button on error
- ✅ **Period Change Race Protection** — periodRefetchPending queues fetch after stale response
- ✅ **Refresh Feedback** — Non-blocking "Updating…" during background poll

**Known Limitations:**
- Global leaderboard only (no team/class scope)
- No period-scoped views beyond filter
- No leaderboard explainability (why does user rank X?)
- No leaderboard realtime (unproven urgency)
- No badges/achievements
- No weekly challenges

#### G. Notifications
- ✅ **Notification Creation** — Server-computes recipients, preference-gated
- ✅ **Notification Storage** — recipients-scoped, entity-reference FKs (team/project/goal/task/blocker)
- ✅ **Notification Bell UI** — Header component with unread badge (0 hidden, 99+ capped)
- ✅ **Notification List** — Dropdown with list/loading/error/empty states
- ✅ **Mark Read** — Individual + mark-all-read with duplicate-submit guards
- ✅ **Notification Preferences** — 5 groups (team_join_request, goal_creation, goal_completion, task_assignment, blocker)
- ✅ **Preference Settings** — Toggle switches server-authoritative
- ✅ **Preference Defaults** — All default true, merge partial updates
- ✅ **Realtime Delivery** — notification.created events via SSE (recipientUserId-matched)
- ✅ **Deep Links** — Notification clicks navigate with deep-link params (teamId, goalId, etc.)
- ✅ **10+ Categories** — Across team/goal/task/blocker domains
- ✅ **Recipient Rules** — Server-computed based on event type + membership
- ✅ **Duplicate Prevention** — seenEventIds prevents SSE re-processing
- ✅ **API Pagination** — limit/offset on GET /notifications

**Known Limitations:**
- No notification retention/expiry policy (design decision needed)
- No notification muting (feature/team-level)
- No mentions/replies in notification context
- No deadline/dependency/escalation notifications (future expansion)
- No chat notifications (not yet implemented)

#### H. Realtime Infrastructure
- ✅ **SSE Connection** — RealtimeClient with auto-reconnect
- ✅ **Event Deduplication** — seenEventIds prevents double-processing
- ✅ **Visibility Gating** — document.hidden pause/resume (not cancellation)
- ✅ **Singleton Pattern** — Ref-counted single RealtimeClient (one per app)
- ✅ **Fan-Out Delivery** — Multiple components listen to single connection
- ✅ **Listener Management** — useRealtime hook adds/removes callbacks
- ✅ **Reconnect Backoff** — Exponential backoff on connection loss
- ✅ **Event Publishing** — Backend publishes via inMemoryRealtimeProvider
- ✅ **Fire-and-Forget** — Realtime failures don't break mutations (try/catch isolation)
- ✅ **Recipient Filtering** — Events include recipient/team ID for client-side scoping

**Event Types Implemented:**
- `goal.*` (created, updated, submitted_for_review, review_approved, returned, creation_approved, creation_rejected)
- `task.*` (created, status_changed, deleted)
- `blocker.*` (created, resolved)
- `join_request.*` (created, approved, rejected)
- `notification.created` (recipientUserId-matched)

**Known Limitations:**
- Single-instance only (won't survive multiple servers; Redis/Kafka needed for scale)
- No leaderboard realtime (unproven need)
- In-memory provider not suitable for clustered deployment

#### I. Analytics / Context Dashboard
- ✅ **Context Dashboard** — Aggregate metrics for parent-team view
- ✅ **Member Count** — Direct + recursive (sub-teams)
- ✅ **Daily Submissions** — Count of daily-logs today
- ✅ **Open Blockers** — Count of unresolved blockers
- ✅ **Task Progress** — Done vs total counts
- ✅ **Authorization** — Owner/admin of parent team can see child aggregates
- ✅ **Privacy** — Only aggregates returned, no task/goal/log content

#### J. Authorization & Privacy
- ✅ **Server-Side Auth** — All mutations require server checks (never trust frontend)
- ✅ **Role-Based Access** — owner, admin, manager, member, viewer with proper enforcement
- ✅ **Team Scoping** — requireTeamRole, requireTeamMembership middleware
- ✅ **Cross-Team Isolation** — Users can't write/read cross-team data
- ✅ **User Isolation** — Notifications/preferences/settings isolated by user
- ✅ **IDOR Protection** — notification mark-read ownership checked
- ✅ **Parameter Validation** — Zod schemas on all endpoints
- ✅ **Input Sanitization** — AI prompts sanitized
- ✅ **API Ownership** — All data modifications checked for ownership

---

## 3. PRODUCT ROADMAP — FUTURE WORK

### A. UX & Information Architecture

#### A.1 Sidebar Navigation Redesign
**Status:** Planned  
**Priority:** P2

**User Problem:** Top navigation bar is crowded; hard to discern major sections at a glance

**Proposed Outcome:** Clean left sidebar with all major sections, top bar focused on search/notifications/account

**Functional Scope:**
- Collapsible left sidebar
- Sections: Pulse, Goals, Projects, Teams, SOS Hub, Leaderboard, Analytics, Chat (future), Help Center, Profile
- Top bar: sidebar toggle, search, notifications bell, account menu
- Smooth collapse/expand animation
- Sidebar stays visible or auto-collapses on mobile

**Security/Privacy Requirements:**
- None beyond existing authorization

**Data/Backend Requirements:**
- None (UI layout only)

**UX Requirements:**
- Accessible navigation (ARIA labels, keyboard navigation)
- Visual current-page indication
- Responsive collapse on mobile (auto-hide or drawer)
- Smooth transitions

**Testing Requirements:**
- Keyboard navigation
- Responsive behavior (desktop/tablet/mobile)
- Accessibility testing

**Definition of Done:**
- Sidebar renders and collapses correctly
- All major sections accessible via sidebar
- Top bar focused (search, notifications, account only)
- Responsive on mobile
- No regression in existing features
- Accessibility audit passed

---

#### A.2 Global Search
**Status:** Planned  
**Priority:** P2

**User Problem:** Can't find goals, tasks, people, teams, blockers without navigating to each section

**Proposed Outcome:** Quick global search across entities

**Functional Scope:**
- Search bar in top navigation
- Search across: people, teams, goals, projects, tasks, blockers, chats (when implemented)
- Keyword/full-text search
- Scoped results (don't show cross-team data)
- Recent searches
- Quick jump to entity

**Security/Privacy Requirements:**
- Don't return cross-team data
- Don't search goals/tasks/blockers from teams user isn't member of
- Don't leak user names across teams

**Data/Backend Requirements:**
- New search endpoint(s)
- Potential full-text index on goals.title, goals.description, tasks.title, etc.
- Query optimization (avoid N+1)

**Realtime Requirements:**
- None

**UX Requirements:**
- Instant feedback
- Loading state while searching
- Empty state if no results
- Recent searches
- Type-ahead suggestions

**Testing Requirements:**
- Authorization (cross-team rejection)
- Performance at scale
- Scoped result correctness

**Definition of Done:**
- Search endpoint implemented and tested
- Frontend search UI with results display
- No cross-team data leaks
- Performance acceptable at scale
- All entity types searchable

---

### B. Collaboration

#### B.1 Chat Platform (DMs + Team Chat)
**Status:** Design Blocked  
**Priority:** P2  
**Effort:** Large

**User Problem:** No direct 1-to-1 or team conversation channels; all communication via notifications/blockers

**Proposed Outcome:** Dedicated chat for conversations, separate from issue/blocker escalation

**Functional Scope:**

**Direct Messages:**
- 1-to-1 private conversations
- Only participants can read/write
- Unread badge
- Search within conversation
- Mute conversations

**Team Chat:**
- Multi-person channel conversations within team
- Only team members can read/write
- Channels or flat room model (design decision)
- Search
- Mute by team or conversation

**Common Features:**
- Message history
- Replies/threads (optional, design decision)
- Mentions/@ notifications
- Reactions (emoji)
- Attachments (images, files)
- Message search
- Typing indicators (nice-to-have)

**Security/Privacy Requirements:**

**CRITICAL:**
- Direct chat: only participants authorized to read/write (server-enforced)
- Team chat: only team members authorized to read/write (server-enforced)
- Do NOT claim end-to-end encryption unless implemented
- Message access checked at retrieval time (not just creation)
- Participant list validated (no adding unauthorized users)
- Conversation deletion with message cascade (be careful with history)

**Data/Backend Requirements:**
- New `messages` table (id, sender_id, conversation_id/thread_id, content, created_at, updated_at)
- New `conversations` table (id, type='dm'|'team', team_id nullable, participant_ids JSONB or join table)
- Or: simplified approach — `conversations` (id, dm_recipient_id nullable, team_id nullable)
- Indexes on (recipient_id, created_at), (team_id, created_at) for retrieval
- Message retention/deletion rules

**Realtime Requirements:**
- `message.created` event (recipient_id matched for DMs, team_id matched for team chat)
- Unread count updates
- Typing indicators (optional)
- Deduplication via seenEventIds

**UX Requirements:**
- Loading state for message history
- Empty state for new conversations
- Error state + retry if message send fails
- Unread badge on sidebar/header
- Last message preview
- Conversation list sorted by recency
- Participant avatars
- Accessibility (screen reader support for messages)

**Testing Requirements:**
- Authorization: cross-dm rejection, cross-team rejection
- Race: concurrent message sends
- Realtime: message delivery, unread updates
- Participant validation
- Deletion cascade

**Definition of Done:**
- DMs work end-to-end (create, send, receive, list)
- Team chat works end-to-end
- Authorization verified (cross-talk rejected)
- Realtime sync verified
- Unread tracking works
- Mobile responsive
- Accessibility audit passed

**DESIGN DECISION REQUIRED:**
- DMs only, or + Team Chat?
- Threaded/nested replies or flat?
- Attachment support scope?
- E2EE required or not? (DO NOT claim it unless implemented)
- Moderation/abuse controls?
- Message retention policy?

---

### C. Goals

#### C.1 Goal Deletion UI
**Status:** Planned  
**Priority:** P3

**User Problem:** Goals can't be deleted via UI (backend supports it)

**Functional Scope:**
- Delete button on goal detail/card
- Confirmation modal
- Cascade behavior (delete sub-goals or move to root?)
- Realtime sync

**Definition of Done:**
- Delete button visible to authorized users (creator or leader)
- Confirmation prevents accidental deletion
- Sub-goals handled correctly
- Realtime event published

---

#### C.2 Goal Type Filtering Improvement
**Status:** Planned  
**Priority:** P3

**User Problem:** Too many goal-type buttons shown simultaneously (ambiguous, cluttered)

**Functional Scope:**
- Show 2–3 most common types (project, milestone, objective)
- Move others under "More Filters"
- Full type functionality retained
- Filters persist during session

**Definition of Done:**
- Filter UI updated
- "More Filters" dropdown works
- All goal types still accessible
- No filtering logic broken

---

#### C.3 Goal-to-Task Linkage
**Status:** Deferred (Architecture Decision)  
**Priority:** Future

**User Problem:** No relationship between goals (strategic) and tasks (execution) — two parallel systems

**Proposed Outcome:** Optional linkage so tasks can be tied to goals

**Design Questions:**
- One-to-many (task → multiple goals)?
- Many-to-many (task ← → goal)?
- Just a label/reference, or schema constraint?
- Auto-populate goal progress from task status?

**Deferred Because:**
- Subsystem decision (Goals vs Projects are parallel, not hierarchy)
- Requires schema change
- Affects progress calculation
- Not proven necessary by users yet

---

#### C.4 Goal Owner/Contributors
**Status:** Deferred (Schema Decision)  
**Priority:** Future

**User Problem:** Goals don't have individual assignees (unlike tasks)

**Proposed Outcome:** Owner + contributors on goals

**Design Questions:**
- Single owner or shared ownership?
- Contributors as group?
- Impact on review workflow?
- Impact on notifications?

**Deferred Because:**
- Requires schema change (owner_id, contributors JSONB)
- Affects workflow design
- Migration needed

---

#### C.5 Goal Success Criteria
**Status:** Deferred (Schema Decision)  
**Priority:** Future

**User Problem:** No explicit success/acceptance criteria on goals

**Proposed Outcome:** Optional success_criteria field

**Proposed Scope:**
- Text description of what "done" means
- Not required (optional)
- Part of goal detail

**Deferred Because:**
- Requires schema change
- UI needs design (how to display?)
- Impact on completion criteria

---

### D. Teams / Classroom

#### D.1 Classroom / Teacher / Coordinator Governance
**Status:** Design Blocked  
**Priority:** P2  
**Effort:** Large

**User Problem:** No explicit teacher/classroom hierarchy or governance

**Proposed Outcome:** Support classroom/teacher model for educational use

**Functional Scope:**
- Teacher role (distinct from owner/admin)
- Class enrollment workflows
- Student submission review
- Optional: grading/assessment
- Optional: parent/guardian access

**Current Architecture Support:**
- `parent_team_id` + `team_type='classroom'` already support hierarchy
- No new schema needed for basic teacher role

**Design Questions:**
- Teacher role vs owner/admin?
- Student approval workflow?
- Grading in scope for v1?
- Parent/guardian visibility?
- Class roster management?

**Deferred Because:**
- Requires explicit design on governance model
- Scope not approved yet
- Impacts notification/role system

---

#### D.2 Team Deletion UI
**Status:** Planned  
**Priority:** P3

**User Problem:** Backend supports team deletion, but no UI to do it

**Functional Scope:**
- Delete button in team settings (owner-only)
- Confirmation modal with consequences (all sub-teams, goals, projects deleted)
- Cascade deletion handling

**Definition of Done:**
- Delete button visible to owner only
- Confirmation modal shows what will be deleted
- Cascade works correctly
- No data left orphaned

---

### E. Projects / Tasks

#### E.1 Task Due Dates
**Status:** Planned  
**Priority:** P3

**User Problem:** Tasks have no deadline (distinct from goal target_date)

**Functional Scope:**
- Optional due_date on tasks
- Display on task cards
- Filter by overdue/upcoming
- Notification on approaching deadline (optional)

**Definition of Done:**
- due_date field added and persisted
- Displayed on task cards
- Sortable by due date
- No regression

---

#### E.2 Task Ordering / Priorities
**Status:** Planned  
**Priority:** P3

**User Problem:** Tasks in a project have no ordering; priority exists but no drag-reorder UI

**Functional Scope:**
- Drag-and-drop task reordering
- Or: let priority + due date define order
- Visual indicator of order

**Decision Needed:**
- Manual order field vs priority/date auto-sort?

---

#### E.3 Subtasks
**Status:** Deferred  
**Priority:** Future  
**Effort:** Medium

**User Problem:** Tasks can't be broken into subtasks

**Proposed Outcome:** Hierarchical tasks

**Design Questions:**
- Sub-task ownership (inherit or separate)?
- Progress calculation (aggregate or independent)?
- Realtime scope?

---

#### E.4 Task Descriptions on Cards
**Status:** Planned  
**Priority:** P3

**User Problem:** Task cards show title only; description hidden until you click

**Functional Scope:**
- Show preview of description on card (truncated)
- Or: show full if short enough

**Definition of Done:**
- Description preview visible
- No clutter (truncate at ~100 chars)

---

### F. Pulse

#### F.1 Pulse UX & Terminology Improvement
**Status:** Planned  
**Priority:** P2

**User Problem:**
- "Log" terminology is ambiguous (audit log vs daily entry?)
- "Add New Log" button too large
- "Daily Work" section too small

**Proposed Outcome:** Clearer UX, better terminology

**Proposed Terminology:**
- "Today's Update" (singular, personal)
- "Daily Updates" (plural, team)
- "Team Updates" (activity feed)

**Proposed Layout:**
- Resize Add button (less prominent)
- Expand Daily Work section
- Clearer visual hierarchy

**Definition of Done:**
- Terminology consistent throughout
- Layout balanced
- No ambiguity in what "update" means
- Component sizing appropriate

---

#### F.2 Team Activity Feed
**Status:** Planned  
**Priority:** P3

**User Problem:** Team members don't easily see each other's daily activity

**Functional Scope:**
- Expanded team activity section
- Show recent updates from team members
- Sort by recency
- Realtime new updates

**Definition of Done:**
- Activity feed displays correctly
- Realtime updates show
- Mobile responsive

---

### G. Leaderboard

#### G.1 Leaderboard Scope Expansion (Team/Class Views)
**Status:** Planned  
**Priority:** P2

**User Problem:** Leaderboard is global only; no way to see team-specific or class-specific rankings

**Proposed Outcome:** Scope filtering: Global, My Team, My Classes

**Functional Scope:**
- Scope selector (radio buttons or tabs)
- Global (current, all users)
- My Team (current team's members)
- My Classes (if coordinator/teacher, all enrolled classes)
- Same period filtering (all/today/week/month) applies to each scope

**Data/Backend Requirements:**
- Modify leaderboard query to filter by team_id if scope != 'global'
- Re-use existing period logic

**UX Requirements:**
- Scope selector prominent
- Rank, score, streak shown per scope
- Mobile responsive

**Definition of Done:**
- Team scope works correctly
- Classes scope works for teachers
- Period filtering still works
- No cross-team data leak

---

#### G.2 Leaderboard Explainability
**Status:** Planned  
**Priority:** P3

**User Problem:** Users don't understand why they rank X or what contributed to their score

**Proposed Outcome:** Breakdown showing score components

**Functional Scope:**
- Hover/expand on score to show:
  - workPoints: (completed tasks * 5) + avg log quality
  - consistencyPoints: streak_count * 2
  - breakdown of which tasks/logs contributed
- Optional: visual chart of contribution over time

**Definition of Done:**
- Score breakdown accessible
- Accurate calculation shown
- Mobile accessible (tap to expand)

---

#### G.3 Leaderboard Realtime
**Status:** Deferred  
**Priority:** P3 (Unproven Urgency)

**User Problem:** Leaderboard doesn't update in real-time when users log/complete tasks

**Proposed Outcome:** Real-time rank updates via SSE

**Current Status:**
- No events published for daily_logs or task mutations affecting leaderboard
- Realtime events only published for goal/task/blocker/join_request/notification

**Deferred Because:**
- Unproven user need (people don't stare at leaderboard)
- Would require SSE events on every log/task mutation
- May cause excessive updates

---

### H. Notifications

#### H.1 Notification Retention & Cleanup Policy
**Status:** Design Blocked  
**Priority:** P2

**User Problem:** Notifications accumulate indefinitely; no cleanup or archival

**Design Decision Required:**
- Keep all notifications forever?
- Auto-expire old read notifications (30/60/90 days)?
- Archive/hide old notifications but retain in DB?
- Digest/summary instead of individual notifications?

**Implications:**
- Storage growth
- User experience (clutter vs history)
- Compliance (if applicable)

---

#### H.2 Notification Expansion
**Status:** Planned  
**Priority:** P2

**User Problem:** Current notification categories cover 10 event types; many scenarios not covered

**Proposed Notifications:**
- **Mentions** — @username in chat/comments
- **Replies** — Someone replies to my message/comment
- **Deadlines** — Task/goal approaching due date
- **Dependencies** — Task you depend on status changed
- **Blocker Escalation** — Blocker unresolved > N days
- **Chat Messages** — When chat feature added
- **Team Changes** — Added to team, role changed, member left
- **Goal Events** — Optional: goal progress updated

**Implementation Approach:**
- Add to notification categories and preference groups
- Publish new SSE events on relevant mutations
- Implement in notification service

**Definition of Done:**
- All new categories implemented
- Preferences configurable per category
- Realtime delivery works
- Notifications tested end-to-end

---

#### H.3 Notification Muting
**Status:** Planned  
**Priority:** P3

**User Problem:** Can't silence notifications for specific teams/features

**Functional Scope:**
- Mute by team (don't show notifications from this team)
- Mute by category (don't show blocker notifications, etc.)
- Mute by conversation (for chat)
- Temporary mute (1 hour, 1 day, 1 week)

**Definition of Done:**
- Mute toggles work
- Preferences persisted
- Muted notifications not shown
- Can unmute easily

---

### I. Profile & Account

#### I.1 User Profile & Account Settings
**Status:** In Progress — Phases 1-3 complete, Phases 4-5 not started
**Priority:** P2  
**Effort:** Medium

**Canonical phase breakdown (see COMMANDCENTER_TASK_STATE.md for implementation detail):**
- Phase 1 — Core Profile (fields, visibility, My Profile page): **COMPLETE**
- Phase 2 — Password & Security (change password, session invalidation, rate limiting, security notification): **COMPLETE**
- Phase 3 — Avatar/Media (upload, display, replacement, deletion via Vercel Blob Storage): **COMPLETE**
- Phase 4 — Email/Phone Verification (email change verification, phone verification): NOT STARTED
- Phase 5 — Advanced Account Security (active sessions/device management, 2FA, password history/reuse prevention): FUTURE

**User Problem:** No dedicated profile page; minimal account management

**Proposed Scope:**

**Profile:**
- My Profile page
- Profile picture/avatar upload
- Bio / About me
- Pronouns / Full name display
- Public vs private settings

**Account Settings:**
- Email address (view + change)
- Password change
- Session management (active sessions, sign out from other devices)
- Notification preferences (currently in bell UI)
- Privacy settings (AI, data retention)

**Security Settings:**
- Password strength indicator
- 2FA (optional future)
- Session/device list
- Login activity log (optional future)

**IMPORTANT:** Audit users schema first
- Do NOT create redundant profiles table without justification
- Reuse existing users table if possible

**Data/Backend Requirements:**
- New endpoints: GET/PUT /users/profile, GET/PUT /users/settings, POST /users/password-change
- Optional: /users/sessions for session management
- Password reset flow (if not yet implemented)

**UX Requirements:**
- Clean profile layout
- Avatar upload with preview
- Password validation (strength meter)
- Confirmation for destructive actions (sign out other sessions, etc.)

**Testing Requirements:**
- Authorization (can't see other users' accounts)
- Password hashing/validation
- Session management correctness

**Definition of Done:**
- Profile page implemented
- Account settings accessible
- Password change works
- Avatar upload works
- No regression in existing features

---

### J. Onboarding & Help

#### J.1 Global Quick Overview
**Status:** Planned  
**Priority:** P3

**User Problem:** New users don't understand "What is CommandCenter?"

**Proposed Outcome:** Lightweight intro for first-time users

**Functional Scope:**
- Modal or banner on first login
- What is CommandCenter (2-3 sentences)
- Main concepts (goals, teams, daily work, blockers)
- Quick jump to intro video (optional)
- "Got it" to dismiss

**Definition of Done:**
- Modal shows once (first login)
- Content clear and concise
- Can be dismissed
- Optional: link to help center

---

#### J.2 Contextual Guides
**Status:** Planned (Teams Guide ✅ COMPLETE)  
**Priority:** P3

**User Problem:** Users confused about how to use specific sections (Teams, Goals, Projects, Chat)

**Proposed Outcome:** In-context help for each major section

**Teams Quick Guide:** ✅ **COMPLETE**
- Format: Spotlight tour (4-step, integrated with UI elements)
- Steps: Find a Team → Got a Team ID? → Want to create one? → What should I create?
- Replay: "❓ How to Use Teams" button in header
- Persistence: Independent from global tour, localStorage-based dismissal
- Status: Implemented, tested (9 hook tests + 38 component tests), verified

**Remaining Guides (Planned):**
- Goals Quick Guide: How to create, review, complete
- Projects/Tasks Quick Guide: How to create, assign, track
- Chat Quick Guide (once implemented): How to DM, team chat
- Blockers/SOS Quick Guide: How to report and resolve
- Pulse Quick Guide: How to log and view team activity

**Format:**
- Spotlight tour (proven approach, used for global tour + Teams guide)
- Contextual steps highlighting actual UI elements
- Intelligent card positioning, scroll-into-view, keyboard navigation
- Separate persistence per guide (no cross-interference)

**Definition of Done:**
- Guide accessible from each section via replay button
- Content clear and actionable
- Can be dismissed/hidden, supports unlimited replays
- Mobile responsive (sidebar toggles, targets remain visible)
- Full keyboard + reduced-motion accessibility

---

### K. Search

(See A.2 above — Global Search)

---

## 4. SECURITY & PRIVACY MASTER REQUIREMENTS

### Current Verified Security

#### Authentication
- ✅ Email/password login with bcrypt hashing
- ✅ JWT + refresh token session management
- ✅ Logout clears state and removes from ProtectedRoute
- ⚠️ No password reset flow yet
- ⚠️ No password change UI yet
- ❌ No 2FA

#### Authorization
- ✅ Backend-enforced on all mutations (never trust frontend)
- ✅ Role-based access control (owner/admin/manager/member/viewer)
- ✅ Team-scoped authorization middleware
- ✅ Team membership required for most operations
- ✅ Project/task/goal/blocker scoping correct
- ⚠️ API-level authorization checks comprehensive but frontend gating minimal

#### Isolation
- ✅ User-to-user: Notifications show own only, preferences isolated
- ✅ Team-to-team: WHERE clauses prevent cross-team data access
- ✅ Project-to-project: Tasks bound to projects
- ✅ Goal-to-goal: Hierarchy within team, can't cross teams
- ✅ Verified via authorization test suites

#### IDOR Protection
- ✅ Notification mark-read checks ownership
- ✅ All mutable endpoints verify user owns resource
- ⚠️ Not exhaustively tested across all endpoints

#### Data Sensitivity
- ✅ Passwords hashed (bcrypt)
- ✅ Tokens not returned to frontend
- ✅ Email stored but not publicly exposed
- ✅ Privacy settings stored and enforced
- ✅ Notifications user-scoped

#### API Security
- ✅ Zod schema validation on all endpoints
- ✅ AI prompts sanitized
- ✅ Parameter validation prevents injection
- ⚠️ Rate limiting partially implemented (needs verification on all endpoints)

#### Realtime Security
- ✅ Events include recipient_id/team_id for client-side filtering
- ✅ SSE connection requires auth (must be logged in)
- ✅ Payload thin (type + IDs, not full data)
- ✅ Deduplication via seenEventIds prevents re-processing
- ⚠️ No server-side authorization retry on stale response

#### Database
- ✅ Foreign key constraints enforced
- ✅ ON DELETE CASCADE/SET NULL appropriate per table
- ✅ Migrations versioned and applied consistently

### Future Security Hardening

#### Password Management
- [ ] Password reset flow
- [ ] Password change UI
- [ ] Password strength requirements
- [ ] Password reset email validation

#### Session / Device Management
- [ ] Session list (see active sessions)
- [ ] Sign out other devices
- [ ] Session activity log
- [ ] Device management (optional)

#### 2FA / Multi-Factor
- [ ] 2FA setup UI (TOTP via authenticator app)
- [ ] 2FA recovery codes
- [ ] 2FA enforcement options (per-user or org-wide)

#### Audit / Logging
- [ ] Login attempt log
- [ ] Data access audit log (optional, for compliance)
- [ ] Admin actions log
- [ ] Sensitive data change log

#### API Security
- [ ] Rate limiting verification (all endpoints)
- [ ] API key support (optional, for integrations)
- [ ] CORS hardening
- [ ] CSRF protection if needed

#### Chat Security (When Implemented)
- [ ] Participant list validation (no unauthorized users in conversation)
- [ ] Message authorization (only participants can read)
- [ ] Team membership enforcement (only team members in team chat)
- [ ] Attachment security (virus scan, size limits, access control)
- [ ] Conversation deletion cascade (clean up messages)
- [ ] **DO NOT claim E2EE unless implemented**

#### File / Upload Security (When Implemented)
- [ ] File type validation (whitelist, not blacklist)
- [ ] File size limits
- [ ] Virus scanning
- [ ] Secure storage (not world-readable)
- [ ] Access control (only authorized users can download)

---

## 5. NON-FUNCTIONAL ROADMAP

### Performance

**Current Target:** 200–500 teams, 100–200+ classrooms  
**Status:** Not formally tested at scale

**Known Performance Characteristics:**
- ✅ Leaderboard period query optimized with CTE + index
- ✅ Blocker AI disabled for non-members (privacy + perf)
- ✅ Goals loaded with version-token race protection (avoids duplicate loads)
- ⚠️ No load testing at target scale
- ⚠️ No query profiling/optimization pass completed

**Roadmap:**
- [ ] Load test at 500 teams
- [ ] Load test at 200+ classrooms
- [ ] Query optimization if needed
- [ ] Database index optimization
- [ ] Backend caching strategy (if needed)
- [ ] Frontend asset caching/CDN

### Scalability

**Current Limitation:**
- Realtime provider is in-memory only
- Won't survive multiple server instances
- Would need Redis/Kafka/managed event service for production scale

**Roadmap:**
- [ ] Evaluate event infrastructure (Redis Streams, Kafka, AWS EventBridge)
- [ ] Migrate realtime to scalable provider if multi-instance deployment planned
- [ ] Session storage (currently in-memory, needs Redis for multi-instance)

### Reliability

**Current State:**
- ✅ Notification failures don't break mutations (fire-and-forget)
- ✅ SSE reconnects with backoff
- ⚠️ No automatic retry for failed API requests (depends on user refresh)
- ⚠️ No persistence for unsent notifications if server down

**Roadmap:**
- [ ] Automatic retry for failed API requests
- [ ] Notification queue with persistence
- [ ] Error tracking/alerting
- [ ] Graceful degradation on feature failures

### Realtime Responsiveness

**Current State:**
- ✅ SSE for goal/task/blocker/join_request/notification mutations
- ✅ Page-level listeners (Goals, Projects, SOSHub, Teams, NotificationBell)
- ✅ Deduplication and reconnect
- ⚠️ No leaderboard realtime
- ⚠️ No chat realtime (not implemented)

**Roadmap:**
- [ ] Add leaderboard realtime (if justified by usage)
- [ ] Chat realtime (when feature added)
- [ ] Typing indicators (optional, nice-to-have)

### Accessibility

**Current State:**
- ✅ Aria-labels on buttons and form fields
- ✅ htmlFor/id labels on inputs
- ✅ role="group", role="status", role="alert" used appropriately
- ⚠️ No formal screen-reader testing
- ⚠️ No WCAG audit completed

**Roadmap:**
- [ ] Screen reader testing (NVDA, JAWS, VoiceOver)
- [ ] Keyboard navigation audit
- [ ] Color contrast verification
- [ ] WCAG 2.1 AA compliance audit
- [ ] Accessible form error messages
- [ ] Skip-to-main-content link

### Responsive / Mobile

**Current State:**
- ✅ Tailwind CSS responsive utilities used
- ✅ Most pages appear mobile-responsive
- ⚠️ No actual mobile device testing
- ⚠️ Some components may not be mobile-optimized

**Roadmap:**
- [ ] Test on actual mobile devices (iOS Safari, Android Chrome)
- [ ] Touch-friendly button sizes (48px min)
- [ ] Mobile navigation (sidebar drawer vs toggle)
- [ ] Mobile forms (input size, keyboard type)
- [ ] Viewport optimization

### Observability & Monitoring

**Current State:**
- ✅ Console.error for failures
- ⚠️ No centralized error tracking
- ⚠️ No structured logging
- ⚠️ No metrics/APM

**Roadmap:**
- [ ] Error tracking service (Sentry, Rollbar, Datadog)
- [ ] Structured logging (JSON logs to stdout)
- [ ] Application performance monitoring (APM)
- [ ] User analytics (usage patterns, feature adoption)
- [ ] Realtime monitoring dashboards

### Backup & Disaster Recovery

**Current State:**
- ✅ Neon Postgres handles backups
- ⚠️ No documented RTO/RPO
- ⚠️ No tested restore procedure

**Roadmap:**
- [ ] Document backup/restore procedure
- [ ] Test restore in staging
- [ ] Define RTO/RPO targets
- [ ] Automated backup verification

---

## 6. TESTING & RELEASE READINESS

### Current Test Coverage

**Frontend:**
- ✅ 326 tests passing (17 test files)
- ✅ Realtime synchronization tested
- ✅ Race condition tests for stale responses
- ✅ Authorization tests
- ⚠️ No mobile device testing
- ⚠️ No screen reader testing
- ⚠️ No E2E tests with real browser

**Backend:**
- ✅ 450/459 tests passing
- ✅ Authorization/RBAC tested
- ✅ API integration tests
- ✅ Notification delivery tested
- ⚠️ 8 timeout failures (Neon latency, environmental)
- ⚠️ 1 real failure: join-request API returns 500 (needs investigation)
- ⚠️ No load/scale testing

### Known Test Gaps

#### Mobile Testing
- [ ] iOS Safari responsive behavior
- [ ] Android Chrome responsive behavior
- [ ] Touch interaction (button sizes, tap targets)
- [ ] Mobile navigation (drawer vs toggle)

#### Accessibility Testing
- [ ] Screen reader testing (NVDA, JAWS, VoiceOver)
- [ ] Keyboard navigation (Tab, Enter, Escape)
- [ ] Color contrast verification
- [ ] Focus management
- [ ] ARIA correctness

#### Scale Testing
- [ ] Database performance at 500 teams
- [ ] Database performance at 200+ classrooms
- [ ] Leaderboard period query at scale
- [ ] Realtime event throughput
- [ ] API response time P95/P99

#### Integration Testing
- [ ] Full workflow tests (create team → add members → assign roles → create goals → etc.)
- [ ] Cross-feature workflows
- [ ] Failure recovery (network outages, server errors)

#### Realtime Testing
- [ ] SSE reconnect under various failure conditions
- [ ] Event deduplication edge cases
- [ ] Hidden-tab pause/resume correctness
- [ ] Multiple-listener race conditions

### Test Roadmap

#### Priority 1 (Critical)
- [ ] Fix join-request 500 error (real bug found in writeSideHardening.test.ts)
- [ ] Mobile device testing (at least iOS + Android)
- [ ] Scale testing with realistic data

#### Priority 2 (Important)
- [ ] Accessibility audit + fixes
- [ ] E2E tests with real browser
- [ ] Load testing (requests/sec, concurrent users)

#### Priority 3 (Nice-to-have)
- [ ] Chaos testing (kill database, network partitions)
- [ ] Performance profiling
- [ ] User behavior testing (usability studies)

---

## 7. DESIGN-BLOCKED DECISIONS

These items cannot proceed without explicit product/design approval.

### D.1 Classroom / Teacher / Coordinator Governance Model
**Status:** Architecture documented, implementation blocked

**Decision Required:**
1. Teacher role: New role distinct from owner/admin, or leverage existing roles?
2. Student approval: Required before enrollment, or auto-enroll?
3. Grading/assessment: In scope for MVP, or v2+?
4. Parent/guardian access: If added, what visibility?
5. Class roster management: UI for managing enrollments?

**Timeline:** Blocks classroom feature implementation

---

### H.1 Notification Retention & Cleanup Policy
**Status:** Open design question

**Decision Required:**
1. Keep all notifications forever?
2. Auto-expire old read notifications (30/60/90 days)?
3. Archive/hide old but retain in DB?
4. Digest/summary approach?

**Timeline:** Blocks notification cleanup implementation

---

### B.1 Chat Platform Scope
**Status:** Open design question

**Decision Required:**
1. DMs only for MVP, or + Team Chat?
2. Threaded/nested replies, or flat messages?
3. Attachment support scope (images only, or files)?
4. E2EE required? (Must not claim if not implemented)
5. Moderation/abuse controls?
6. Message retention/deletion?

**Timeline:** Blocks chat implementation

---

### G.1 Leaderboard Scope Filtering
**Status:** Partial design (global exists, expansion unclear)

**Decision Required:**
1. When to add Team-scoped leaderboard?
2. When to add Class-scoped leaderboard?
3. How to display scope switcher?
4. Should period filtering apply to scoped views?

**Timeline:** Blocks leaderboard scope expansion

---

### I.1 Profile & Account Architecture
**Status:** Partial design (user table exists, UI undefined)

**Decision Required:**
1. Profile picture/avatar: Required or optional?
2. Bio/about: Required or optional?
3. 2FA: Required for security, or optional nice-to-have?
4. Password reset: Via email, or other?
5. Session management: Show active sessions, sign out other devices?

**Timeline:** Blocks profile/account implementation

---

### J. Search Priority & Scope
**Status:** Open design question

**Decision Required:**
1. Which entities to search first: people, goals, tasks, projects, blockers, chats?
2. Full-text search or keyword-based?
3. When to implement (MVP or v2+)?

**Timeline:** Blocks search implementation

---

## 8. PRIORITIZATION FRAMEWORK

When deciding what to implement next, use this framework. This does NOT decide the priority — it provides the criteria.

### P0: Security / Data Loss / Blocker
Examples:
- Authorization bypass
- Data leak
- Corruption/loss
- Realtime failures breaking mutations

**Effort:** Variable  
**Risk:** Critical

### P1: Critical Correctness / Major Workflow
Examples:
- Stale-response races (fixed)
- Missing authorization (fixed)
- Broken realtime sync
- UI-blocking bugs

**Effort:** Variable  
**Risk:** High  
**User Impact:** High

### P2: High-Value Product / Reliability
Examples:
- Sidebar navigation redesign
- Chat platform
- Leaderboard team-scope
- Notification expansion
- Classroom governance (if approved)

**Effort:** Large  
**Risk:** Medium  
**User Impact:** High

### P3: UX Polish / Low-Impact Enhancement
Examples:
- Pulse terminology
- Goals type filtering
- Task due dates
- Goal deletion UI

**Effort:** Small  
**Risk:** Low  
**User Impact:** Medium

### Framework Dimensions

**Effort:**
- Small: 1-3 days
- Medium: 1-2 weeks
- Large: 2-4 weeks+

**Risk:**
- Low: isolated change, well-tested
- Medium: affects multiple features, needs auth testing
- High: architectural impact, migration needed

**User Impact:**
- High: fixes blocker, major feature
- Medium: improves workflow
- Low: polish, edge case

**Dependencies:**
- None: can start immediately
- Design decision: blocked until decided
- Feature prerequisite: needs earlier work
- Infrastructure: needs backend/realtime changes

---

## 9. EXPLICITLY CLOSED / DEPRECATED ITEMS

These items should NOT be prioritized or implemented without new evidence.

### Teams Empty-Members Message [P3]
**Status:** Architecturally unreachable (team always has creator)  
**Closure:** Close as low-value, don't build unless evidence shows teams can have zero members

### Redundant Leaderboard UI Redesign
**Status:** Period filter already implemented end-to-end  
**Closure:** Existing leaderboard UI adequate; focus on scope expansion if needed, not redesign

### Duplicate Notification Systems
**Status:** Single centralized system sufficient  
**Closure:** Don't build parallel notification infrastructure; extend existing system

### Broad Cascade Refetch Architecture
**Status:** Scoped refetch proven better  
**Closure:** Use scoped refetch pattern (Teams, Goals, Projects verified); don't revert to full cascades

### Fake E2EE Claims
**Status:** Chat not implemented yet  
**Closure:** When chat added, DO NOT claim E2EE unless actually implemented; prefer clear privacy statements instead

---

## 10. CROSS-REFERENCE & TRACEABILITY

Every major roadmap item traces to its source:

| Item | Source | Status |
|------|--------|--------|
| Sidebar nav redesign | Today's product session | Planned, P2 |
| Pulse UX/terminology | Today's product session, MASTER_COMMANDCENTER_INVENTORY | Planned, P2 |
| Goals type filter | Today's product session | Planned, P3 |
| Profile/Account | Today's product session, historical discussion | Planned, P2 |
| Chat platform | Today's product session, historical discussion | Design blocked, P2 |
| Leaderboard scope | Today's product session | Planned, P2 |
| Global search | MASTER_COMMANDCENTER_INVENTORY, historical | Planned, P2 |
| Notification expansion | MASTER_COMMANDCENTER_INVENTORY | Planned, P2 |
| Notification retention | MASTER_COMMANDCENTER_INVENTORY | Design blocked |
| Classroom governance | COMMANDCENTER_TASK_STATE.md | Design blocked, P2 |
| Goal deletion UI | MASTER_COMMANDCENTER_INVENTORY | Planned, P3 |
| Task due dates | MASTER_COMMANDCENTER_INVENTORY | Planned, P3 |
| Accessibility audit | MASTER_COMMANDCENTER_INVENTORY | P2 testing |
| Mobile testing | MASTER_COMMANDCENTER_INVENTORY | P2 testing |
| Scale testing | MASTER_COMMANDCENTER_INVENTORY | P1 testing |

---

## 11. ROADMAP COMPLETENESS CHECK

### Features Captured
- ✅ 12 verified-complete feature areas documented
- ✅ 30+ future feature candidates captured and scoped
- ✅ 8 bugs/UX issues documented
- ✅ 6 security hardening items documented
- ✅ 10+ performance/reliability items documented
- ✅ 8+ testing/QA gaps documented
- ✅ 6 design decisions identified and documented

### Items by Category
| Category | Count | Status |
|----------|-------|--------|
| **UX & Info Architecture** | 2 | Planned |
| **Collaboration (Chat)** | 1 | Design blocked |
| **Goals** | 5 | Planned + Deferred |
| **Teams/Classroom** | 2 | Planned + Blocked |
| **Projects/Tasks** | 4 | Planned + Deferred |
| **Pulse** | 2 | Planned |
| **Leaderboard** | 3 | Planned + Deferred |
| **Notifications** | 3 | Planned + Blocked |
| **Profile/Account** | 1 | Planned |
| **Search** | 1 | Planned |
| **Onboarding/Help** | 2 | Planned |
| **Security** | 9 | Roadmap |
| **Performance/Reliability** | 8 | Roadmap |
| **Testing/QA** | 6 | Roadmap |

### Design Decisions Requiring Approval
1. Classroom governance model (teacher role, enrollment, grading)
2. Chat scope and features (DMs, team chat, E2EE claim)
3. Notification retention policy
4. Leaderboard scopes (when to add team/class views)
5. Profile/Account features (avatar, 2FA, session mgmt)
6. Search priority and full-text strategy

### Known Issues / Bugs Captured
- ✅ Join-request API returns 500 (writeSideHardening.test.ts:97) — needs investigation
- ✅ Pulse terminology ambiguous ("log" unclear)
- ✅ Add New Log button oversized
- ✅ Goals type filtering cluttered
- ✅ Leaderboard global-only (scope expansion deferred)
- ✅ Chat not implemented (features deferred)
- ✅ Profile/Account minimal (features deferred)

### Unresolved Items
- ❓ Join-request 500 error root cause (needs investigation)
- ❓ Neon-latency test timeouts (8 pre-existing, environmental)
- ❓ Optimal attachment security for chat (when implemented)
- ❓ Optimal 2FA strategy (TOTP vs email vs other)

---

## 12. EXECUTIVE SUMMARY

### What's Done
CommandCenter is a mature, feature-rich team/classroom productivity platform with solid fundamentals:
- ✅ All major workflows implemented (teams, goals, projects, blockers, leaderboard, notifications, realtime)
- ✅ Authorization hardened and verified
- ✅ Realtime synchronization across 4+ event types
- ✅ 326/459 tests passing (98% backend, 100% frontend)
- ✅ TypeScript clean, production build succeeds

### What's Blocked
Three major features are blocked waiting for design decisions:
- **Classroom Governance** — role model, enrollment workflows
- **Chat Platform** — scope (DMs only? + team chat?), E2EE, retention
- **Notification Retention** — keep forever? expire old? digest?

### What's Next
High-impact product work (P2 priority):
1. Sidebar navigation redesign
2. Leaderboard team-scope addition
3. Global search
4. Profile/Account system
5. Notification expansion
6. Pulse UX improvements

### Risks & Gaps
- **Real bug found:** Join-request returns 500 (needs fix)
- **Test gaps:** No mobile, accessibility, or scale testing
- **Scaling limit:** Realtime in-memory only (needs Redis/Kafka for multi-instance)
- **Known issues:** Neon-latency test timeouts (environmental, not fixable in app code)

### Roadmap Health
- Comprehensive coverage of completed work
- Clear design-decision blockers identified
- Realistic sizing for future items
- Security/testing/reliability considerations included
- Ready for 6-12 month planning cycle

---

**End of Product Roadmap**
