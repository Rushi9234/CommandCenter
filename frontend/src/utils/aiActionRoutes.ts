export interface AIAction {
  type:
    | 'open_task'
    | 'open_project'
    | 'open_team'
    | 'open_goal'
    | 'open_member'
    | 'view_overdue'
    | 'view_blockers'
    | 'view_high_priority'
    | 'view_all';
  entityId?: string;
  projectId?: string;
  label: string;
}

/**
 * Resolves an AI action strictly to a known internal CommandCenter route.
 * Prevents arbitrary AI-generated external URL execution.
 */
export function resolveActionRoute(action: AIAction): string {
  switch (action.type) {
    case 'open_task':
      if (action.projectId && action.entityId) {
        return `/projects?projectId=${encodeURIComponent(action.projectId)}&taskId=${encodeURIComponent(action.entityId)}`;
      }
      return action.entityId ? `/projects?taskId=${encodeURIComponent(action.entityId)}` : '/projects';
    case 'open_project':
      return action.entityId ? `/projects?projectId=${encodeURIComponent(action.entityId)}` : '/projects';
    case 'open_team':
      return action.entityId ? `/teams/${encodeURIComponent(action.entityId)}` : '/teams';
    case 'open_goal':
      return action.entityId ? `/goals?goalId=${encodeURIComponent(action.entityId)}` : '/goals';
    case 'open_member':
      return action.entityId ? `/analytics/members/${encodeURIComponent(action.entityId)}` : '/teams';
    case 'view_overdue':
      return '/tasks?filter=overdue';
    case 'view_blockers':
      return '/projects?filter=blockers';
    case 'view_high_priority':
      return '/tasks?filter=high_priority';
    case 'view_all':
      return '/tasks';
    default:
      return '/overview';
  }
}
