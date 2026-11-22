# CommandCenter AI Assistant Technical Architecture Reference

## 1. Component Topology & Request Flow

```
[ Frontend Drawer / UI ]
        │
        │ POST /api/ai/assistant (JWT Session Token)
        ▼
[ Express Router & Auth Middleware ] ──► Validates req.user.userId & privacy opt-in
        │
        ▼
[ Scope Resolver & Intent Classifier ] ──► Validates caller scope & resolves descendant teams
        │
        ├──────────────────────────┐
        │ (Help Query)             │ (Operational Query)
        ▼                          ▼
[ Help Center RAG ]       [ Scope-Gated Tool Engine ]
(Static Docs)             - Executed via pre-authorized SQL repositories
        │                          │
        └────────────┬─────────────┘
                     │ (Minimal JSON Projections)
                     ▼
[ Sanitizer & XML Guard ] ─────────► maskPII() + <untrusted_user_data> Fencing
                     │
                     ▼
[ AI Provider Layer ] ──────────────► GroqProvider / GeminiProvider via AIProvider
                     │
                     ▼
[ Output Filter & Audit Logger ] ──► Internal Link Rewriter & ai_query_audit_logs Writer
```

---

## 2. Backend Scope Resolver & Descendant Helper

### 2.1 The `getDescendantTeamIds(classId)` Recursive Query

To guarantee bounded, cycle-safe hierarchy resolution when a classroom contains sub-teams:

```sql
WITH RECURSIVE team_tree AS (
  SELECT team_id, parent_team_id, 1 AS depth
  FROM teams
  WHERE team_id = $1
  UNION ALL
  SELECT t.team_id, t.parent_team_id, tt.depth + 1
  FROM teams t
  INNER JOIN team_tree tt ON t.parent_team_id = tt.team_id
  WHERE tt.depth < 5 -- Enforce max 5 hierarchy levels to prevent infinite loops
)
SELECT team_id FROM team_tree;
```

---

## 3. Tool Execution Engine Architecture

Each tool handler in `backend/src/modules/ai/tools/` is a pure typed module with a standard execution signature:

```typescript
export interface AIToolContext {
  callerUserId: string;
  scopeType?: string;
  scopeId?: string;
}

export interface AIToolHandler<TInput = any, TOutput = any> {
  name: string;
  description: string;
  parameters: Record<string, any>;
  authorize(ctx: AIToolContext, input: TInput): Promise<boolean>;
  execute(ctx: AIToolContext, input: TInput): Promise<TOutput>;
}
```

---

## 4. Extended AI Provider Abstraction

Extended `AIProvider` contract (`backend/src/modules/ai/providers/aiProvider.interface.ts`):

```typescript
export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface AICompletionResult {
  content: string;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, any>;
  }>;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AIProvider {
  generateCompletion(messages: AIMessage[], options?: AICompletionOptions): Promise<string>;
  generateWithTools?(
    messages: AIMessage[],
    tools: AIToolDefinition[],
    options?: AICompletionOptions
  ): Promise<AICompletionResult>;
}
```

---

## 5. Database Schema Relationships

```
┌───────────────────┐       ┌───────────────────┐
│       users       │       │       teams       │
│  user_id (PK)     │       │  team_id (PK)     │
└─────────▲─────────┘       │  parent_team_id   │
          │                 └─────────▲─────────┘
          │                           │
┌─────────┴─────────┐       ┌─────────┴─────────┐
│   team_members    │       │daily_work_submiss.│
│  user_id (FK)     │       │  user_id (FK)     │
│  team_id (FK)     │       │  team_id (FK)     │
│  role (CHECK)     │       └───────────────────┘
└───────────────────┘
```

- **Roles**: `'owner'`, `'admin'`, `'manager'`, `'member'`, `'viewer'`.
- **Team Types**: `'classroom'`, `'team'`.
