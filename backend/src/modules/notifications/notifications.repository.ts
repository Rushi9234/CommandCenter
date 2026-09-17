import { query, queryOne } from '../../db/client';

// Moved out of the create() insert list on purpose: notifications are
// never updated after creation except read_at (markRead/markAllRead
// below) -- there is no generic updatable-columns allowlist here because
// nothing else about a notification is ever mutated by anyone, including
// its own recipient.
export class NotificationsRepository {
  async create(data: {
    user_id: string;
    category: string;
    title: string;
    message: string;
    team_id?: string;
    project_id?: string;
    goal_id?: string;
    task_id?: string;
    blocker_id?: string;
    conversation_id?: string;
  }) {
    const text = `
      INSERT INTO notifications (
        user_id, category, title, message, team_id, project_id, goal_id, task_id, blocker_id, conversation_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const params = [
      data.user_id,
      data.category,
      data.title,
      data.message,
      data.team_id || null,
      data.project_id || null,
      data.goal_id || null,
      data.task_id || null,
      data.blocker_id || null,
      data.conversation_id || null,
    ];
    return queryOne<any>(text, params);
  }

  // Newest-first, paginated -- the only real access pattern this table
  // ever needs (idx_notifications_user_created covers this exactly).
  async listForUser(userId: string, limit: number, offset: number) {
    const text = `
      SELECT * FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    return query<any>(text, [userId, limit, offset]);
  }

  async countUnread(userId: string): Promise<number> {
    const text = 'SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL';
    const result = await queryOne<any>(text, [userId]);
    return parseInt(result?.count || '0', 10);
  }

  // Ownership predicate for requireAccess (route-level gate), same pattern
  // as canWriteGoal/canAccessBlocker elsewhere -- never trust the route
  // param alone.
  async isRecipient(userId: string, notificationId: string): Promise<boolean> {
    const text = 'SELECT 1 FROM notifications WHERE notification_id = $1 AND user_id = $2';
    const result = await queryOne(text, [notificationId, userId]);
    return result !== null;
  }

  // userId included in the WHERE clause too, as defense in depth on top of
  // the route-level requireAccess(isRecipient) check -- an IDOR here would
  // let one user mark another user's notification read, so this is worth
  // the belt-and-suspenders. Idempotent: re-marking an already-read
  // notification is a no-op (WHERE read_at IS NULL), not an error.
  async markRead(notificationId: string, userId: string) {
    const text = `
      UPDATE notifications
      SET read_at = CURRENT_TIMESTAMP
      WHERE notification_id = $1 AND user_id = $2 AND read_at IS NULL
      RETURNING *
    `;
    return queryOne<any>(text, [notificationId, userId]);
  }

  async markAllRead(userId: string): Promise<number> {
    const text = `
      UPDATE notifications
      SET read_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND read_at IS NULL
      RETURNING notification_id
    `;
    const result = await query(text, [userId]);
    return result.length;
  }
}

export const notificationsRepository = new NotificationsRepository();
