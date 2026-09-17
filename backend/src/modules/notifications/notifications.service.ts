import { notificationsRepository } from './notifications.repository';
import { usersRepository } from '../users/users.repository';
import { teamsRepository } from '../teams/teams.repository';
import { NotFoundError } from '../../common/errors';
import { createRealtimeEvent, realtimeProvider } from '../../realtime/inMemoryRealtimeProvider';
import { NOTIFICATION_PREFERENCE_KEYS } from './notifications.dto';

const DEFAULT_PREFERENCES: Record<string, boolean> = Object.fromEntries(
  NOTIFICATION_PREFERENCE_KEYS.map((key) => [key, true])
);

type PreferenceGroup = (typeof NOTIFICATION_PREFERENCE_KEYS)[number];

interface NotifyParams {
  recipientUserId: string;
  category: string;
  preferenceGroup: PreferenceGroup;
  title: string;
  message: string;
  teamId?: string;
  projectId?: string;
  goalId?: string;
  taskId?: string;
  blockerId?: string;
  conversationId?: string;
}

// Server-authoritative notification creation. Every feature module (teams,
// goals, projects/tasks, blockers) calls THIS instead of ever inserting
// into `notifications` directly -- one place that (a) checks the
// recipient's own preference before persisting anything, (b) is the only
// code path allowed to publish a `notification.created` realtime event, and
// (c) never lets a caller-supplied recipient bypass anything, since every
// call site below computes recipients from team-membership/ownership data
// it already trusted for the underlying action, never from client input.
export class NotificationsService {
  // Deliberately fire-and-forget from the CALLER's perspective: every call
  // site below is `await`ed for its own sequencing (so realtime ordering
  // is sane), but a failure here is caught and logged, never rethrown --
  // the business action that triggered it (approving a join request,
  // creating a goal, etc.) must succeed or fail on its own merits,
  // regardless of whether the notification side-effect could be persisted.
  // Notification delivery is best-effort by design, not transactional with
  // the business event.
  async notifyUser(params: NotifyParams): Promise<void> {
    try {
      const user = await usersRepository.getUserById(params.recipientUserId);
      if (!user) return;

      const prefs = { ...DEFAULT_PREFERENCES, ...(user.notification_preferences || {}) };
      if (prefs[params.preferenceGroup] === false) return;

      await notificationsRepository.create({
        user_id: params.recipientUserId,
        category: params.category,
        title: params.title,
        message: params.message,
        team_id: params.teamId,
        project_id: params.projectId,
        goal_id: params.goalId,
        task_id: params.taskId,
        blocker_id: params.blockerId,
        conversation_id: params.conversationId,
      });

      // No notification payload is embedded in the realtime event itself
      // (SSE events here are deliberately thin, matching join_request.*'s
      // existing shape) -- the frontend treats this purely as "something
      // changed, go get the authoritative state" (unread count + a scoped
      // list refetch when the panel is open), never as the source of
      // truth for the notification's own content.
      realtimeProvider.publish(createRealtimeEvent('notification.created', { recipientUserId: params.recipientUserId }));
    } catch (error) {
      console.error('[notifications] Failed to create notification (non-fatal):', error);
    }
  }

  // Bulk recipient helper for "notify this team's leadership" events
  // (join request received, goal proposal awaiting approval, new
  // blocker). Reuses teamsRepository.getTeamMembers (already a single
  // bulk query, the same one Teams.tsx's member list and blockers'
  // suggestTeamHelpers both already rely on) and filters roles in memory
  // rather than adding a second, narrower repository method -- a team's
  // member count is small enough (this app's own target scale is
  // 200-500 teams, not 200-500 members per team) that this is not an N+1
  // concern the way per-notification queries would be.
  // Same fire-and-forget/never-throws contract as notifyUser above --
  // this wraps its OWN body in try/catch too (not just relying on
  // notifyUser's), since the getTeamMembers call and the filter/map here
  // happen before any individual notifyUser call and could otherwise
  // still propagate a failure up into the caller's business action
  // (createGoal/requestJoin/createBlocker etc.) if left unguarded.
  async notifyTeamMembersByRole(
    teamId: string,
    roles: string[],
    params: Omit<NotifyParams, 'recipientUserId' | 'teamId'>,
    excludeUserId?: string
  ): Promise<void> {
    try {
      const members = await teamsRepository.getTeamMembers(teamId);
      const recipients = members.filter((m: any) => roles.includes(m.role) && m.user_id !== excludeUserId);
      await Promise.all(
        recipients.map((m: any) => this.notifyUser({ ...params, recipientUserId: m.user_id, teamId }))
      );
    } catch (error) {
      console.error('[notifications] Failed to notify team members by role (non-fatal):', error);
    }
  }

  async getMyNotifications(userId: string, limit: number, offset: number) {
    const [notifications, unreadCount] = await Promise.all([
      notificationsRepository.listForUser(userId, limit, offset),
      notificationsRepository.countUnread(userId),
    ]);
    return { notifications, unreadCount };
  }

  async markAsRead(userId: string, notificationId: string) {
    return notificationsRepository.markRead(notificationId, userId);
  }

  async markAllAsRead(userId: string) {
    const count = await notificationsRepository.markAllRead(userId);
    return { markedCount: count };
  }

  async getPreferences(userId: string) {
    const user = await usersRepository.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return { ...DEFAULT_PREFERENCES, ...(user.notification_preferences || {}) };
  }

  async updatePreferences(userId: string, updates: Record<string, boolean>) {
    const user = await usersRepository.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    const current = { ...DEFAULT_PREFERENCES, ...(user.notification_preferences || {}) };
    const merged = { ...current, ...updates };
    const updated = await usersRepository.updateUser(userId, { notification_preferences: merged });
    return updated.notification_preferences;
  }
}

export const notificationsService = new NotificationsService();
