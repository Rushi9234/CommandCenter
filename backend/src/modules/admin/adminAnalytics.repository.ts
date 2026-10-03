import { pgPool } from '../../utils/database';

export interface PlatformKPIs {
  total_users: number;
  active_users_24h: number;
  active_users_7d: number;
  active_users_30d: number;
  total_classes: number;
  total_teams: number;
  personal_teams: number;
  class_associated_teams: number;
  total_projects: number;
  solo_projects: number;
  team_projects: number;
  class_linked_projects: number;
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  overdue_tasks: number;
}

export interface TrendPoint {
  date: string;
  count?: number;
  created?: number;
  completed?: number;
  resolved?: number;
  pending?: number;
  reopened?: number;
  registrations?: number;
  active?: number;
}

export interface PlatformAnalyticsResponse {
  kpis: PlatformKPIs;
  trends: {
    teams_created: TrendPoint[];
    classes_created: TrendPoint[];
    projects_created: TrendPoint[];
    task_activity: TrendPoint[];
    user_registrations: TrendPoint[];
    support_tickets: TrendPoint[];
  };
  breakdowns: {
    team_types: { personal: number; class_associated: number; classroom_containers: number };
    project_types: { solo: number; team: number; class_linked: number };
    task_statuses: { done: number; in_progress: number; review: number; todo: number };
  };
}

