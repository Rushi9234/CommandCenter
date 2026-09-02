// Mirrors backend/src/modules/notifications/notifications.dto.ts's
// NOTIFICATION_PREFERENCE_KEYS exactly -- kept as a small separate file
// (not inlined in NotificationBell.tsx) so it can also be imported by
// tests without pulling in the whole component.
export const NOTIFICATION_PREFERENCE_LABELS: Record<string, string> = {
  team_join_request: 'Team join requests',
  goal_creation: 'Goal creation approvals',
  goal_completion: 'Goal completion approvals',
  task_assignment: 'Task assignments',
  blocker: 'Blockers',
};
