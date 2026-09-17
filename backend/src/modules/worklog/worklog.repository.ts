import { query } from '../../db/client';

export interface WorklogTaskRow {
  task_id: string;
  project_id: string;
  title: string;
  description: string | null;
  owner: string | null;
  contributors: any;
  reviewer: string | null;
  dependencies: any;
  status: string;
  priority: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  project_name: string;
  owner_name?: string | null;
}

export interface WorklogGoalRow {
  goal_id: string;
  title: string;
  description: string | null;
  goal_type: string | null;
  status: string;
  progress: number;
  created_by: string;
  team_id: string | null;
  parent_goal_id: string | null;
  target_date: Date | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  created_by_name?: string | null;
}

export interface WorklogDailySubmissionRow {
  submission_id: string;
  user_id: string;
  team_id: string;
  work_date: Date | string;
  ai_summary: string | null;
  confirmed_summary: string;
  confirmed_at: Date;
  created_at: Date;
  user_full_name: string;
  user_username: string;
}

export interface WorklogBlockerRow {
  blocker_id: string;
  team_id: string;
  title: string;
  description: string | null;
  blocker_type: string | null;
  urgency: string | null;
  impact: string | null;
  affected_tasks: any;
  status: string;
  created_by: string;
  resolved_by: string | null;
  created_at: Date;
  resolved_at: Date | null;
  created_by_name?: string | null;
}

export interface WorklogTeamMemberRow {
  user_id: string;
  team_id: string;
  role: string;
  joined_at: Date;
  full_name: string;
  username: string;
  avatar_key?: string | null;
}

export class WorklogRepository {
  async getTeamProjects(teamId: string) {
    const text = `
      SELECT project_id, project_name, description, status, priority, is_public, deadline, created_by, created_at, updated_at
      FROM projects
      WHERE team_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return query<any>(text, [teamId]);
  }

  async getTasksByProjectIds(projectIds: string[], limit: number = 100): Promise<WorklogTaskRow[]> {
    if (projectIds.length === 0) return [];
    const text = `
      SELECT t.task_id, t.project_id, t.title, t.description, t.owner, t.contributors,
             t.reviewer, t.dependencies, t.status, t.priority, t.created_by,
             t.created_at, t.updated_at, t.completed_at, p.project_name, u.full_name as owner_name
      FROM tasks t
      INNER JOIN projects p ON t.project_id = p.project_id
      LEFT JOIN users u ON t.owner = u.user_id
      WHERE t.project_id = ANY($1)
      ORDER BY t.created_at DESC
      LIMIT $2
    `;
    return query<WorklogTaskRow>(text, [projectIds, limit]);
  }

  async getTeamGoals(teamId: string, limit: number = 100): Promise<WorklogGoalRow[]> {
    const text = `
      SELECT g.goal_id, g.title, g.description, g.goal_type, g.status, g.progress,
             g.created_by, g.team_id, g.parent_goal_id, g.target_date,
             g.created_at, g.updated_at, g.completed_at, u.full_name as created_by_name
      FROM goals g
      LEFT JOIN users u ON g.created_by = u.user_id
      WHERE g.team_id = $1
      ORDER BY g.created_at DESC
      LIMIT $2
    `;
    return query<WorklogGoalRow>(text, [teamId, limit]);
  }

  async getTeamDailySubmissions(teamId: string, limit: number = 100): Promise<WorklogDailySubmissionRow[]> {
    const text = `
      SELECT s.submission_id, s.user_id, s.team_id, s.work_date, s.ai_summary,
             s.confirmed_summary, s.confirmed_at, s.created_at,
             u.full_name as user_full_name, u.username as user_username
      FROM daily_work_submissions s
      INNER JOIN users u ON s.user_id = u.user_id
      WHERE s.team_id = $1
      ORDER BY s.work_date DESC, s.created_at DESC
      LIMIT $2
    `;
    return query<WorklogDailySubmissionRow>(text, [teamId, limit]);
  }

  async getTeamBlockers(teamId: string, limit: number = 100): Promise<WorklogBlockerRow[]> {
    const text = `
      SELECT b.blocker_id, b.team_id, b.title, b.description, b.blocker_type,
             b.urgency, b.impact, b.affected_tasks, b.status, b.created_by,
             b.resolved_by, b.created_at, b.resolved_at, u.full_name as created_by_name
      FROM blockers b
      LEFT JOIN users u ON b.created_by = u.user_id
      WHERE b.team_id = $1
      ORDER BY b.created_at DESC
      LIMIT $2
    `;
    return query<WorklogBlockerRow>(text, [teamId, limit]);
  }

  async getTeamMembers(teamId: string): Promise<WorklogTeamMemberRow[]> {
    const text = `
      SELECT tm.user_id, tm.team_id, tm.role, tm.joined_at, u.full_name, u.username, u.avatar_key
      FROM team_members tm
      INNER JOIN users u ON tm.user_id = u.user_id
      WHERE tm.team_id = $1
      ORDER BY u.full_name ASC
    `;
    return query<WorklogTeamMemberRow>(text, [teamId]);
  }
}

export const worklogRepository = new WorklogRepository();
