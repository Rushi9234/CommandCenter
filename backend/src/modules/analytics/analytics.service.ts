import { query, queryOne } from '../../db/client';
import { teamsRepository } from '../teams/teams.repository';
import { usersRepository } from '../users/users.repository';
import { worklogRepository } from '../worklog/worklog.repository';
import { NotFoundError, ForbiddenError } from '../../common/errors';

export class AnalyticsService {
  async getUserScopes(userId: string) {
    const user = await usersRepository.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Owned classes: teams where created_by = userId AND (team_type = 'class' OR team_type = 'classroom')
    const ownedClasses = await query<any>(
      `SELECT team_id, team_name, description, created_at
       FROM teams
       WHERE created_by = $1 AND (team_type = 'class' OR team_type = 'classroom')
       ORDER BY created_at DESC`,
      [userId]
    );

    // My teams: teams where user is a member (excluding classroom containers)
    const allUserTeams = await teamsRepository.getUserTeams(userId);
    const myTeams = allUserTeams.filter((t: any) => t.team_type !== 'class' && t.team_type !== 'classroom');

    const isClassOwner = ownedClasses.length > 0;
    const isTeamLeader = myTeams.some((t: any) => t.role === 'owner' || t.role === 'admin' || t.role === 'manager');

    return {
      user: { user_id: user.user_id, full_name: user.full_name, role: user.role },
      isClassOwner,
      isTeamLeader,
      ownedClasses: ownedClasses.map((c: any) => ({
        class_id: c.team_id,
        class_name: c.team_name,
        description: c.description,
        created_at: c.created_at,
      })),
      myTeams: myTeams.map((t: any) => ({
        team_id: t.team_id,
        team_name: t.team_name,
        team_type: t.team_type,
        role: t.role,
        parent_team_id: t.parent_team_id,
      })),
    };
  }

  async getClassAnalytics(classId: string, userId: string) {
    const classTeam = await teamsRepository.getTeam(classId);
    if (!classTeam) {
      throw new NotFoundError('Classroom not found');
    }

    // Check authorization: must be creator or owner/admin of class
    const memberRole = await teamsRepository.getMemberRole(userId, classId);
    const isOwner = classTeam.created_by === userId;
    if (!isOwner && memberRole !== 'owner' && memberRole !== 'admin') {
      throw new ForbiddenError('Access denied to class analytics');
    }

    const ownerUser = await usersRepository.getUserById(classTeam.created_by);

    // Get child teams under this classroom
    const childTeams = await teamsRepository.getSubTeams(classId);

    const childTeamIds = childTeams.map((t: any) => t.team_id);
    const allTeamIds = [classId, ...childTeamIds];

    // Fetch aggregate task stats per team
    const teamProgressList = await Promise.all(
      childTeams.map(async (st: any) => {
        const [members, projects, blockers] = await Promise.all([
          worklogRepository.getTeamMembers(st.team_id),
          worklogRepository.getTeamProjects(st.team_id),
          worklogRepository.getTeamBlockers(st.team_id, 100),
        ]);

        const projectIds = projects.map((p: any) => p.project_id);
        const tasks = projectIds.length > 0 ? await worklogRepository.getTasksByProjectIds(projectIds, 1000) : [];

        const assigned = tasks.length;
        const completed = tasks.filter((t) => t.status === 'done').length;
        const pendingReview = tasks.filter((t) => t.status === 'review').length;
        const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
        const openBlockers = blockers.filter((b) => b.status === 'open').length;

        const progressPercent = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;

        return {
          team_id: st.team_id,
          team_name: st.team_name,
          description: st.description,
          member_count: members.length,
          assigned_tasks: assigned,
          completed_tasks: completed,
          pending_review: pendingReview,
          in_progress: inProgress,
          open_blockers: openBlockers,
          progress_percent: progressPercent,
        };
      })
    );

    const totalTeams = childTeams.length;
    const totalMembers = teamProgressList.reduce((acc, t) => acc + t.member_count, 0);
    const assignedTasks = teamProgressList.reduce((acc, t) => acc + t.assigned_tasks, 0);
    const completedTasks = teamProgressList.reduce((acc, t) => acc + t.completed_tasks, 0);
    const pendingReview = teamProgressList.reduce((acc, t) => acc + t.pending_review, 0);
    const openBlockers = teamProgressList.reduce((acc, t) => acc + t.open_blockers, 0);

    const overallClassProgress = assignedTasks > 0 ? Math.round((completedTasks / assignedTasks) * 100) : 0;

    return {
      class_info: {
        class_id: classTeam.team_id,
        class_name: classTeam.team_name,
        description: classTeam.description,
        owner_name: ownerUser?.full_name || 'Class Owner',
        owner_id: classTeam.created_by,
      },
      metrics: {
        total_teams: totalTeams,
        total_members: totalMembers,
        assigned_tasks: assignedTasks,
        completed_tasks: completedTasks,
        pending_review: pendingReview,
        open_blockers: openBlockers,
        overall_progress: overallClassProgress,
      },
      team_comparison: teamProgressList,
    };
  }

