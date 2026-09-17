import { query, queryOne } from '../../db/client';

export interface RawTeamWorkSignals {
  team_id: string;
  team_name: string;
  total_assigned_tasks: number;
  in_progress_tasks: number;
  completed_tasks: number;
  remaining_tasks: number;
  completed_tasks_7d: number;
  stalled_tasks: number;
  total_goals: number;
  active_goals: number;
  completed_goals: number;
  avg_goal_progress: number;
  open_blockers: number;
  critical_high_blockers: number;
  reopened_tasks: number;
  submitted_today: boolean;
  member_count: number;
}

export class AttentionRepository {
  /**
   * Fetches objective, verifiable work signals for a specific team.
   */
  async getRawTeamSignals(teamId: string): Promise<RawTeamWorkSignals | null> {
    const teamRes = await queryOne<{ team_id: string; team_name: string }>(
      `SELECT team_id, team_name FROM teams WHERE team_id = $1`,
      [teamId]
    );

    if (!teamRes) {
      return null;
    }

    // 1. Task metrics & stalled tasks count (active tasks with no transition for >5 days)
    const taskSignals = await queryOne<{
      total_assigned: string;
      in_progress: string;
      completed: string;
      remaining: string;
      completed_7d: string;
      stalled: string;
    }>(
      `
      SELECT
        COUNT(t.task_id) AS total_assigned,
        COUNT(t.task_id) FILTER (WHERE t.status = 'in_progress') AS in_progress,
        COUNT(t.task_id) FILTER (WHERE t.status = 'done') AS completed,
        COUNT(t.task_id) FILTER (WHERE t.status IN ('todo', 'in_progress', 'review')) AS remaining,
        COUNT(t.task_id) FILTER (WHERE t.status = 'done' AND t.completed_at >= NOW() - INTERVAL '7 days') AS completed_7d,
        COUNT(t.task_id) FILTER (
          WHERE t.status IN ('todo', 'in_progress', 'review')
          AND COALESCE(
            (SELECT MAX(created_at) FROM work_state_history WHERE artifact_type = 'task' AND artifact_id = t.task_id),
            t.created_at
          ) < NOW() - INTERVAL '5 days'
        ) AS stalled
      FROM projects p
      JOIN tasks t ON t.project_id = p.project_id
      WHERE p.team_id = $1
      `,
      [teamId]
    );

    // 2. Goal metrics
    const goalSignals = await queryOne<{
      total_goals: string;
      active_goals: string;
      completed_goals: string;
      avg_progress: string;
    }>(
      `
      SELECT
        COUNT(goal_id) AS total_goals,
        COUNT(goal_id) FILTER (WHERE status = 'active') AS active_goals,
        COUNT(goal_id) FILTER (WHERE status = 'completed') AS completed_goals,
        COALESCE(AVG(progress), 0) AS avg_progress
      FROM goals
      WHERE team_id = $1
      `,
      [teamId]
    );

    // 3. Blocker metrics
    const blockerSignals = await queryOne<{
      open_blockers: string;
      critical_high_blockers: string;
    }>(
      `
      SELECT
        COUNT(blocker_id) FILTER (WHERE status IN ('open', 'in_progress')) AS open_blockers,
        COUNT(blocker_id) FILTER (WHERE status IN ('open', 'in_progress') AND urgency IN ('high', 'critical')) AS critical_high_blockers
      FROM blockers
      WHERE team_id = $1
      `,
      [teamId]
    );

    // 4. Reopened tasks from history
    const reopenedSignals = await queryOne<{ reopened_count: string }>(
      `
      SELECT COUNT(history_id) AS reopened_count
      FROM work_state_history
      WHERE team_id = $1 AND artifact_type = 'task' AND event_type = 'reopened'
      `,
      [teamId]
    );

    // 5. Daily work submission today
    const submissionToday = await queryOne<{ count: string }>(
      `
      SELECT COUNT(submission_id) AS count
      FROM daily_work_submissions
      WHERE team_id = $1 AND work_date = CURRENT_DATE
      `,
      [teamId]
    );

    // 6. Member count
    const memberSignals = await queryOne<{ member_count: string }>(
      `SELECT COUNT(user_id) AS member_count FROM team_members WHERE team_id = $1`,
      [teamId]
    );

    return {
      team_id: teamRes.team_id,
      team_name: teamRes.team_name,
      total_assigned_tasks: parseInt(taskSignals?.total_assigned || '0', 10),
      in_progress_tasks: parseInt(taskSignals?.in_progress || '0', 10),
      completed_tasks: parseInt(taskSignals?.completed || '0', 10),
      remaining_tasks: parseInt(taskSignals?.remaining || '0', 10),
      completed_tasks_7d: parseInt(taskSignals?.completed_7d || '0', 10),
      stalled_tasks: parseInt(taskSignals?.stalled || '0', 10),
      total_goals: parseInt(goalSignals?.total_goals || '0', 10),
      active_goals: parseInt(goalSignals?.active_goals || '0', 10),
      completed_goals: parseInt(goalSignals?.completed_goals || '0', 10),
      avg_goal_progress: Math.round(parseFloat(goalSignals?.avg_progress || '0')),
      open_blockers: parseInt(blockerSignals?.open_blockers || '0', 10),
      critical_high_blockers: parseInt(blockerSignals?.critical_high_blockers || '0', 10),
      reopened_tasks: parseInt(reopenedSignals?.reopened_count || '0', 10),
      submitted_today: parseInt(submissionToday?.count || '0', 10) > 0,
      member_count: parseInt(memberSignals?.member_count || '0', 10),
    };
  }

