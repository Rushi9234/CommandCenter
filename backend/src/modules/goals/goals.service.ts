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
    let goals = teamId ? await goalsRepository.getTeamGoals(teamId, userId) : await goalsRepository.getUserGoals(userId);

    if (goalType) {
      goals = goals.filter((g: any) => g.goal_type === goalType);
    }

    return goals;
  }

  async getGoalHierarchy(userId: string, teamId?: string) {
    const goals = teamId ? await goalsRepository.getTeamGoals(teamId, userId) : await goalsRepository.getUserGoals(userId);

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
      // Review workflow: a TEAM goal cannot go straight to "completed"
      // through this generic update -- that would let any writer declare
      // final completion unilaterally, which is exactly what the
      // submit-for-review / approve workflow exists to prevent. A
      // personal (teamless) goal has no leader to approve it, so it keeps
      // the original direct-completion behavior unchanged.
      const current = await goalsRepository.getGoal(goalId);
      if (current?.team_id) {
        throw new ForbiddenError(
          'Team goals must be submitted for review and approved by a team leader before they can be marked completed. Use "Submit for Review" instead.'
        );
      }
      updates.completed_at = new Date();
      // Milestone: status='completed' must always imply progress=100 --
      // avoids the "Completed at 35%" contradiction the same way
      // completed_at's own derivation avoids a missing/stale timestamp.
      updates.progress = 100;
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

  // --- Review workflow -------------------------------------------------
  // Member submits work, saying what they actually want signed off
  // (requestedStatus -- defaults to the goal's OWN current status, i.e.
  // "just acknowledge where this stands," not completion) ->
  // status='pending_review' -> team leader (owner/admin) approves, which
  // applies requested_status VERBATIM (only 'completed' produces
  // progress=100 + completed_at), or returns it to an in-progress state.
  //
  // Corrective fix: approveReview (previously named approveCompletion)
  // used to unconditionally set status='completed' for ANY approval --
  // a member requesting sign-off on a normal 40%->60% progress bump
  // would have their goal silently finalized the moment a leader clicked
  // Approve, with no way to approve "yes, that progress is fine, keep
  // going" without also completing it. requested_status is what actually
  // fixes this: it's the one piece of information submitForReview was
  // missing, and approveReview now branches on it instead of assuming
  // every review is a completion request.
  //
  // Authorization for the leader-only actions is enforced at the route
  // level (isTeamLeader), same pattern as canWriteGoal/canAccessGoal
  // above -- this class never trusts a caller-supplied role, only what
  // the DB says the caller's team membership actually is.

  async submitForReview(userId: string, goalId: string, requestedStatus?: string) {
    const goal = await goalsRepository.getGoal(goalId);
    if (!goal) {
      throw new BadRequestError('Goal not found');
    }
    if (!goal.team_id) {
      throw new BadRequestError('Only team goals go through review -- personal goals can be marked completed directly.');
    }
    if (goal.status === 'completed') {
      throw new BadRequestError('This goal is already completed.');
    }
    if (goal.status === 'pending_review') {
      throw new BadRequestError('This goal has already been submitted for review.');
    }

    return goalsRepository.updateGoal(goalId, {
      status: 'pending_review',
      // No explicit request means "sign off on the current progress/
      // stage" -- re-affirming the goal's own status, never completion.
      requested_status: requestedStatus || goal.status,
      submitted_for_review_by: userId,
      submitted_for_review_at: new Date(),
    });
  }

  async approveReview(userId: string, goalId: string) {
    const goal = await goalsRepository.getGoal(goalId);
    if (!goal) {
      throw new BadRequestError('Goal not found');
    }
    if (goal.status !== 'pending_review') {
      throw new BadRequestError('This goal is not currently awaiting review.');
    }

    const requested = goal.requested_status || 'active';
    const isCompletionRequest = requested === 'completed';

    const updates: Record<string, any> = {
      status: requested,
      approved_by: userId,
      approved_at: new Date(),
      requested_status: null,
      submitted_for_review_by: null,
      submitted_for_review_at: null,
    };

    // Only an actual completion request may produce completed + 100 --
    // approving a normal progress/stage sign-off must never imply
    // finished, avoiding the "Completed at 35%" contradiction from the
    // other direction (approving something that was never asked to be
    // completed).
    if (isCompletionRequest) {
      updates.progress = 100;
      updates.completed_at = new Date();
    }

    return goalsRepository.updateGoal(goalId, updates);
  }

  async returnGoal(userId: string, goalId: string, targetStatus?: string) {
    const goal = await goalsRepository.getGoal(goalId);
    if (!goal) {
      throw new BadRequestError('Goal not found');
    }
    if (goal.status !== 'pending_review') {
      throw new BadRequestError('This goal is not currently awaiting review.');
    }

    return goalsRepository.updateGoal(goalId, {
      status: targetStatus || 'active',
      // Clear the submission/request markers -- it's been sent back, so
      // "waiting for review, submitted by X, requesting Y" would be
      // stale/misleading once it's back in an in-progress state.
      // approved_by/approved_at are left alone: this is a rejection, not
      // an approval, so nothing here.
      requested_status: null,
      submitted_for_review_by: null,
      submitted_for_review_at: null,
    });
  }
}

export const goalsService = new GoalsService();
