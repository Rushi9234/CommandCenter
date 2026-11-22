# CommandCenter AI Assistant V2 — Approved Master Blueprint (two.md)

> [!IMPORTANT]
> **LOCAL-ONLY / APPROVED V2 MASTER BLUEPRINT**
> This file (`two.md`) represents the formally approved V2 architectural blueprint for the CommandCenter Scope-Aware AI Assistant. It evolves V1 (`one.md`) by replacing manual scope selection with automatic AI-driven intent routing and page-aware context detection.
> **Git Rule**: This document is intended as a local-only long-term blueprint and MUST NOT be committed or pushed to Git repositories.

---

## 1. Purpose & Core Evolution

V2 transforms the AI Assistant from a dropdown-driven interface into a **Seamless, Context-Aware AI System**:

1. **Zero-Dropdown Friction**: The user simply asks a natural-language question. No manual Scope dropdown selection required.
2. **Automatic Intent & Tool Routing**: Uses single-pass Groq native tool calling to determine intent and select allowlisted tools.
3. **Page-Aware Context Hints**: Automatically incorporates current route parameters (`pathname`, `teamId`, `classId`, `projectId`) as **untrusted hints**.
4. **Backend Authorization Perimeter**: 100% backend-enforced permissions using `req.user.userId` and live PostgreSQL queries.
5. **Floating Assistant UX**: Floating launcher button across all protected pages opening a responsive right-side drawer with soft purple/blue aesthetics, clean SVG icons (zero emojis), and dynamic context-aware suggestion chips.

---

## 2. Core Architecture & Request Pipeline

```
[ User Question + Untrusted Page Context Hints ]
               │
               ▼
[ POST /api/ai/assistant ] (Auth Middleware: req.user.userId)
               │
               ▼
[ Single-Pass Groq Tool Router ] ──► Infers intent & selects candidate tools
               │
               ▼
[ Backend Scope & Entity Resolver ] ──► Validates teamId/classId & resolves entity names
               │
               ▼
[ Allowlisted Tool Registry (Tool.authorize) ] ──► Live PostgreSQL permission check
               │
          ┌────┴─────────────────────────────┐
          ▼ (Authorized)                     ▼ (Unauthorized)
[ Scoped SQL Repository Query ]     [ Safe Permission Boundary ]
(Forced Predicates)                 ("Scope access restricted")
          │                                  │
          ▼                                  │
[ Minimal JSON Projections ]                │
          │                                  │
          ▼                                  │
[ PII Masking & XML Tag Fencing ]            │
          │                                  │
          ▼                                  │
[ Groq Response Synthesis ]                  │
          │                                  │
          └──────────────────┬───────────────┘
                             ▼
[ Link Rewriter + Audit Logger + Output ]
```

---

## 3. Mandatory Invariants (Inherited from `one.md`)

1. **LLM & Frontend Hints are NEVER Authorization Boundaries**:
   - Client-provided `pageContext` (`classId`, `teamId`) is treated strictly as an untrusted hint.
   - Authorization is enforced by PostgreSQL queries before operational data reaches the LLM context.
2. **Priya Multi-Class Isolation Rule**:
   - Classroom queries for a target student's work must execute forced SQL predicates:
     `WHERE team_id = ANY(getDescendantTeamIds(classId)) AND user_id = targetUserId`.
   - Work submissions from unauthorized classes (e.g. Class C) and personal `daily_logs` are excluded at the database layer.
3. **No Text-to-SQL**:
   - Operational data access passes strictly through allowlisted, typed tool handlers (`getMyTasks`, `getClassSummary`, `getTeamSummary`, `getClassMemberWork`, `getMyWorkLogs`, `getProjectSummary`, `searchProductHelp`).
4. **Product Help RAG Boundary**:
   - Help RAG is 100% restricted to static Markdown files (`backend/data/help/*.md`). Operational user data is NEVER vectorized.
