# CommandCenter Scope-Aware AI Assistant — Frozen Master Blueprint (one.md)

> [!IMPORTANT]
> **LOCAL-ONLY / FROZEN MASTER BLUEPRINT**
> This file (`one.md`) represents the formally approved, frozen architectural blueprint for the CommandCenter Scope-Aware AI Assistant. It MUST NOT be modified or rewritten during feature implementation. Any future implementation deviations must be recorded in `implementation-delta.md`.
> **Git Rule**: This document is intended as a local-only long-term blueprint and MUST NOT be committed or pushed to Git repositories.

---

## 1. Purpose & Business Goal
Transform CommandCenter's global AI assistant into an authorization-enforced, scope-aware intelligence engine supporting:
1. **Global Product Knowledge**: Instant, authoritative help on CommandCenter features via static trusted documentation RAG.
2. **Personal AI**: Individual task, work log, and goal tracking for the authenticated user.
3. **Classroom & Team AI**: High-level coordinator summaries, sub-team metrics, and student work progress strictly isolated within authorized class/team boundaries.

---

## 2. Core Architecture: Deterministic Hybrid System
- **Hybrid Pattern**:
  - **Static Help Docs**: RAG via vector similarity search over trusted Markdown files (`backend/data/help/*.md`).
  - **Live Operational Work Data**: Deterministic, pre-authorized backend tool calls querying PostgreSQL repositories.
- **LLM Role**: Reasoning, summarization, and natural language explanation ONLY.
- **Strict Anti-Patterns**:
  - The LLM **NEVER** decides authorization.
  - The LLM **NEVER** generates raw SQL (No Text-to-SQL).
  - The LLM **NEVER** receives unscoped operational data.
  - The LLM **NEVER** executes arbitrary backend functions.

---

## 3. Data Boundaries & Existing Schema Integration
- **`daily_logs`**: Personal, team-agnostic daily log (`user_id`, `log_date`, `summary`, `bullet_points`). Exposed **ONLY** to Personal AI for the authenticated caller.
- **`daily_work_entries` & `daily_work_submissions`**: Team-scoped work submissions (`team_id NOT NULL`, `user_id NOT NULL`). Exposed to Team AI and Classroom AI for authorized members and owners.
- **`tasks`**: Project tasks (`project_id`, `owner`, `contributors`, `status`, `priority`).
- **`teams`**: Team and Classroom hierarchy (`team_id`, `parent_team_id`, `team_type`).

---

## 4. Authorization Model & Non-Negotiables

### 4.1 The Security Perimeter Chain
$$\text{Authenticated JWT} \longrightarrow \text{Caller ID} \longrightarrow \text{Role Model} \longrightarrow \text{Scope Resolution} \longrightarrow \text{Target Entity Validation} \longrightarrow \text{Tool Auth} \longrightarrow \text{SQL Filter} \longrightarrow \text{Projection} \longrightarrow \text{Sanitization} \longrightarrow \text{LLM} \longrightarrow \text{Output Filter} \longrightarrow \text{Audit}$$

### 4.2 Untrusted Authorization Sources
The following are **NEVER** authorization sources under any circumstances:
- Frontend request body (`userId`, `role`, `classId`, `teamId`)
- User prompt text
- Conversation history
- RAG retrieval results
- LLM decision or output
- Output redaction

Client-provided IDs are treated strictly as **SCOPE HINTS** and must be verified by backend DB checks before use.

### 4.3 Existing Role Vocabulary (Repository Fact)
Mapped directly to PostgreSQL `team_members_role_check` constraint (`'owner'`, `'admin'`, `'manager'`, `'member'`, `'viewer'`):
- **Classroom AI**: `'owner'` or `'admin'` of the parent classroom team.
- **Team AI**: `'owner'`, `'admin'`, `'manager'`, or `'member'` of the target team.
- **Member AI**: Caller must be Classroom `'owner'`/`'admin'`, AND target member must belong to `getDescendantTeamIds(classId)`.
- **Personal AI**: Authenticated user (`req.user.userId`) only.

---

