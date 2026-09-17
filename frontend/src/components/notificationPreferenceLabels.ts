// Mirrors backend/src/modules/notifications/notifications.dto.ts's
// NOTIFICATION_PREFERENCE_KEYS exactly -- kept as a small separate file
// (not inlined in NotificationBell.tsx) so it can also be imported by
// tests without pulling in the whole component.
export const NOTIFICATION_PREFERENCE_LABELS: Record<string, string> = {
  team_join_request: 'Team join requests',
  goal_creation: 'Goal creation proposals & approvals',
  goal_completion: 'Goal completion approvals',
  goal_review: 'Goal progress & review sign-offs',
  task_assignment: 'Task assignments',
  task_review: 'Task review & approval updates',
  blocker: 'Blockers & SOS alerts',
  guidance: 'Guidance & leadership recommendations',
  chat_message: 'Chat messages',
  password_change: 'Password security alerts',
  email_change: 'Email security alerts',
  phone_verification: 'Phone verification alerts',
};