  async getTeamAnalytics(teamId: string, userId: string, classId?: string) {
    const team = await teamsRepository.getTeam(teamId);
    if (!team) {
      throw new NotFoundError('Team not found');
    }

    if ((team.team_type === 'class' || team.team_type === 'classroom') && !classId) {
      throw new ForbiddenError('Target entity is a classroom. Open classroom analytics via /analytics/classes/:classId');
    }

    // Verify class relationship if classId is supplied
    if (classId) {
      if (team.parent_team_id !== classId) {
        throw new ForbiddenError('Team does not belong to the specified classroom');
      }
      // Verify caller access to class
      const classTeam = await teamsRepository.getTeam(classId);
      if (!classTeam) {
        throw new NotFoundError('Classroom not found');
      }
      const classMemberRole = await teamsRepository.getMemberRole(userId, classId);
      const isClassOwner = classTeam.created_by === userId;
      if (!isClassOwner && classMemberRole !== 'owner' && classMemberRole !== 'admin') {
        throw new ForbiddenError('Access denied to class context');
      }
    }

    // Authorization check for team analytics
    let authorized = false;
    const memberRole = await teamsRepository.getMemberRole(userId, teamId);
    if (memberRole) {
      authorized = true;
    } else if (team.parent_team_id) {
      const parentRole = await teamsRepository.getMemberRole(userId, team.parent_team_id);
      const parentTeam = await teamsRepository.getTeam(team.parent_team_id);
      if (parentRole === 'owner' || parentRole === 'admin' || parentTeam?.created_by === userId) {
        authorized = true;
      }
    }

    if (!authorized && team.created_by === userId) {
      authorized = true;
    }

    if (!authorized) {
      throw new ForbiddenError('Access denied to team analytics');
    }

    const [leaderUser, teamMembers, projects, goals, dailySubmissions, blockers] = await Promise.all([
      usersRepository.getUserById(team.created_by),
      worklogRepository.getTeamMembers(teamId),
      worklogRepository.getTeamProjects(teamId),
      worklogRepository.getTeamGoals(teamId, 100),
      worklogRepository.getTeamDailySubmissions(teamId, 100),
      worklogRepository.getTeamBlockers(teamId, 100),
    ]);

    const projectIds = projects.map((p: any) => p.project_id);
    const tasks = projectIds.length > 0 ? await worklogRepository.getTasksByProjectIds(projectIds, 1000) : [];

    // Task counts
    const assigned = tasks.length;
    const completed = tasks.filter((t) => t.status === 'done').length;
    const pendingReview = tasks.filter((t) => t.status === 'review').length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const todo = tasks.filter((t) => t.status === 'todo' || !t.status).length;
    const openBlockers = blockers.filter((b) => b.status === 'open').length;

    const overallProgress = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;

    // 7-day trend from work_state_history
    const historyRows = await query<any>(
      `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as event_date, event_type, COUNT(*)::int as count
       FROM work_state_history
       WHERE team_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD'), event_type
       ORDER BY event_date ASC`,
      [teamId]
    );

    const trendMap: Record<string, { completions: number; updates: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      trendMap[dateStr] = { completions: 0, updates: 0 };
    }

    const completionEvents = new Set(['completed', 'task_completed', 'goal_approved', 'blocker_resolved']);

    for (const row of historyRows) {
      const dateStr = String(row.event_date).split('T')[0];
      if (trendMap[dateStr]) {
        if (completionEvents.has(row.event_type)) {
          trendMap[dateStr].completions += row.count;
        } else {
          trendMap[dateStr].updates += row.count;
        }
      }
    }

    const workTrend = Object.keys(trendMap).map((date) => ({
      date,
      completions: trendMap[date].completions,
      updates: trendMap[date].updates,
    }));

    // Member summary (factual progress bar)
    const membersList = teamMembers.map((member: any) => {
      const memberTasks = tasks.filter(
        (t) => t.owner === member.user_id || (Array.isArray(t.contributors) && t.contributors.includes(member.user_id))
      );
      const mAssigned = memberTasks.length;
      const mCompleted = memberTasks.filter((t) => t.status === 'done').length;
      const mPendingReview = memberTasks.filter((t) => t.status === 'review').length;
      const mInProgress = memberTasks.filter((t) => t.status === 'in_progress').length;
      const mProgressPercent = mAssigned > 0 ? Math.round((mCompleted / mAssigned) * 100) : 0;

      return {
        user_id: member.user_id,
        full_name: member.full_name,
        username: member.username,
        role: member.role,
        avatar_key: member.avatar_key || null,
        assigned_tasks: mAssigned,
        completed_tasks: mCompleted,
        pending_review: mPendingReview,
        in_progress: mInProgress,
        progress_percent: mProgressPercent,
      };
    });

    return {
      team_info: {
        team_id: team.team_id,
        team_name: team.team_name,
        description: team.description,
        team_type: team.team_type,
        leader_name: leaderUser?.full_name || 'Team Leader',
        member_count: teamMembers.length,
        parent_team_id: team.parent_team_id,
      },
      progress: {
        assigned,
        in_progress: inProgress,
        pending_review: pendingReview,
        completed,
        open_blockers: openBlockers,
        overall_progress: overallProgress,
      },
      task_distribution: {
        completed,
        in_progress: inProgress,
        pending_review: pendingReview,
        todo,
      },
      work_trend: workTrend,
      breakdowns: {
        goals_total: goals.length,
        goals_completed: goals.filter((g: any) => g.status === 'completed' || g.progress === 100).length,
        open_blockers: openBlockers,
        daily_submissions_count: dailySubmissions.length,
        projects_count: projects.length,
      },
      members: membersList,
    };
  }