## 5. The Priya Multi-Class Isolation Rule (Hard Security Acceptance Criterion)
- **Scenario**: Priya is a member of **Class A (Team A)** and **Class C (Team C)**.
- **Query**: Class A Owner asks: *"Summarize Priya's work."*
- **Backend Control**:
  1. Backend verifies caller is Owner/Admin of `Class A`.
  2. Sub-team helper `getDescendantTeamIds(Class A)` resolves all sub-teams under `Class A`.
  3. Tool `getClassMemberWork` executes SQL with forced predicate:
     ```sql
     WHERE team_id = ANY(getDescendantTeamIds('Class A'))
       AND user_id = 'Priya_UUID'
     ```
- **Strict Isolation Guarantee**:
  - Class A / Team A work submissions are included.
  - Class C / Team C work submissions are **excluded by SQL predicate before LLM retrieval**.
  - Personal `daily_logs` are **excluded by SQL predicate before LLM retrieval**.
  - Unrelated project tasks, private chats, and personal data are **excluded by SQL predicate**.

---

## 6. AI Provider Architecture
- Extend `AIProvider` (`backend/src/modules/ai/providers/aiProvider.interface.ts`) to support structured tool calls cleanly (`generateWithTools`).
- In fallback mode or for providers without native tool-calling, the Tool Orchestrator injects JSON schemas into system prompt and parses response using `parseAIJson`.
- Maintain vendor-agnostic isolation for Groq, Gemini, and NullProvider.

---

## 7. Tool Architecture (Allowlisted Tool Registry)

| Tool Name | Scope | Authorization Rule | Mandatory SQL Filter | Max Rows |
| :--- | :--- | :--- | :--- | :--- |
| `searchProductHelp` | Global | `privacyService.isAiEnabledForUser()` | `WHERE is_published = true` | 3 chunks |
| `getMyTasks` | Personal | `req.user.userId` | `WHERE owner = $1 OR created_by = $1` | 20 tasks |
| `getMyWorkLogs` | Personal | `req.user.userId` | `WHERE user_id = $1` | 14 logs |
| `getClassSummary` | Classroom | `getMemberRole(caller, classId) IN ('owner', 'admin')` | `WHERE team_id = ANY(getDescendantTeamIds($1))` | 1 summary |
| `getClassMemberWork` | Classroom | `getMemberRole(caller, classId) IN ('owner', 'admin') AND isMember(target, classId)` | `WHERE team_id = ANY(getDescendantTeamIds($1)) AND user_id = $2` | 20 entries |
| `getTeamSummary` | Team | `canAccessTeam(caller, teamId)` | `WHERE team_id = $1` | 1 summary |

---

## 8. RAG Boundary
- **RAG Scope**: Restricted 100% to static product help documentation (`backend/data/help/*.md`).
- **Zero Operational RAG Rule**: Operational user data (tasks, logs, submissions) is **NEVER** stored in vector indices.

---

## 9. Conversation Scope Isolation
- Chat history is persisted in `ai_conversation_sessions` using compound scope keys `(user_id, scope_type, scope_id)`.
- Partial unique indexes enforce uniqueness across NULL and non-NULL scope IDs:
  - `CREATE UNIQUE INDEX idx_ai_conversation_user_scope_id ON ai_conversation_sessions(user_id, scope_type, scope_id) WHERE scope_id IS NOT NULL;`
  - `CREATE UNIQUE INDEX idx_ai_conversation_user_scope_null ON ai_conversation_sessions(user_id, scope_type) WHERE scope_id IS NULL;`

---

## 10. Database Decisions
- Two new non-breaking PostgreSQL migrations:
  1. `1790000000000_add-ai-audit-logs.sql` (Creates `ai_query_audit_logs`).
  2. `1790100000000_add-ai-conversation-sessions.sql` (Creates `ai_conversation_sessions` with partial unique indexes).

---

## 11. API & Frontend Contracts
- Endpoint: `POST /api/ai/assistant` taking `{ message, scopeType?, scopeId? }`.
- Disambiguation: Returns structured `disambiguation` choice options for ambiguous queries across multiple authorized teams.
- Route Links: Evidence links render internal React Router paths (`/projects?projectId=...`). Never external or `file://` URLs.

---

## 12. Acceptance Criteria
1. Zero cross-class or cross-team data leakage in Priya Multi-Class test.
2. Zero raw SQL generated by LLM.
3. 100% pre-execution tool authorization validation in backend.
4. Clean disambiguation options for multi-membership queries.
5. Zero regressions against existing 66 backend test files.