5. **PII Masking, XML Fencing & Audit Logging**:
   - Operational data embedded in LLM context is wrapped in `<untrusted_user_data>` tags alongside `maskPII()`.
   - Audit entries record `caller_user_id`, `scope_type`, `scope_id`, `tools_called`, and status in `ai_query_audit_logs`.

---

## 4. Entity Resolution & Ambiguity Rules

1. **Scoped Entity Resolution**:
   - When a query references a natural language name (e.g. *"Priya's work"*), the backend resolves the target `user_id` **exclusively within the caller's authorized classroom/team subtrees** (`teamsRepository.getClassMembers(authorizedClassId)`).
   - Global user searches are strictly forbidden.
2. **Ambiguity Handling**:
   - If a query is ambiguous across multiple authorized entities (e.g. caller belongs to 3 teams and asks *"How is my team doing?"* without page hints), the system returns structured `disambiguation` choice options for the user to select.

---

## 5. Explicit Groq Tool-Calling Execution Loop Contract

The V2 tool execution pipeline defines an explicit two-stage provider orchestration contract:

```
User Prompt + Untrusted Page Hints
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│ MODEL CALL 1: Intent & Tool Selection (Groq)            │
│ Input: System Instructions + User Prompt + Hints + Tools │
│ Output: tool_calls: [{ name, arguments }] OR text answer │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│ BACKEND SAFETY & AUTHORIZATION INTERCEPTOR               │
│ 1. Validate tool name against allowlisted aiToolRegistry │
│ 2. Parse arguments & resolve entity UUIDs                │
│ 3. Execute tool.authorize(callerUserId, args) against DB │
│ 4. If Authorized: execute tool.execute(ctx, args)        │
│ 5. If Unauthorized: substitute safe boundary denial text │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼ (If tool called)
┌──────────────────────────────────────────────────────────┐
│ MODEL CALL 2: Authorized Response Synthesis (Groq)       │
│ Input: Conversation History + tool_calls + Tool Results  │
│ Output: Final Natural Language Answer                    │
└──────────────────────────────────────────────────────────┘
```

### 5.1 Model Calls Breakdown & Message Normalization
1. **Model Call 1 (Intent & Tool Selection)**:
   - **Receives**: System instructions, user prompt, untrusted page hints, and the array of allowlisted `AIToolDefinition` schemas (`getMyTasks`, `getClassSummary`, `getProjectSummary`, etc.).
   - **Returns**: Either a `tool_calls` payload specifying the tool name and JSON arguments (e.g. `{ name: 'getProjectSummary', arguments: { projectId: '...' } }`), OR direct text (if no operational tool is needed, e.g. general greeting).
2. **Provider-Safe Conversation History Normalization**:
   - Before Model Call 2 is initiated, stored session messages from `aiSessionRepository` MUST be normalized to contain strictly `{ role, content }` strings.
   - Non-standard metadata properties (e.g. `timestamp`) MUST be stripped to prevent Groq API `HTTP 400 Bad Request` schema errors.
3. **Model Call 2 (Authorized Synthesis - Executed ONLY if Model Call 1 returned `tool_calls`)**:
   - **Receives**: Normalized prior conversation context (`{ role, content }`) + Assistant message containing `tool_calls` + Tool message containing `<untrusted_user_data>` fenced JSON/text results.
   - **Returns**: Synthesized, user-friendly natural language response formatted with internal React Router markdown links.

### 5.2 Authorization, Safety & Implementation Guard Rules

1. **Strict Non-Fallback Rule for Tool Failures**:
   - If Groq returns an **unknown tool name**, **invalid JSON arguments**, or **unsupported parameters**, the system MUST:
     1. **Reject the tool call immediately**.
     2. **Audit the failure event** in `ai_query_audit_logs` with status `invalid_tool_call`.
     3. **Never execute an unintended tool** or substitute Help Center RAG (`searchProductHelp`) for an operational query (such as project progress or blockers).
     4. **Return a safe clarification response**: *"I could not process the details of that request. Please try rephrasing your query."*
