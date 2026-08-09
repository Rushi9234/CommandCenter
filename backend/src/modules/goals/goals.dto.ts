import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

export const createGoalSchema = z.object({
  title: requiredString('Goal title is required', 1, 255),
  description: z.string().max(5000).optional(),
  goalType: z.string().optional(),
  parentGoalId: z.string().optional(),
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
export const updateGoalSchema = z
  .object({
    title: z.string().min(1).max(255),
    description: z.string().max(5000),
    goal_type: z.enum(['company', 'department', 'project', 'milestone']),
    status: z.enum(['planning', 'active', 'at_risk', 'blocked', 'completed']),
    progress: z.number().int().min(0).max(100),
    parent_goal_id: z.string().uuid().nullable(),
    target_date: z.string(),
  })
  .partial();
