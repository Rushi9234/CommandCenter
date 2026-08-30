import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

export const createGoalSchema = z.object({
  title: requiredString('Goal title is required', 1, 255),
  description: z.string().max(5000).optional(),
  // Goal type requiredness fix: the frontend has always labeled this
  // "Goal type *" (implying mandatory), but this was `.optional()` here,
  // silently defaulting to 'project' server-side (goals.service.ts) --
  // the label and the actual contract disagreed. The create form's select
  // always has a value (including the "Other" -> custom-text path, which
  // sends the custom text as goalType, never the literal string "other"),
  // so making this genuinely required matches what every real caller
  // already sends; nothing behavioral changes for the existing UI.
  goalType: requiredString('Goal type is required', 1, 50),
  parentGoalId: z.string().uuid().optional(),
  targetDate: z.string().optional(),
  teamId: z.string().optional(),
});

// Milestone 35: was z.record(z.any()) -- any body key reached
// GOAL_UPDATABLE_COLUMNS's buildSetClause allowlist unchecked, including
// completed_at (client could set an arbitrary completion timestamp
// independent of status) and progress (no bound). Explicit fields only;
// completed_at is deliberately absent -- goals.service.ts derives it from
// status transitions, it is never client-writable. Enum/length values
// below are the exact set the frontend's own dropdowns use (Goals.tsx).
// Schema-drift fix: goal_type used to be validated here against a
// 4-value enum ('company'/'department'/'project'/'milestone') left over
// from before the create form's type list grew to 9+ values. Nothing in
// Goals.tsx has ever sent goal_type on an update -- there is no
// type-editing UI at all -- so this field was dead validation that would
// have incorrectly rejected any legitimate newer type value (e.g.
// 'research') the moment type-editing was ever wired up, while silently
// doing nothing today. Removed rather than widened: the current
// architecture genuinely does not support editing a goal's type after
// creation, so the schema should say that honestly instead of pretending
// the capability exists. If type-editing is added later, this is the
// place to add a field that mirrors createGoalSchema's goalType exactly
// (free string, not a fabricated enum -- goal_type has never had a DB-
// level constraint either).
export const updateGoalSchema = z
  .object({
    title: z.string().min(1).max(255),
    description: z.string().max(5000),
    status: z.enum(['planning', 'active', 'at_risk', 'blocked', 'completed']),
    progress: z.number().int().min(0).max(100),
    parent_goal_id: z.string().uuid().nullable(),
    target_date: z.string(),
  })
  .partial();

// Review workflow: 'pending_review' is deliberately NOT in updateGoalSchema
// above -- it's only ever set by goals.service.ts's submitForReview (via
// POST /goals/:goalId/submit-review), which also stamps who/when. Allowing
// it through the generic PUT would let a client set the status without
// that attribution. returnGoalSchema is optional -- goals.service.ts
// defaults to 'active' when the leader doesn't specify a target status.
export const returnGoalSchema = z
  .object({
    status: z.enum(['active', 'blocked']),
  })
  .partial();

// Corrective fix: submit-review now carries the member's actual intent.
// Omitting requestedStatus means "sign off on where this stands" --
// goals.service.ts defaults it to the goal's current status, NOT
// completion. Only an explicit requestedStatus: 'completed' is a real
// completion request. This is the one place 'completed' may legitimately
// appear in a client-supplied status-like field -- unlike the generic PUT
// (updateGoalSchema), which deliberately blocks it for team goals -- because
// reaching 'completed' from here still requires a separate leader approval
// before it takes effect.
export const submitReviewSchema = z
  .object({
    requestedStatus: z.enum(['planning', 'active', 'at_risk', 'blocked', 'completed']),
  })
  .partial();
