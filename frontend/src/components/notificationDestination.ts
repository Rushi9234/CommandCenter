// Deep-link mapping: a notification's `category` (granular, e.g.
// 'goal.creation_proposed') plus whichever entity-reference columns the
// backend already returns (team_id/project_id/goal_id/task_id/blocker_id
// -- notifications.repository.ts's `SELECT *`/`RETURNING *`, no backend
// change needed) determine where a click should navigate. Kept as a pure
// function, separate from NotificationBell.tsx, so it's independently
// testable and so the mapping is one obvious place to extend when a new
// category is added later.
//
// Routes are flat with no dynamic segments anywhere in this app
// (App.tsx) -- query-string params are the smallest mechanism that fits
// the existing architecture: bookmarkable/refresh-safe for free (each
// destination page reads them straight from the URL on mount via
// useSearchParams, regardless of whether the page was reached by an
// in-app click or a fresh page load), and needs zero new route
// definitions.
export interface NotificationDestination {
  path: string;
  params: Record<string, string>;
}

export function getNotificationDestination(notification: {
  category?: string;
  team_id?: string | null;
  project_id?: string | null;
  goal_id?: string | null;
  task_id?: string | null;
  blocker_id?: string | null;
  conversation_id?: string | null;
}): NotificationDestination | null {
  const category = notification.category || '';

  if (category.startsWith('chat.')) {
    if (!notification.conversation_id) return null;
    return { path: '/chat', params: { conversation: notification.conversation_id } };
  }

  if (category.startsWith('team.')) {
    if (!notification.team_id) return null;
    return { path: '/teams', params: { teamId: notification.team_id } };
  }

  if (category.startsWith('goal.')) {
    if (!notification.goal_id) return null;
    const params: Record<string, string> = { goalId: notification.goal_id };
    if (notification.team_id) params.teamId = notification.team_id;
    return { path: '/goals', params };
  }

  if (category.startsWith('task.')) {
    if (!notification.project_id) return null;
    const params: Record<string, string> = { projectId: notification.project_id };
    if (notification.task_id) params.taskId = notification.task_id;
    return { path: '/projects', params };
  }

  if (category.startsWith('project.')) {
    if (!notification.project_id) return null;
    return { path: '/projects', params: { projectId: notification.project_id } };
  }

  if (category.startsWith('blocker.')) {
    if (!notification.team_id) return null;
    const params: Record<string, string> = { teamId: notification.team_id };
    if (notification.blocker_id) params.blockerId = notification.blocker_id;
    return { path: '/help', params };
  }

  if (category === 'guidance') {
    return { path: '/help', params: {} };
  }

  // Unknown/future category with no mapping yet -- fail safe (no
  // navigation) rather than guessing a destination.
  return null;
}