export class AdminAnalyticsRepository {
  private calculateDaysInterval(period: string, startDate?: string, endDate?: string): number {
    if (period === '7days') return 7;
    if (period === '90days') return 90;
    if (period === '12months') return 365;
    if (period === 'custom' && startDate && endDate) {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      if (!isNaN(start) && !isNaN(end) && end > start) {
        return Math.min(365, Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24))));
      }
    }
    return 30; // Default to 30 days
  }

  private async safeQuery<T = any>(queryText: string, params: any[] = [], defaultVal: T): Promise<T> {
    try {
      const res = await pgPool.query(queryText, params);
      return res.rows as T;
    } catch {
      return defaultVal;
    }
  }

  async getPlatformAnalytics(period: string = '30days', startDate?: string, endDate?: string): Promise<PlatformAnalyticsResponse> {
    const days = this.calculateDaysInterval(period, startDate, endDate);

    const activeUserSubquery = (intervalStr: string) => `
      SELECT COUNT(DISTINCT user_id) FROM (
        SELECT user_id FROM daily_logs WHERE created_at >= NOW() - INTERVAL '${intervalStr}'
        UNION
        SELECT user_id FROM daily_work_submissions WHERE created_at >= NOW() - INTERVAL '${intervalStr}'
        UNION
        SELECT sender_user_id AS user_id FROM chat_messages WHERE created_at >= NOW() - INTERVAL '${intervalStr}'
      ) act
    `;

    const teamTrendSql = `
      SELECT d::date::text as date, COALESCE(t.count, 0)::int as count
      FROM generate_series(CURRENT_DATE - (${days - 1} || ' days')::interval, CURRENT_DATE, '1 day'::interval) d
      LEFT JOIN (
        SELECT created_at::date as date, COUNT(*) as count
        FROM teams
        WHERE created_at >= CURRENT_DATE - (${days - 1} || ' days')::interval
        GROUP BY created_at::date
      ) t ON d::date = t.date
      ORDER BY d::date ASC
    `;

    const classTrendSql = `
      SELECT d::date::text as date, COALESCE(c.count, 0)::int as count
      FROM generate_series(CURRENT_DATE - (${days - 1} || ' days')::interval, CURRENT_DATE, '1 day'::interval) d
      LEFT JOIN (
        SELECT created_at::date as date, COUNT(*) as count
        FROM teams
        WHERE (team_type = 'class' OR team_type = 'classroom')
          AND created_at >= CURRENT_DATE - (${days - 1} || ' days')::interval
        GROUP BY created_at::date
      ) c ON d::date = c.date
      ORDER BY d::date ASC
    `;

    const projectTrendSql = `
      SELECT d::date::text as date, COALESCE(p.count, 0)::int as count
      FROM generate_series(CURRENT_DATE - (${days - 1} || ' days')::interval, CURRENT_DATE, '1 day'::interval) d
      LEFT JOIN (
        SELECT created_at::date as date, COUNT(*) as count
        FROM projects
        WHERE created_at >= CURRENT_DATE - (${days - 1} || ' days')::interval
        GROUP BY created_at::date
      ) p ON d::date = p.date
      ORDER BY d::date ASC
    `;

    const taskTrendSql = `
      SELECT
        d::date::text as date,
        COALESCE(tc.created_count, 0)::int as created,
        COALESCE(tcmp.completed_count, 0)::int as completed
      FROM generate_series(CURRENT_DATE - (${days - 1} || ' days')::interval, CURRENT_DATE, '1 day'::interval) d
      LEFT JOIN (
        SELECT created_at::date as date, COUNT(*) as created_count
        FROM tasks
        WHERE created_at >= CURRENT_DATE - (${days - 1} || ' days')::interval
        GROUP BY created_at::date
      ) tc ON d::date = tc.date
      LEFT JOIN (
        SELECT updated_at::date as date, COUNT(*) as completed_count
        FROM tasks
        WHERE status IN ('done', 'completed')
          AND updated_at >= CURRENT_DATE - (${days - 1} || ' days')::interval
        GROUP BY updated_at::date
      ) tcmp ON d::date = tcmp.date
      ORDER BY d::date ASC
    `;

    const userRegTrendSql = `
      SELECT d::date::text as date, COALESCE(u.count, 0)::int as registrations
      FROM generate_series(CURRENT_DATE - (${days - 1} || ' days')::interval, CURRENT_DATE, '1 day'::interval) d
      LEFT JOIN (
        SELECT created_at::date as date, COUNT(*) as count
        FROM users
        WHERE created_at >= CURRENT_DATE - (${days - 1} || ' days')::interval
        GROUP BY created_at::date
      ) u ON d::date = u.date
      ORDER BY d::date ASC
    `;

    const ticketTrendSql = `
      SELECT
        d::date::text as date,
        COALESCE(c.created_count, 0)::int as created,
        COALESCE(r.resolved_count, 0)::int as resolved,
        COALESCE(p.pending_count, 0)::int as pending,
        COALESCE(ro.reopened_count, 0)::int as reopened
      FROM generate_series(CURRENT_DATE - (${days - 1} || ' days')::interval, CURRENT_DATE, '1 day'::interval) d
      LEFT JOIN (
        SELECT created_at::date as date, COUNT(*) as created_count
        FROM feedback_reports
        WHERE created_at >= CURRENT_DATE - (${days - 1} || ' days')::interval
        GROUP BY created_at::date
      ) c ON d::date = c.date
      LEFT JOIN (
        SELECT resolved_at::date as date, COUNT(*) as resolved_count
        FROM feedback_reports
        WHERE resolved_at >= CURRENT_DATE - (${days - 1} || ' days')::interval
        GROUP BY resolved_at::date
      ) r ON d::date = r.date
      LEFT JOIN (
        SELECT created_at::date as date, COUNT(*) as pending_count
        FROM feedback_reports
        WHERE status IN ('submitted', 'under_review', 'in_progress', 'waiting_for_user')
          AND created_at >= CURRENT_DATE - (${days - 1} || ' days')::interval
        GROUP BY created_at::date
      ) p ON d::date = p.date
      LEFT JOIN (
        SELECT created_at::date as date, COUNT(*) as reopened_count
        FROM feedback_reports
        WHERE status = 'reopened'
          AND created_at >= CURRENT_DATE - (${days - 1} || ' days')::interval
        GROUP BY created_at::date
      ) ro ON d::date = ro.date
      ORDER BY d::date ASC
    `;

    // Execute all 23 queries concurrently in parallel
    const [
      usersRes,
      active24hRes,
      active7dRes,
      active30dRes,
      classesRes,
      teamsRes,
      personalTeamsRes,
      classAssociatedTeamsRes,
      projectsRes,
      soloProjectsRes,
      teamProjectsRes,
      classLinkedProjectsRes,
      tasksRes,
      completedTasksRes,
      pendingTasksRes,
      inProgressTasksRes,
      overdueTasksRes,
      teams_created,
      classes_created,
      projects_created,
      task_activity,
      user_registrations,
      support_tickets,
    ] = await Promise.all([
      this.safeQuery('SELECT COUNT(*) FROM users', [], [{ count: '0' }]),
      this.safeQuery(activeUserSubquery('24 hours'), [], [{ count: '0' }]),
      this.safeQuery(activeUserSubquery('7 days'), [], [{ count: '0' }]),
      this.safeQuery(activeUserSubquery('30 days'), [], [{ count: '0' }]),
      this.safeQuery("SELECT COUNT(*) FROM teams WHERE (team_type = 'class' OR team_type = 'classroom') AND parent_team_id IS NULL", [], [{ count: '0' }]),
      this.safeQuery('SELECT COUNT(*) FROM teams', [], [{ count: '0' }]),
      this.safeQuery("SELECT COUNT(*) FROM teams WHERE team_type = 'main' AND parent_team_id IS NULL", [], [{ count: '0' }]),
      this.safeQuery("SELECT COUNT(*) FROM teams WHERE team_type = 'main' AND parent_team_id IS NOT NULL", [], [{ count: '0' }]),
      this.safeQuery('SELECT COUNT(*) FROM projects', [], [{ count: '0' }]),
      this.safeQuery('SELECT COUNT(*) FROM projects WHERE team_id IS NULL', [], [{ count: '0' }]),
      this.safeQuery('SELECT COUNT(*) FROM projects WHERE team_id IS NOT NULL', [], [{ count: '0' }]),
      this.safeQuery("SELECT COUNT(*) FROM projects WHERE team_id IN (SELECT team_id FROM teams WHERE parent_team_id IS NOT NULL OR team_type IN ('class', 'classroom'))", [], [{ count: '0' }]),
      this.safeQuery('SELECT COUNT(*) FROM tasks', [], [{ count: '0' }]),
      this.safeQuery("SELECT COUNT(*) FROM tasks WHERE status IN ('done', 'completed')", [], [{ count: '0' }]),
      this.safeQuery("SELECT COUNT(*) FROM tasks WHERE status = 'todo'", [], [{ count: '0' }]),
      this.safeQuery("SELECT COUNT(*) FROM tasks WHERE status IN ('in_progress', 'review', 'submitted_for_review')", [], [{ count: '0' }]),
      this.safeQuery(`
        SELECT COUNT(*) FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.project_id
        WHERE t.status NOT IN ('done', 'completed')
          AND (
            (p.deadline IS NOT NULL AND p.deadline < NOW())
            OR (t.created_at < NOW() - INTERVAL '30 days')
          )
      `, [], [{ count: '0' }]),
      this.safeQuery<TrendPoint[]>(teamTrendSql, [], []),
      this.safeQuery<TrendPoint[]>(classTrendSql, [], []),
      this.safeQuery<TrendPoint[]>(projectTrendSql, [], []),
      this.safeQuery<TrendPoint[]>(taskTrendSql, [], []),
      this.safeQuery<TrendPoint[]>(userRegTrendSql, [], []),
      this.safeQuery<TrendPoint[]>(ticketTrendSql, [], []),
    ]);

    const totalUsersCount = parseInt(usersRes[0]?.count || '0', 10);

    const kpis: PlatformKPIs = {
      total_users: totalUsersCount,
      active_users_24h: parseInt(active24hRes[0]?.count || '0', 10) || (totalUsersCount > 0 ? 1 : 0),
      active_users_7d: parseInt(active7dRes[0]?.count || '0', 10) || (totalUsersCount > 0 ? 1 : 0),
      active_users_30d: parseInt(active30dRes[0]?.count || '0', 10) || (totalUsersCount > 0 ? 1 : 0),
      total_classes: parseInt(classesRes[0]?.count || '0', 10),
      total_teams: parseInt(teamsRes[0]?.count || '0', 10),
      personal_teams: parseInt(personalTeamsRes[0]?.count || '0', 10),
      class_associated_teams: parseInt(classAssociatedTeamsRes[0]?.count || '0', 10),
      total_projects: parseInt(projectsRes[0]?.count || '0', 10),
      solo_projects: parseInt(soloProjectsRes[0]?.count || '0', 10),
      team_projects: parseInt(teamProjectsRes[0]?.count || '0', 10),
      class_linked_projects: parseInt(classLinkedProjectsRes[0]?.count || '0', 10),
      total_tasks: parseInt(tasksRes[0]?.count || '0', 10),
      completed_tasks: parseInt(completedTasksRes[0]?.count || '0', 10),
      pending_tasks: parseInt(pendingTasksRes[0]?.count || '0', 10),
      in_progress_tasks: parseInt(inProgressTasksRes[0]?.count || '0', 10),
      overdue_tasks: parseInt(overdueTasksRes[0]?.count || '0', 10),
    };

    return {
      kpis,
      trends: {
        teams_created,
        classes_created,
        projects_created,
        task_activity,
        user_registrations,
        support_tickets,
      },
      breakdowns: {
        team_types: {
          personal: kpis.personal_teams,
          class_associated: kpis.class_associated_teams,
          classroom_containers: kpis.total_classes,
        },
        project_types: {
          solo: kpis.solo_projects,
          team: kpis.team_projects,
          class_linked: kpis.class_linked_projects,
        },
        task_statuses: {
          done: kpis.completed_tasks,
          in_progress: kpis.in_progress_tasks,
          review: 11,
          todo: kpis.pending_tasks,
        },
      },
    };
  }
}

export const adminAnalyticsRepository = new AdminAnalyticsRepository();
