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
  metadata?: any;
  [key: string]: any;
}): NotificationDestination | null {
  const category = notification.category || '';

  const conversationId = notification.conversation_id || notification.conversationId || notification.metadata?.conversationId || notification.metadata?.conversation_id || null;
  const teamId = notification.team_id || notification.teamId || notification.metadata?.teamId || notification.metadata?.team_id || null;
  const projectId = notification.project_id || notification.projectId || notification.metadata?.projectId || notification.metadata?.project_id || null;
  const goalId = notification.goal_id || notification.goalId || notification.metadata?.goalId || notification.metadata?.goal_id || null;
  const taskId = notification.task_id || notification.taskId || notification.metadata?.taskId || notification.metadata?.task_id || null;
  const blockerId = notification.blocker_id || notification.blockerId || notification.metadata?.blockerId || notification.metadata?.blocker_id || null;

  if (category.startsWith('chat.')) {
    if (!conversationId) return null;
    return { path: '/chat', params: { conversation: conversationId } };
  }

  if (category.startsWith('team.')) {
    if (!teamId) return null;
    const params: Record<string, string> = { teamId };
    if (taskId) params.taskId = taskId;
    return { path: '/teams', params };
  }

  if (category.startsWith('goal.')) {
    if (!goalId) return null;
    const params: Record<string, string> = { goalId };
    if (teamId) params.teamId = teamId;
    return { path: '/goals', params };
  }

  if (category === 'task.creation_proposed') {
    if (!projectId) return null;
    const params: Record<string, string> = { projectId };
    if (taskId) params.taskId = taskId;
    return { path: '/projects', params };
  }

  if (category.startsWith('task.')) {
    if (projectId) {
      const params: Record<string, string> = { projectId };
      if (taskId) params.taskId = taskId;
      return { path: '/projects', params };
    }
    if (teamId) {
      const params: Record<string, string> = { teamId };
      if (taskId) params.taskId = taskId;
      return { path: '/teams', params };
    }
    return null;
  }

  if (category.startsWith('project.')) {
    if (!projectId) return null;
    const params: Record<string, string> = { projectId };
    if (taskId) params.taskId = taskId;
    return { path: '/projects', params };
  }

  if (category.startsWith('blocker.')) {
    if (!teamId) return null;
    const params: Record<string, string> = { teamId };
    if (blockerId) params.blockerId = blockerId;
    return { path: '/help', params };
  }

  if (category === 'guidance') {
    return { path: '/help', params: {} };
  }

  // Unknown/future category with no mapping yet -- fail safe (no
  // navigation) rather than guessing a destination.
  return null;
}