  /**
   * Fetches child team IDs for a parent team context.
   */
  async getChildTeamIds(parentTeamId: string): Promise<{ team_id: string; team_name: string }[]> {
    return query<{ team_id: string; team_name: string }>(
      `SELECT team_id, team_name FROM teams WHERE parent_team_id = $1 ORDER BY team_name ASC`,
      [parentTeamId]
    );
  }

  /**
   * Task #1: Fetches individual work items requiring attention for a specific authenticated user.
   */
  async getIndividualAttentionItems(userId: string) {
    // 1. Open Blockers created by or affecting the user
    const blockers = await query<{
      blocker_id: string;
      title: string;
      urgency: string;
      status: string;
      team_id: string;
      team_name: string;
      created_at: string;
    }>(
      `
      SELECT b.blocker_id, b.title, b.urgency, b.status, b.team_id, t.team_name, b.created_at::text
      FROM blockers b
      JOIN teams t ON t.team_id = b.team_id
      WHERE b.status IN ('open', 'in_progress')
        AND (b.created_by = $1 OR b.team_id IN (SELECT team_id FROM team_members WHERE user_id = $1))
      ORDER BY (CASE WHEN b.urgency = 'critical' THEN 1 WHEN b.urgency = 'high' THEN 2 ELSE 3 END), b.created_at DESC
      LIMIT 10
      `,
      [userId]
    );

    // 2. Stalled tasks assigned to the user (>5 days with no state update)
    const stalledTasks = await query<{
      task_id: string;
      title: string;
      status: string;
      project_id: string;
      project_name: string;
      team_id: string;
      team_name: string;
      days_stalled: number;
    }>(
      `
      SELECT t.task_id, t.title, t.status, p.project_id, p.project_name, p.team_id, tm.team_name,
             GREATEST(5, EXTRACT(DAY FROM (NOW() - COALESCE(
               (SELECT MAX(created_at) FROM work_state_history WHERE artifact_type = 'task' AND artifact_id = t.task_id),
               t.created_at
             )))::int) AS days_stalled
      FROM tasks t
      JOIN projects p ON p.project_id = t.project_id
      JOIN teams tm ON tm.team_id = p.team_id
      WHERE (t.owner = $1 OR t.created_by = $1)
        AND t.status IN ('todo', 'in_progress', 'review')
        AND COALESCE(
          (SELECT MAX(created_at) FROM work_state_history WHERE artifact_type = 'task' AND artifact_id = t.task_id),
          t.created_at
        ) < NOW() - INTERVAL '5 days'
      ORDER BY days_stalled DESC
      LIMIT 10
      `,
      [userId]
    );

    // 3. Overdue tasks assigned to the user
    const overdueTasks = await query<{
      task_id: string;
      title: string;
      status: string;
      due_date: string;
      project_id: string;
      project_name: string;
      team_id: string;
      team_name: string;
      days_overdue: number;
    }>(
      `
      SELECT t.task_id, t.title, t.status, p.deadline::text AS due_date, p.project_id, p.project_name, p.team_id, tm.team_name,
             GREATEST(1, EXTRACT(DAY FROM (NOW() - p.deadline))::int) AS days_overdue
      FROM tasks t
      JOIN projects p ON p.project_id = t.project_id
      JOIN teams tm ON tm.team_id = p.team_id
      WHERE (t.owner = $1 OR t.created_by = $1)
        AND t.status IN ('todo', 'in_progress', 'review')
        AND p.deadline IS NOT NULL
        AND p.deadline < NOW()
      ORDER BY p.deadline ASC
      LIMIT 10
      `,
      [userId]
    );

    // 4. Goals created by user needing progress or attention
    const goalsNeedingProgress = await query<{
      goal_id: string;
      title: string;
      status: string;
      progress: number;
      target_date: string | null;
      team_id: string | null;
      team_name: string | null;
    }>(
      `
      SELECT g.goal_id, g.title, g.status, g.progress, g.target_date::text, g.team_id, tm.team_name
      FROM goals g
      LEFT JOIN teams tm ON tm.team_id = g.team_id
      WHERE g.created_by = $1
        AND g.status = 'active'
        AND (g.progress = 0 OR (g.target_date IS NOT NULL AND g.target_date < CURRENT_DATE))
      ORDER BY g.created_at DESC
      LIMIT 10
      `,
      [userId]
    );

    return {
      blockers,
      stalledTasks,
      overdueTasks,
      goalsNeedingProgress,
    };
  }

