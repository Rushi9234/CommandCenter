import { query, queryOne, buildSetClause } from '../../db/client';

// goal_type deliberately excluded: updateGoalSchema no longer accepts it
// (see that file's comment -- there is no type-editing UI, so the schema
// stopped pretending the capability exists). Leaving it in this allowlist
// would be dead/misleading now that zod's validate() middleware strips any
// goal_type key from the body before this is ever consulted.
const GOAL_UPDATABLE_COLUMNS = [
  'title', 'description', 'status', 'progress', 'parent_goal_id', 'target_date', 'completed_at',
  // Review-workflow columns -- never taken directly from a request body
  // (excluded from updateGoalSchema, same treatment as completed_at).
  // Only goals.service.ts's submitForReview/approveCompletion/returnGoal
  // pass these, after their own dedicated authorization checks.
  'submitted_for_review_by', 'submitted_for_review_at', 'approved_by', 'approved_at', 'requested_status',
  // Creation-governance columns -- same treatment: never taken directly
  // from a request body (excluded from both createGoalSchema and
  // updateGoalSchema). Only goals.service.ts's createGoal/approveCreation/
  // rejectCreation pass these.
  'creation_status', 'creation_reviewed_by', 'creation_reviewed_at',
];

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
    creation_status?: string;
  }) {
    const text = `
      INSERT INTO goals (
        title, description, goal_type, status, progress,
        created_by, team_id, parent_goal_id, target_date, creation_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      goalData.creation_status || null,
    ];

    return queryOne<any>(text, params);
  }

  async getGoal(goalId: string) {
    const text = 'SELECT * FROM goals WHERE goal_id = $1';
    return queryOne<any>(text, [goalId]);
  }

  // submitted_by_name/approved_by_name: display names for the review
  // workflow's "submitted by X" / "approved by Y" UI -- both NULL for a
  // goal that has never gone through review. created_by_name: same
  // pattern, for the creator/timestamp visibility fix -- created_by is
  // NOT NULL on goals, but this stays a LEFT JOIN for consistency with
  // the other two rather than assuming referential integrity can never
  // glitch. my_team_role: the caller's own role on the goal's team (NULL
  // for a personal/teamless goal), lets the frontend show leader-only
  // review controls without a second request per goal.
  async getUserGoals(userId: string) {
    const text = `
      SELECT g.*, tm.role AS my_team_role,
        cu.full_name AS created_by_name,
        su.full_name AS submitted_by_name, au.full_name AS approved_by_name,
        cru.full_name AS creation_reviewed_by_name
      FROM goals g
      LEFT JOIN team_members tm ON tm.team_id = g.team_id AND tm.user_id = $1
      LEFT JOIN users cu ON cu.user_id = g.created_by
      LEFT JOIN users su ON su.user_id = g.submitted_for_review_by
      LEFT JOIN users au ON au.user_id = g.approved_by
      LEFT JOIN users cru ON cru.user_id = g.creation_reviewed_by
      WHERE g.created_by = $1 OR g.team_id IN (
        SELECT team_id FROM team_members WHERE user_id = $1
      )
      ORDER BY g.created_at DESC
    `;
    return query<any>(text, [userId]);
  }

  async getTeamGoals(teamId: string, userId?: string) {
    const text = `
      SELECT g.*, tm.role AS my_team_role,
        cu.full_name AS created_by_name,
        su.full_name AS submitted_by_name, au.full_name AS approved_by_name,
        cru.full_name AS creation_reviewed_by_name
      FROM goals g
      LEFT JOIN team_members tm ON tm.team_id = g.team_id AND tm.user_id = $2
      LEFT JOIN users cu ON cu.user_id = g.created_by
      LEFT JOIN users su ON su.user_id = g.submitted_for_review_by
      LEFT JOIN users au ON au.user_id = g.approved_by
      LEFT JOIN users cru ON cru.user_id = g.creation_reviewed_by
      WHERE g.team_id = $1
      ORDER BY g.created_at DESC
    `;
    return query<any>(text, [teamId, userId || null]);
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

  // Milestone 45: previously no cycle guard at all -- a caller could
  // create a parent_goal_id cycle via two ordinary, individually-
  // authorized updates (set A's parent to B, then B's parent to A;
  // updateGoal only ever checked canWriteGoal on the DESTINATION parent,
  // never whether that destination was already a descendant of the goal
  // being updated). Once a cycle existed, `UNION ALL` never deduplicates,
  // so this recursive CTE walked A, B, A, B, ... forever -- an unbounded
  // query any ordinary team member (not just an admin) could trigger via
  // three plain API calls, with no statement_timeout configured anywhere
  // in the app to bound the damage. The cycle itself is now prevented at
  // write time (see wouldCreateCycle, used by goals.service.ts's
  // updateGoal), but this query is ALSO made cycle-safe directly (the
  // standard Postgres idiom: carry the visited-node path in an array,
  // stop recursing into any node already in it) as defense in depth --
  // belt-and-suspenders, matching this project's established preference
  // for closing a vulnerability class at its root AND at the point of
  // damage, not just one or the other.
  //
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
        SELECT goal_id, progress, status, team_id, ARRAY[goal_id] AS visited FROM goals WHERE goal_id = $1
        UNION ALL
        SELECT g.goal_id, g.progress, g.status, g.team_id, gt.visited || g.goal_id
        FROM goals g
        INNER JOIN goal_tree gt ON g.parent_goal_id = gt.goal_id AND g.team_id IS NOT DISTINCT FROM gt.team_id
        WHERE NOT (g.goal_id = ANY(gt.visited))
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

  // Milestone 45: the actual cycle-prevention check, used by
  // goals.service.ts's updateGoal before a client-supplied parent_goal_id
  // is ever written. Walks UP the candidate parent's own ancestor chain
  // (parent, grandparent, ...) and returns true if the goal being updated
  // appears anywhere in it -- which is exactly the condition under which
  // completing this update would create a cycle (including the trivial
  // self-parent case, since the walk's first row is the candidate parent
  // itself). The walk is itself cycle-safe (same visited-array idiom as
  // calculateGoalProgress) so that even if this check somehow ran against
  // already-cyclic data, it terminates instead of hanging.
  async wouldCreateCycle(goalId: string, candidateParentId: string): Promise<boolean> {
    if (goalId === candidateParentId) {
      return true;
    }
    const text = `
      WITH RECURSIVE ancestors AS (
        SELECT goal_id, parent_goal_id, ARRAY[goal_id] AS visited FROM goals WHERE goal_id = $1
        UNION ALL
        SELECT g.goal_id, g.parent_goal_id, a.visited || g.goal_id
        FROM goals g
        INNER JOIN ancestors a ON g.goal_id = a.parent_goal_id
        WHERE NOT (g.goal_id = ANY(a.visited))
      )
      SELECT 1 FROM ancestors WHERE goal_id = $2
    `;
    const result = await queryOne(text, [candidateParentId, goalId]);
    return result !== null;
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

  // Review-workflow gate: "leader" == owner or admin of the goal's OWN
  // team (never the creator, unlike canWriteGoal above -- final
  // completion sign-off is a team-authority check, not an authorship
  // check). Matches the same owner/admin split Teams.tsx already treats
  // as the leadership tier (coordinator dashboard access). A goal with no
  // team_id (personal goal) has no leader and always returns false here --
  // the review workflow does not apply to personal goals.
  async isTeamLeader(userId: string, goalId: string): Promise<boolean> {
    const text = `
      SELECT g.goal_id FROM goals g
      INNER JOIN team_members tm ON tm.team_id = g.team_id
      WHERE g.goal_id = $1 AND tm.user_id = $2 AND tm.role IN ('owner', 'admin')
    `;
    const result = await queryOne(text, [goalId, userId]);
    return result !== null;
  }

  // Creation-governance: same leadership tier as isTeamLeader (owner/admin)
  // but checked against a teamId directly, since this runs at CREATE time --
  // the goal doesn't exist yet, so there is no goal_id to join through.
  async isTeamLeaderOfTeam(userId: string, teamId: string): Promise<boolean> {
    const text = `
      SELECT 1 FROM team_members
      WHERE team_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')
    `;
    const result = await queryOne(text, [teamId, userId]);
    return result !== null;
  }
}

export const goalsRepository = new GoalsRepository();