2. **Strict Loop & Execution Bounding**:
   - **Maximum Tool Selection Passes**: **Exactly 1 tool selection pass** per user turn. Unbounded or recursive agent loops are strictly prohibited.
   - **Maximum Tool Executions**: **Maximum 1 tool execution** per user request.
   - **Schema Validation**: All tool arguments must pass strict backend validation (`Zod` schema check) before reaching repository code.
3. **Authorization Location**:
   - Executes strictly on the backend inside `tool.authorize(ctx, args)` **between Model Call 1 and Model Call 2**.
4. **Unauthorized Tool Calls**:
   - If `tool.authorize()` evaluates to `false` (e.g. requesting Class C work), the backend intercepts the tool result with safe denial text: *"Access restricted for target resource"* before Model Call 2.

### 5.3 Provider Reliability & Token Accounting
- **Provider Failover**: If Groq returns `401 Unauthorized` or `5xx Server Error`, the orchestrator fails over to `GeminiProvider`.
- **Token Usage Measurement**: Total request token consumption is calculated as:
  $$\text{Tokens}_{\text{total}} = \text{Tokens}_{\text{Call 1}} + \text{Tokens}_{\text{Call 2}}$$
  Reported in API response as `tokensUsed`.

---

## 6. Allowlisted Tool Registry Architecture (7 Tools Total)

| Tool Name | Scope | Authorization Rule | Mandatory SQL Predicate | Max Output Rows |
| :--- | :--- | :--- | :--- | :--- |
| `searchProductHelp` | Global | `privacyService.isAiEnabledForUser()` | `WHERE is_published = true` | 3 chunks |
| `getMyTasks` | Personal | `req.user.userId` | `WHERE owner = $1 OR created_by = $1` | 20 tasks |
| `getMyWorkLogs` | Personal | `req.user.userId` | `WHERE user_id = $1` | 14 logs |
| `getClassSummary` | Classroom | `getMemberRole(caller, classId) IN ('owner', 'admin')` | `WHERE team_id = ANY(getDescendantTeamIds($1))` | 1 summary |
| `getClassMemberWork` | Classroom | `getMemberRole(caller, classId) IN ('owner', 'admin') AND isMember(target, classId)` | `WHERE team_id = ANY(getDescendantTeamIds($1)) AND user_id = $2` | 20 entries |
| `getTeamSummary` | Team | `canAccessTeam(caller, teamId)` | `WHERE team_id = $1` | 1 summary |
| `getProjectSummary` | Project | `canAccessProject(caller, projectId)` | `WHERE project_id = $1` | 1 summary |

*Note*: Operational project queries ("Summarize project progress", "What is blocking this project?") MUST route to `getProjectSummary` and NEVER fallback to `searchProductHelp`.

---

## 7. Target UI/UX & Visual Foundation

1. **Floating AI Launcher**:
   - Accessible via floating action button in the bottom right corner across all protected routes.
2. **Slide-Over Drawer**:
   - Responsive right-side slide-over drawer with soft purple/blue visual styling, clean SVG icons (zero emojis), and rounded card layouts.
3. **Context Badge**:
   - Displays a small non-editable badge (`Active Context · Tasks`, `Active Context · Web Development Team`, `Active Context · Project Execution`) reflecting the current page context.
4. **Dynamic Context-Aware Suggestions**:
   - Context-sensitive prompt chips (e.g. *"What are my tasks today?"*, *"How is my team progressing?"*, *"What is blocking this project?"*).

---

## 8. Verification & Acceptance Criteria

1. Zero manual scope dropdown requirement.
2. 100% backend-enforced authorization for all 7 allowlisted tool executions.
3. Operational project queries execute `getProjectSummary` cleanly without Help RAG substitution.
4. Conversation history normalized to `{ role, content }` before Model Call 2 (preventing Groq HTTP 400 errors).
5. Zero data leakage across Class A and Class C in Priya Multi-Class security scenarios.
6. Token consumption measured accurately across two-pass tool loop (< 1200 tokens total).
7. All 56+ integration tests passing with 0 regressions.