  async getMemberAnalytics(memberId: string, userId: string, teamId?: string, classId?: string) {
    const member = await usersRepository.getUserById(memberId);
    if (!member) {
      throw new NotFoundError('Member not found');
    }

    // 1. If classId is supplied, verify class existence & caller access to class
    if (classId) {
      const classTeam = await teamsRepository.getTeam(classId);
      if (!classTeam) {
        throw new NotFoundError('Classroom not found');
      }
      const classMemberRole = await teamsRepository.getMemberRole(userId, classId);
      const isClassOwner = classTeam.created_by === userId;
      if (!isClassOwner && classMemberRole !== 'owner' && classMemberRole !== 'admin') {
        throw new ForbiddenError('Access denied to class context');
      }
      // If teamId is also supplied, verify team belongs to class
      if (teamId) {
        const team = await teamsRepository.getTeam(teamId);
        if (!team || team.parent_team_id !== classId) {
          throw new ForbiddenError('Team does not belong to the specified classroom');
        }
      }
    }

    // 2. If teamId is supplied, verify member actually belongs to teamId
    if (teamId) {
      const memberTeamRole = await teamsRepository.getMemberRole(memberId, teamId);
      if (!memberTeamRole) {
        throw new ForbiddenError('Member does not belong to the specified team context');
      }
    }

    // 3. Authorization check for viewing member analytics
    let authorized = userId === memberId; // Self view always permitted

    if (!authorized && teamId) {
      // Check caller's role in the specified team context
      const callerTeamRole = await teamsRepository.getMemberRole(userId, teamId);
      const team = await teamsRepository.getTeam(teamId);
      if (callerTeamRole === 'owner' || callerTeamRole === 'admin' || callerTeamRole === 'manager' || team?.created_by === userId) {
        authorized = true;
      } else {
        // Check if caller is owner/admin of parent class
        if (team?.parent_team_id) {
          const parentRole = await teamsRepository.getMemberRole(userId, team.parent_team_id);
          const parentTeam = await teamsRepository.getTeam(team.parent_team_id);
          if (parentRole === 'owner' || parentRole === 'admin' || parentTeam?.created_by === userId) {
            authorized = true;
          }
        }
      }
    } else if (!authorized && !teamId) {
      // Searching across member's teams for any authorized context
      const userTeams = await teamsRepository.getUserTeams(memberId);
      for (const t of userTeams) {
        const callerRole = await teamsRepository.getMemberRole(userId, t.team_id);
        if (callerRole === 'owner' || callerRole === 'admin' || callerRole === 'manager' || t.created_by === userId) {
          authorized = true;
          teamId = t.team_id;
          break;
        }
        if (t.parent_team_id) {
          const parentRole = await teamsRepository.getMemberRole(userId, t.parent_team_id);
          const parentTeam = await teamsRepository.getTeam(t.parent_team_id);
          if (parentRole === 'owner' || parentRole === 'admin' || parentTeam?.created_by === userId) {
            authorized = true;
            teamId = t.team_id;
            break;
          }
        }
      }
    }

    if (!authorized) {
      throw new ForbiddenError('Access denied to member analytics');
    }

    // 4. Data Fetching & Strict Team Scoping
    let tasks: any[] = [];
    let goals: any[] = [];
    let blockers: any[] = [];
    let recentActivity: any[] = [];
    let dailySubmissions: any[] = [];

    if (teamId) {
      // TEAM-SCOPED MEMBER ANALYTICS
      tasks = await query<any>(
        `SELECT t.*, p.project_name
         FROM tasks t
         JOIN projects p ON t.project_id = p.project_id
         WHERE (t.owner = $1 OR (t.contributors IS NOT NULL AND t.contributors @> jsonb_build_array($1::text)))
           AND p.team_id = $2
         ORDER BY t.created_at DESC`,
        [memberId, teamId]
      );

      goals = await query<any>(
        `SELECT * FROM goals
         WHERE created_by = $1 AND team_id = $2
         ORDER BY created_at DESC`,
        [memberId, teamId]
      );

      blockers = await query<any>(
        `SELECT * FROM blockers
         WHERE (created_by = $1 OR resolved_by = $1) AND team_id = $2
         ORDER BY created_at DESC`,
        [memberId, teamId]
      );

      recentActivity = await query<any>(
        `SELECT h.*, t.team_name
         FROM work_state_history h
         LEFT JOIN teams t ON h.team_id = t.team_id
         WHERE h.actor_id = $1 AND h.team_id = $2
         ORDER BY h.created_at DESC
         LIMIT 20`,
        [memberId, teamId]
      );

      dailySubmissions = await query<any>(
        `SELECT * FROM daily_work_submissions
         WHERE user_id = $1 AND team_id = $2
         ORDER BY work_date DESC
         LIMIT 20`,
        [memberId, teamId]
      );
    } else {
      // SELF OVERVIEW (Only when user views self without a team context filter)
      tasks = await query<any>(
        `SELECT t.*, p.project_name
         FROM tasks t
         JOIN projects p ON t.project_id = p.project_id
         WHERE t.owner = $1 OR (t.contributors IS NOT NULL AND t.contributors @> jsonb_build_array($1::text))
         ORDER BY t.created_at DESC`,
        [memberId]
      );

      goals = await query<any>(
        `SELECT * FROM goals WHERE created_by = $1 ORDER BY created_at DESC`,
        [memberId]
      );

      blockers = await query<any>(
        `SELECT * FROM blockers WHERE created_by = $1 OR resolved_by = $1 ORDER BY created_at DESC`,
        [memberId]
      );

      recentActivity = await query<any>(
        `SELECT h.*, t.team_name
         FROM work_state_history h
         LEFT JOIN teams t ON h.team_id = t.team_id
         WHERE h.actor_id = $1
         ORDER BY h.created_at DESC
         LIMIT 20`,
        [memberId]
      );

      dailySubmissions = await query<any>(
        `SELECT * FROM daily_work_submissions
         WHERE user_id = $1
         ORDER BY work_date DESC
         LIMIT 20`,
        [memberId]
      );
    }

    const assigned = tasks.length;
    const completed = tasks.filter((t: any) => t.status === 'done').length;
    const pendingReview = tasks.filter((t: any) => t.status === 'review').length;
    const inProgress = tasks.filter((t: any) => t.status === 'in_progress').length;
    const overallProgress = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;

    return {
      member_info: {
        user_id: member.user_id,
        full_name: member.full_name,
        username: member.username,
        role: member.role,
        avatar_key: member.avatar_key,
      },
      context: {
        team_id: teamId || null,
        class_id: classId || null,
        is_team_scoped: !!teamId,
      },
      progress: {
        assigned,
        completed,
        pending_review: pendingReview,
        in_progress: inProgress,
        overall_progress: overallProgress,
      },
      tasks: tasks.map((t: any) => ({
        task_id: t.task_id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        project_name: t.project_name,
      })),
      goals: goals.map((g: any) => ({
        goal_id: g.goal_id,
        title: g.title,
        status: g.status,
        progress: g.progress,
      })),
      blockers: blockers.map((b: any) => ({
        blocker_id: b.blocker_id,
        title: b.title,
        status: b.status,
        severity: b.severity,
      })),
      daily_submissions: dailySubmissions.map((s: any) => ({
        submission_id: s.submission_id,
        work_date: s.work_date,
        confirmed_summary: s.confirmed_summary,
      })),
      recent_activity: recentActivity,
    };
  }
}

export const analyticsService = new AnalyticsService();
