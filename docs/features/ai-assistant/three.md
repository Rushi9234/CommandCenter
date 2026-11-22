# CommandCenter AI Copilot — Final Frozen V3 Master Blueprint (three.md)

> [!IMPORTANT]
> **LOCAL-ONLY / FINAL FROZEN V3 MASTER BLUEPRINT**
> This file (`three.md`) represents the formally frozen V3 architectural and product blueprint for the CommandCenter AI Work Copilot. It evolves V2 (`two.md`) into a comprehensive, authorization-enforced Work Copilot supporting new-user onboarding, multi-workspace personal attention, team/classroom coordination, project execution analytics, and assistive work automation.
> **Git Rule**: This document is intended as a local-only master specification and MUST NOT be committed or pushed to Git repositories.

---

## 1. Product Vision & Core Responsibilities

CommandCenter AI is a **Context-Aware AI Work Copilot** integrated across all protected CommandCenter routes.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          COMMANDCENTER AI WORK COPILOT                          │
├─────────────────┬──────────────────┬─────────────────┬──────────────────────────┤
│ New User        │ Personal Work    │ Team & Class    │ Project & Member         │
│ Onboarding      │ Copilot          │ Intelligence    │ Intelligence             │
│ - Platform Guide│ - Daily Tasks    │ - Team Metrics  │ - Project Progress       │
│ - First Actions │ - Overdue Items  │ - Class Progress│ - Active Blockers        │
│ - Sample Prompts│ - Attention Digest│ - Sub-team Tree │ - Scoped Member Work     │
└─────────────────┴──────────────────┴─────────────────┴──────────────────────────┘
```

### Core Responsibilities:
1. **New User Onboarding & Platform Guidance**:
   - Explains CommandCenter concepts (Teams, Classrooms, Projects, Tasks, Daily Logs, Blockers, Goals).
   - Guides first-time setup actions (complete profile, join a team, create first task).
   - Provides dynamic, context-sensitive sample prompt chips.
2. **Personal Work Copilot**:
   - Answers personal workload queries (*"What are my tasks today?"*, *"What needs my attention?"*, *"What is overdue?"*, *"Summarize my workload"*).
   - Operates across **all authorized workspaces** of the caller without forcing unneeded single-project disambiguation.
3. **Team & Classroom Intelligence**:
   - Provides team progress metrics (*"How is my team performing?"*, *"What are the main blockers?"*).
   - Provides classroom coordinator analytics (*"Give me overall class performance"*, *"Which students have pending work?"*).
   - Enforces strict sub-team hierarchy traversal via `getDescendantTeamIds(classId)`.
4. **Project Execution Analytics**:
   - Summarizes project status, active blockers, high-priority tasks, and timeline risks (*"Summarize project progress"*, *"What is blocking this project?"*).
5. **Scoped Member Inquiry**:
   - Answers specific member questions (*"Did Rahul complete his task?"*, *"What has Priya completed?"*).
   - Resolves target user names strictly within authorized team/classroom subtrees.
6. **Product Help (Static RAG)**:
   - Answers feature documentation queries (*"How do I create a team?"*, *"How do task submissions work?"*).
   - Powered strictly by static Markdown files (`backend/data/help/*.md`). Operational user data is NEVER vectorized.
7. **Assistive Work Automation (Read-Only Draft Generation)**:
   - Generates draft work summaries, standup reports, meeting agendas, and suggested next actions.
   - Operations remain **read-only / assistive** until an explicit multi-step user confirmation UI is established.

---

## 2. Absolute Intent Priority Pipeline (5-Tier Routing Architecture)

Page context is strictly an **untrusted routing hint** and is NEVER allowed to override clear user intent.

```
[ User Query + Untrusted pageContext Hints ]
                    │
                    ▼
┌──────────────────────────────────────────────────────────┐
│ TIER 1: SEMANTIC INTENT CLASSIFICATION                   │
│ Single-pass LLM tool selection maps prompt to candidate  │
│ intent: Personal | Team | Class | Project | Member | Help│
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ TIER 2: EXPLICIT TARGET ENTITY RESOLUTION               │
│ Extract named entities (e.g. "Priya", "Project Alpha")   │
│ Resolve UUIDs strictly within caller's authorized scope  │
└──────────────────────────┬───────────────────────────────┘
                           │ (If entity unprovided or ambiguous)
                           ▼
┌──────────────────────────────────────────────────────────┐
│ TIER 3: PRIOR CONVERSATION & DISAMBIGUATION STATE        │
│ Check session state for selected target entity (scopeId) │
└──────────────────────────┬───────────────────────────────┘
                           │ (If session state empty)
                           ▼
┌──────────────────────────────────────────────────────────┐
│ TIER 4: PAGE CONTEXT ROUTE HINTS (UNTRUSTED HINT)        │
│ Use pageContext (path, teamId, classId, projectId)       │
│ If exactly 1 authorized entity exists -> Auto-resolve    │
│ If > 1 authorized entity exists -> Return Disambiguation │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ TIER 5: SAFE GENERIC FALLBACK                            │
│ Return safe clarification response or Help RAG          │
└──────────────────────────┘
```

### Routing Rules & Examples:
* **"What needs my attention?"** (regardless of route `/projects`, `/teams`, or `/`):
  → Tier 1 identifies **Personal Work Intent** → Routes to `getPersonalAttentionItems` → Aggregates caller's overdue tasks, high-priority work, and assigned blockers across all authorized workspaces → **NEVER triggers project disambiguation**.
* **"What are my tasks today?"**:
  → Tier 1 identifies **Personal Task Intent** → Routes to `getMyTasks`.
* **"Summarize this project"** (on `/projects?projectId=UUID`):
  → Tier 1 identifies **Project Intent** → Tier 4 resolves `projectId` from URL search parameters → Routes to `getProjectSummary`.
* **"Summarize project progress"** (on `/projects`, no `projectId`, caller has 3 projects):
  → Tier 1 identifies **Project Intent** → Tier 4 finds $N > 1$ authorized projects → Returns **Structured Choice Pills** (*"Which project do you mean?"*).
* **"Did Rahul complete his task?"**:
  → Tier 1 identifies **Member Task Intent** → Tier 2 resolves "Rahul" strictly within caller's authorized classroom/team subtrees → Routes to `getClassMemberWork`.
* **"How do I create a project?"**:
  → Tier 1 identifies **Help RAG Intent** → Routes to `searchProductHelp`.

---

## 3. Authoritative Allowlisted Tool Registry (8 Tools Total)

The V3 tool registry consists of **EXACTLY 8 typed allowlisted tools**:

| Tool Name | Scope | Authorization Rule | Mandatory SQL Predicate | Minimal DTO Projection |
| :--- | :--- | :--- | :--- | :--- |
| `searchProductHelp` | Global | `isAiEnabledForUser()` | `WHERE is_published = true` | Title, content snippet, doc path |
| `getMyTasks` | Personal | `req.user.userId` | `WHERE owner = $1 OR created_by = $1` | Task ID, title, status, priority, deadline |
| `getMyWorkLogs` | Personal | `req.user.userId` | `WHERE user_id = $1` | Work date, summary, bullet points |
| `getPersonalAttentionItems` | Personal | `req.user.userId` | `WHERE (owner = $1 AND (priority IN ('high','urgent') OR deadline < CURRENT_DATE)) OR assigned_blocker = $1` | Overdue tasks, high-priority items, assigned blockers |
| `getClassSummary` | Classroom | `getMemberRole(caller, classId) IN ('owner','admin')` | `WHERE team_id = ANY(getDescendantTeamIds($1))` | Member count, total submissions, pending work |
| `getClassMemberWork` | Classroom | `getMemberRole(caller, classId) IN ('owner','admin') AND isMember(target, classId)` | `WHERE team_id = ANY(getDescendantTeamIds($1)) AND user_id = $2` | Work date, confirmed summary, task title |
| `getTeamSummary` | Team | `canAccessTeam(caller, teamId)` | `WHERE team_id = $1` | Team name, member count, task progress rate |
| `getProjectSummary` | Project | `canAccessProject(caller, projectId)` | `WHERE project_id = $1` | Status, completion rate, active blockers count, high-priority tasks |

---

## 4. Disambiguation Choice Pills Model

When multiple authorized entities match a scope-specific query without a named target:

```json
{
  "answer": "You have access to multiple projects. Please select which project you would like to inquire about:",
  "disambiguation": {
    "message": "Which project do you mean?",
    "options": [
      { "label": "Project Alpha", "scopeType": "project", "scopeId": "uuid-1" },
      { "label": "Project Beta", "scopeType": "project", "scopeId": "uuid-2" }
    ]
  }
}
```

### Disambiguation Execution Rules:
1. Clicking choice pill `[Project Alpha]` sends payload: `{ message: "Summarize Project Alpha", explicitScopeType: "project", explicitScopeId: "uuid-1" }`.
2. Backend re-authorizes `uuid-1` against `projectsRepository.canAccessProject(callerUserId, "uuid-1")`.
3. Backend executes `getProjectSummary(projectId: "uuid-1")` directly.
4. **NEVER** transforms selected choice pills into unparsed free text like *"Analyze Project Alpha"*.

---

## 5. Security & Authorization Invariants

1. **Backend Authorization Perimeter**:
   - `req.user.userId` extracted from JWT session. Client-provided IDs in request body or `pageContext` are strictly untrusted hints.
   - Live PostgreSQL authorization (`canAccessProject`, `canAccessTeam`) executes before reading operational rows.
2. **Priya Multi-Class Isolation Rule**:
   - Classroom queries for student work execute forced SQL predicates:
     `WHERE team_id = ANY(getDescendantTeamIds(classId)) AND user_id = targetUserId`.
   - Work submissions from unauthorized classes (Class C) and personal `daily_logs` are excluded at the SQL layer.
3. **No Text-to-SQL**: Operational data access passes strictly through typed tool handlers.
4. **PII Masking & XML Fencing**: Operational data wrapped in `<untrusted_user_data>` tags alongside `maskPII()`.
5. **Provider Message Normalization**: Prior conversation messages stripped to strictly `{ role, content }` strings before Model Call 2.

---

## 6. Onboarding & Home Architecture

* **Reuses Existing Routes**: Integrates with existing `/overview` (Overview page) rather than creating a redundant `/home` route.
* **First-Time State**: Overview presents an interactive onboarding checklist (Complete Profile → Join/Create Team → Create Task/Goal → Try AI Copilot) with sample prompt chips.
* **Returning-User State**: Overview presents "Today at a Glance" (pending tasks, overdue work, assigned blockers, recent team activity, and AI copilot entry point).

---

## 7. Demo vs. Production Provisioning Strategy

* **Local Demo Flow**: Reuses existing `POST /api/auth/register` with local `AUTO_VERIFY` behavior (`process.env.AUTO_VERIFY_USERS = 'true'`). Pre-seeded demo personas (`ai_userA`, `ai_userB`, `priya_student`) provide rich operational data out of the box.
* **Production Flow (Future)**: Real production onboarding uses email invitation tokens (`POST /api/auth/invite`) and SMS verification (`phoneVerification.service.ts`).
* **Zero Credential Exposure**: No hardcoded passwords or API keys committed.

---

## 8. Capability Classification: NOW vs. LATER Split

### NOW (Required for V3 Implementation):
1. **5-Tier Intent Resolution Pipeline** in `ai.service.ts`.
2. **8 Allowlisted Tools Total** (`searchProductHelp`, `getMyTasks`, `getMyWorkLogs`, `getPersonalAttentionItems`, `getClassSummary`, `getClassMemberWork`, `getTeamSummary`, `getProjectSummary`).
3. **`getPersonalAttentionItems` tool handler** in `personalTools.ts`.
4. **Disambiguation Button Pills Engine** preserving `scopeId` UUIDs.
5. **Query-String Search Param Extraction** (`location.search`) in `AIAssistantDrawer.tsx`.
6. **Provider Message History Normalization** (`{ role, content }`) before Call 2.
7. **Priya Multi-Class SQL Predicate Isolation** (`getDescendantTeamIds`).
8. **Integration Test Suite TC-01 through TC-54**.

### LATER (Deferred Future Work Backlog):
1. Assistive draft generation with multi-step write confirmation UI.
2. Production email invitation flow (`POST /api/auth/invite`).
3. SSE character streaming endpoint (`POST /api/ai/assistant/stream`).
4. Native `pgvector` database integration.
5. Realtime WebSocket AI notification alerts.

---

## 9. Architectural Alignment Confirmation

- `docs/features/ai-assistant/one.md`: Original Frozen V1 Baseline (**100% UNTOUCHED**).
- `docs/features/ai-assistant/two.md`: Approved V2 Implementation Baseline (**HISTORICAL BASELINE**).
- `docs/features/ai-assistant/three.md`: Final Frozen V3 Master Blueprint (**AUTHORITATIVE MASTER SPECIFICATION**).

**FINAL FREEZE STATUS: READY FOR V3 IMPLEMENTATION**