  /**
   * Task #1: Fetches detailed item evidence for a team action center.
   */
  async getTeamDetailedAttentionSignals(teamId: string) {
    // 1. Open blockers list
    const openBlockers = await query<{
      blocker_id: string;
      title: string;
      urgency: string;
      created_at: string;
      creator_name: string;
    }>(
      `
      SELECT b.blocker_id, b.title, b.urgency, b.created_at::text, COALESCE(u.full_name, 'Unknown') AS creator_name
      FROM blockers b
      LEFT JOIN users u ON u.user_id = b.created_by
      WHERE b.team_id = $1 AND b.status IN ('open', 'in_progress')
      ORDER BY (CASE WHEN b.urgency = 'critical' THEN 1 WHEN b.urgency = 'high' THEN 2 ELSE 3 END), b.created_at DESC
      `,
      [teamId]
    );

    // 2. Stalled tasks list
    const stalledTasks = await query<{
      task_id: string;
      title: string;
      project_id: string;
      project_name: string;
      owner_name: string;
      days_stalled: number;
    }>(
      `
      SELECT t.task_id, t.title, p.project_id, p.project_name, COALESCE(u.full_name, 'Unassigned') AS owner_name,
             GREATEST(5, EXTRACT(DAY FROM (NOW() - COALESCE(
               (SELECT MAX(created_at) FROM work_state_history WHERE artifact_type = 'task' AND artifact_id = t.task_id),
               t.created_at
             )))::int) AS days_stalled
      FROM projects p
      JOIN tasks t ON t.project_id = p.project_id
      LEFT JOIN users u ON u.user_id = t.owner
      WHERE p.team_id = $1
        AND t.status IN ('todo', 'in_progress', 'review')
        AND COALESCE(
          (SELECT MAX(created_at) FROM work_state_history WHERE artifact_type = 'task' AND artifact_id = t.task_id),
          t.created_at
        ) < NOW() - INTERVAL '5 days'
      ORDER BY days_stalled DESC
      `,
      [teamId]
    );

    // 3. Overdue tasks list
    const overdueTasks = await query<{
      task_id: string;
      title: string;
      project_id: string;
      project_name: string;
      owner_name: string;
      due_date: string;
      days_overdue: number;
    }>(
      `
      SELECT t.task_id, t.title, p.deadline::text AS due_date, p.project_id, p.project_name, COALESCE(u.full_name, 'Unassigned') AS owner_name,
             GREATEST(1, EXTRACT(DAY FROM (NOW() - p.deadline))::int) AS days_overdue
      FROM projects p
      JOIN tasks t ON t.project_id = p.project_id
      LEFT JOIN users u ON u.user_id = t.owner
      WHERE p.team_id = $1
        AND t.status IN ('todo', 'in_progress', 'review')
        AND p.deadline IS NOT NULL
        AND p.deadline < NOW()
      ORDER BY p.deadline ASC
      `,
      [teamId]
    );

    // 4. Pending join requests list
    const pendingJoinRequests = await query<{
      request_id: string;
      user_id: string;
      user_name: string;
      email: string;
      requested_at: string;
    }>(
      `
      SELECT r.request_id, r.user_id, u.full_name AS user_name, u.email, r.created_at::text AS requested_at
      FROM join_requests r
      JOIN users u ON u.user_id = r.user_id
      WHERE r.team_id = $1 AND r.status = 'pending'
        AND NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = r.team_id AND tm.user_id = r.user_id)
      ORDER BY r.created_at DESC
      `,
      [teamId]
    );

    // 5. Reopened tasks
    const reopenedTasks = await query<{
      history_id: string;
      task_id: string;
      title: string;
      actor_name: string;
      reopened_at: string;
    }>(
      `
      SELECT h.history_id, h.artifact_id AS task_id, COALESCE(t.title, 'Deleted Task') AS title,
             COALESCE(u.full_name, 'Team Member') AS actor_name, h.created_at::text AS reopened_at
      FROM work_state_history h
      LEFT JOIN tasks t ON t.task_id = h.artifact_id
      LEFT JOIN users u ON u.user_id = h.actor_id
      WHERE h.team_id = $1 AND h.artifact_type = 'task' AND h.event_type = 'reopened'
      ORDER BY h.created_at DESC
      LIMIT 10
      `,
      [teamId]
    );

    // 6. Goals needing progress
    const goalsNeedingProgress = await query<{
      goal_id: string;
      title: string;
      status: string;
      progress: number;
      target_date: string | null;
      created_by_name: string;
    }>(
      `
      SELECT g.goal_id, g.title, g.status, g.progress, g.target_date::text,
             COALESCE(u.full_name, 'Team Leader') AS created_by_name
      FROM goals g
      LEFT JOIN users u ON u.user_id = g.created_by
      WHERE g.team_id = $1 AND g.status = 'active'
        AND (g.progress = 0 OR (g.target_date IS NOT NULL AND g.target_date < CURRENT_DATE))
      ORDER BY g.created_at DESC
      LIMIT 10
      `,
      [teamId]
    );

    return {
      openBlockers,
      stalledTasks,
      overdueTasks,
      pendingJoinRequests,
      reopenedTasks,
      goalsNeedingProgress,
    };
  }
}

export const attentionRepository = new AttentionRepository();
