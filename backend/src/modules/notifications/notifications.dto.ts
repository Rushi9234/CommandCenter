import { z } from 'zod';

// The known preference categories -- these are the product-level groups
// a user toggles (coarser than the granular `category` string stored per
// notification row, e.g. 'goal.creation_proposed' and
// 'goal.creation_approved' both belong to the 'goal_creation' group).
// Adding a new granular notification category later does NOT require a
// schema change here or on the notifications table (category is free
// text there); it only needs a mapping to one of these groups in
// notifications.service.ts.
export const NOTIFICATION_PREFERENCE_KEYS = [
  'team_join_request',
  'goal_creation',
  'goal_completion',
  'task_assignment',
  'blocker',
  'password_change',
] as const;

// Every key optional/partial -- a caller only sends the categories they
// want to change, exactly like updateGoalSchema/updateTeamSettingsSchema
// elsewhere in this codebase. .strict() (not zod's default "strip" mode)
// so an unrecognized category name is rejected with a clear 400 instead
// of being silently dropped -- a typo'd or made-up category should never
// look like a successful no-op update.
export const updateNotificationPreferencesSchema = z
  .object(
    Object.fromEntries(NOTIFICATION_PREFERENCE_KEYS.map((key) => [key, z.boolean()])) as Record<
      (typeof NOTIFICATION_PREFERENCE_KEYS)[number],
      z.ZodBoolean
    >
  )
  .partial()
  .strict();

export const listNotificationsQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
});
