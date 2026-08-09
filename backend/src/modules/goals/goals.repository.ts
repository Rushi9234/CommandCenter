import { query, queryOne, buildSetClause } from '../../db/client';

const GOAL_UPDATABLE_COLUMNS = ['title', 'description', 'goal_type', 'status', 'progress', 'parent_goal_id', 'target_date', 'completed_at'];

// Moved verbatim from the old databaseService.ts (goal methods).
export class GoalsRepository {
  async createGoal(goalData: {
    title: string;
    description?: string;
    goal_type?: string;
    status?: string;
    progress?: number;
    created_by: string;
    team_id?: string;
    parent_goal_id?: string;
    target_date?: Date;
  }) {
    const text = `
      INSERT INTO goals (
        title, description, goal_type, status, progress,
        created_by, team_id, parent_goal_id, target_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const params = [
      goalData.title,
      goalData.description || null,
      goalData.goal_type || 'milestone',
      goalData.status || 'planning',
      goalData.progress || 0,
      goalData.created_by,
      goalData.team_id || null,
      goalData.parent_goal_id || null,
      goalData.target_date || null,
    ];

    return queryOne<any>(text, params);
  }

  async getGoal(goalId: string) {
    const text = 'SELECT * FROM goals WHERE goal_id = $1';
    return queryOne<any>(text, [goalId]);
  }

  async getUserGoals(userId: string) {
    const text = `
      SELECT * FROM goals
      WHERE created_by = $1 OR team_id IN (
        SELECT team_id FROM team_members WHERE user_id = $1
      )
      ORDER BY created_at DESC
    `;
    return query<any>(text, [userId]);
  }

  async getTeamGoals(teamId: string) {
    const text = `
      SELECT * FROM goals
      WHERE team_id = $1
      ORDER BY created_at DESC
    `;
    return query<any>(text, [teamId]);
  }

  async updateGoal(goalId: string, updates: Record<string, any>) {
    const built = buildSetClause(GOAL_UPDATABLE_COLUMNS, updates, 2);
    if (!built) {
      return this.getGoal(goalId);
    }

    const text = `
      UPDATE goals
      SET ${built.clause}, updated_at = CURRENT_TIMESTAMP
      WHERE goal_id = $1
      RETURNING *
    `;

    return queryOne(text, [goalId, ...built.values]);
  }

  // Milestone 40: parent_goal_id (schema.sql) has no ON DELETE clause, so
  // it defaults to RESTRICT -- deleting a goal that still has child goals
  // (rows whose parent_goal_id points at it) throws a raw Postgres 23503
  // foreign-key-violation. This was previously uncaught here and in
  // goals.service.ts's deleteGoal, reaching the client as a generic 500.
  // Deliberately NOT changed to CASCADE or to a pre-check-then-delete --
  // "reject a delete that would orphan children" is the correct product
  // behavior (matches how removeMember/leaveTeam already refuse to act
  // when it would violate an invariant), so the fix is letting the
  // database's own constraint keep doing exactly that, and translating
  // the resulting 23503 into a clean 409 instead of a 500. See
  // errorHandler.ts's Milestone 40 Postgres-error translation table --
  // this is the same single choke point every other untranslated
  // constraint violation in the app now goes through, not a special case
  // added here.
  async deleteGoal(goalId: string) {
    const text = 'DELETE FROM goals WHERE goal_id = $1';
    return query(text, [goalId]);
  }

  // Milestone 30: the recursion used to follow parent_goal_id links with no
  // regard for team boundaries -- a cross-team parent_goal_id (however it
  // got there) would silently fold a foreign team's goal into this team's
  // aggregate. Comparing g.team_id to gt.team_id at each step (starting
  // from the root's own team_id) keeps every step of the walk within the
  // same team; IS NOT DISTINCT FROM treats two NULLs (personal, teamless
  // goals) as matching, unlike a plain `=`.
  async calculateGoalProgress(goalId: string) {
    const text = `
      WITH RECURSIVE goal_tree AS (
        SELECT goal_id, progress, status, team_id FROM goals WHERE goal_id = $1
        UNION ALL
        SELECT g.goal_id, g.progress, g.status, g.team_id
        FROM goals g
        INNER JOIN goal_tree gt ON g.parent_goal_id = gt.goal_id AND g.team_id IS NOT DISTINCT FROM gt.team_id
      )
      SELECT
        COUNT(*) as total_goals,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_goals,
        AVG(progress) as avg_progress
      FROM goal_tree
    `;
    const result = await queryOne<any>(text, [goalId]);

    if (!result) return { progress: 0, completed: 0, total: 0 };

    const total = parseInt(result.total_goals);
    const completed = parseInt(result.completed_goals);
    const avgProgress = parseFloat(result.avg_progress) || 0;

    return {
      progress: total > 0 ? Math.round((completed / total) * 100) : avgProgress,
      completed,
      total,
    };
  }

  // Milestone 5: goals have no update/delete/progress authorization check
  // of any kind today -- any authenticated user could read or modify any
  // goal by ID, team-scoped or not. Same rule shape as canAccessProject:
  // the creator, or a member of the goal's team if it has one.
  async canAccessGoal(userId: string, goalId: string): Promise<boolean> {
    const text = `
      SELECT goal_id FROM goals
      WHERE goal_id = $1 AND (
        created_by = $2 OR
        team_id IN (SELECT team_id FROM team_members WHERE user_id = $2)
      )
    `;
    const result = await queryOne(text, [goalId, userId]);
    return result !== null;
  }

  // Milestone 5 review: same viewer-exclusion fix as
  // projects.repository.ts's canWriteProject.
  async canWriteGoal(userId: string, goalId: string): Promise<boolean> {
    const text = `
      SELECT goal_id FROM goals
      WHERE goal_id = $1 AND (
        created_by = $2 OR
        team_id IN (SELECT team_id FROM team_members WHERE user_id = $2 AND role != 'viewer')
      )
    `;
    const result = await queryOne(text, [goalId, userId]);
    return result !== null;
  }
}

export const goalsRepository = new GoalsRepository();
