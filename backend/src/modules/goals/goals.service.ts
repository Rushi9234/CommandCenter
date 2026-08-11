import { goalsRepository } from './goals.repository';
import { ForbiddenError, BadRequestError } from '../../common/errors';

// Milestone 46: used to re-filter the ENTIRE goals array at every node of
// the tree (children = allGoals.filter(...)) -- O(n) work per node
// visited, O(n^2) total for a team with n goals, a synchronous, CPU-bound
// pass on Node's single-threaded event loop with no cap on how many goals
// a team can accumulate. Building a parent -> children index once (O(n))
// and having the recursive build only ever look up that index turns the
// whole traversal into O(n) total, regardless of shape (wide, deep, or
// balanced). No longer async -- there was never any I/O in this function,
// only synchronous array filtering that happened to be wrapped in
// Promise.all.
function buildChildrenIndex(allGoals: any[]): Map<string, any[]> {
  const index = new Map<string, any[]>();
  for (const goal of allGoals) {
    if (goal.parent_goal_id) {
      const siblings = index.get(goal.parent_goal_id) ?? [];
      siblings.push(goal);
      index.set(goal.parent_goal_id, siblings);
    }
  }
  return index;
}

function buildGoalTree(parentId: string, childrenIndex: Map<string, any[]>): any[] {
  const children = childrenIndex.get(parentId) ?? [];
  return children.map((child) => ({
    ...child,
    children: buildGoalTree(child.goal_id, childrenIndex),
  }));
}

export class GoalsService {
  // Milestone 42: same cross-reference-authorization gap M30 already
  // closed for updateGoal, missed on the create path -- the route's own
  // requireTeamRoleIfSpecified(teamIdFromBody) only checks the NEW goal's
  // own team, never a client-supplied parentGoalId, so a caller could
  // create a goal nested under one belonging to a team they have no
  // write access to just by naming that goal's ID. Reuses canWriteGoal
  // against the destination parent, the exact same rule and reasoning
  // updateGoal already applies.
  async createGoal(userId: string, body: any) {
    if (body.parentGoalId) {
      const canWriteParent = await goalsRepository.canWriteGoal(userId, body.parentGoalId);
      if (!canWriteParent) {
        throw new ForbiddenError('Access denied to the parent goal');
      }
    }

    return goalsRepository.createGoal({
      title: body.title,
      description: body.description || '',
      goal_type: body.goalType || 'project',
      created_by: userId,
      team_id: body.teamId,
      parent_goal_id: body.parentGoalId,
      target_date: body.targetDate ? new Date(body.targetDate) : undefined,
    });
  }

  // Milestone 5: base gate (requireTeamRoleIfSpecified + canAccessTeam)
  // moved to goals.routes.ts.
  async getGoals(userId: string, teamId?: string, goalType?: string) {
    let goals = teamId ? await goalsRepository.getTeamGoals(teamId) : await goalsRepository.getUserGoals(userId);

    if (goalType) {
      goals = goals.filter((g: any) => g.goal_type === goalType);
    }

    return goals;
  }

  async getGoalHierarchy(userId: string, teamId?: string) {
    const goals = teamId ? await goalsRepository.getTeamGoals(teamId) : await goalsRepository.getUserGoals(userId);

    const rootGoals = goals.filter((g: any) => !g.parent_goal_id);
    const childrenIndex = buildChildrenIndex(goals);
    return rootGoals.map((goal: any) => ({
      ...goal,
      children: buildGoalTree(goal.goal_id, childrenIndex),
    }));
  }

  // Milestone 30: canWriteGoal (checked at the route level) only verifies
  // access to the goal being updated -- it never validated a client-
  // supplied parent_goal_id, so any writer could re-parent their goal
  // under one belonging to a team they have no access to. Reuses
  // canWriteGoal against the *destination* parent, same rule the caller
  // already had to satisfy for the goal itself.
  // Milestone 45: a caller could previously create a parent_goal_id
  // cycle via two ordinary, individually-authorized updates (set A's
  // parent to B, then B's parent to A) -- canWriteGoal only checks
  // access to the destination parent, it says nothing about whether
  // that destination is already a descendant of the goal being updated.
  // Once such a cycle existed, calculateGoalProgress's recursive CTE
  // would walk it forever (UNION ALL never deduplicates) -- an
  // unbounded query any ordinary team member could trigger with no
  // elevated privilege at all. wouldCreateCycle walks the candidate
  // parent's own ancestor chain and rejects the update before the
  // cycle can ever be written, closing the vulnerability at its root
  // (the CTE itself was also hardened independently, see
  // calculateGoalProgress's comment, as defense in depth).
  async updateGoal(userId: string, goalId: string, updates: Record<string, any>) {
    if (updates.parent_goal_id) {
      const canWriteParent = await goalsRepository.canWriteGoal(userId, updates.parent_goal_id);
      if (!canWriteParent) {
        throw new ForbiddenError('Access denied to the parent goal');
      }

      const wouldCycle = await goalsRepository.wouldCreateCycle(goalId, updates.parent_goal_id);
      if (wouldCycle) {
        throw new BadRequestError('This would create a cycle in the goal hierarchy');
      }
    }

    // Milestone 35: completed_at is not client-writable (excluded from
    // updateGoalSchema) -- derived here instead, so a goal can never end
    // up "completed" with no completion timestamp, or "not completed"
    // with a stale one left over from a previous completion.
    if (updates.status === 'completed') {
      updates.completed_at = new Date();
    } else if (updates.status) {
      updates.completed_at = null;
    }

    return goalsRepository.updateGoal(goalId, updates);
  }

  async deleteGoal(goalId: string) {
    await goalsRepository.deleteGoal(goalId);
  }

  getGoalProgress(goalId: string) {
    return goalsRepository.calculateGoalProgress(goalId);
  }
}

export const goalsService = new GoalsService();
