import { goalsRepository } from './goals.repository';
import { ForbiddenError, BadRequestError } from '../../common/errors';
import { notificationsService } from '../notifications/notifications.service';
import { usersRepository } from '../users/users.repository';
import { teamsRepository } from '../teams/teams.repository';

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
  // Creation governance: a team goal proposed by a non-leader member must
  // not go live as an official team goal immediately -- it enters
  // 'pending_approval' until a team owner/admin approves or rejects it.
  // A leader creating a team goal themselves is auto-approved (creation_
  // status stays NULL): they already ARE the approval authority for their
  // own team, so a self-approval step would add friction with no actual
  // governance value. Personal (teamless) goals never touch creation_
  // status at all -- this entire concept is team-goal-only, per the
  // explicit requirement that personal goals remain unaffected.
  //
  // Deliberately separate from the completion-review workflow below
  // (submitForReview/approveReview/returnGoal) -- these are two different
  // approval concepts (who may officially create a team goal, vs. who may
  // mark one completed) and must never be conflated into one status field
  // or one set of columns.
  async createGoal(userId: string, body: any) {
    if (body.parentGoalId) {
      const canWriteParent = await goalsRepository.canWriteGoal(userId, body.parentGoalId);
      if (!canWriteParent) {
        throw new ForbiddenError('Access denied to the parent goal');
      }
    }

    let creationStatus: string | undefined;
    if (body.teamId) {
      const isLeader = await goalsRepository.isTeamLeaderOfTeam(userId, body.teamId);
      creationStatus = isLeader ? undefined : 'pending_approval';
    }

    const goal = await goalsRepository.createGoal({
      title: body.title,
      description: body.description || '',
      goal_type: body.goalType || 'project',
      created_by: userId,
      team_id: body.teamId,
      parent_goal_id: body.parentGoalId,
      target_date: body.targetDate ? new Date(body.targetDate) : undefined,
      creation_status: creationStatus,
    });

    if (creationStatus === 'pending_approval' && body.teamId) {
      const [team, creator] = await Promise.all([teamsRepository.getTeam(body.teamId), usersRepository.getUserById(userId)]);
      if (team && creator) {
        await notificationsService.notifyTeamMembersByRole(
          body.teamId,
          ['owner', 'admin'],
          {
            category: 'goal.creation_proposed',
            preferenceGroup: 'goal_creation',
            title: 'Goal approval requested',
            message: `${creator.full_name} proposed a new team goal: "${goal.title}"`,
            goalId: goal.goal_id,
          },
          userId
        );
      }
    }

    return goal;
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

    // Creation governance: a proposal still awaiting (or rejected from)
    // leader approval is not yet an official team goal -- status/progress
    // work on it must wait until it's approved. Title/description edits
    // (and delete, gated separately at the route level) remain allowed,
    // so a proposer can still fix a typo or withdraw their own proposal.
    if (updates.status !== undefined || updates.progress !== undefined) {
      const target = await goalsRepository.getGoal(goalId);
      if (target?.creation_status === 'pending_approval') {
        throw new ForbiddenError(
          'This goal is still awaiting team-leader approval and cannot be worked on yet.'
        );
      }
      if (target?.creation_status === 'rejected') {
        throw new ForbiddenError('This goal proposal was rejected by a team leader and cannot be updated.');
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
    if (goal.creation_status === 'pending_approval' || goal.creation_status === 'rejected') {
      throw new ForbiddenError('This goal is not yet an approved team goal and cannot be submitted for review.');
    }
    if (goal.status === 'completed') {
      throw new BadRequestError('This goal is already completed.');
    }
    if (goal.status === 'pending_review') {
      throw new BadRequestError('This goal has already been submitted for review.');
    }

    const updated = await goalsRepository.updateGoal(goalId, {
      status: 'pending_review',
      // No explicit request means "sign off on the current progress/
      // stage" -- re-affirming the goal's own status, never completion.
      requested_status: requestedStatus || goal.status,
      submitted_for_review_by: userId,
      submitted_for_review_at: new Date(),
    });

    const isCompletionRequest = (requestedStatus || goal.status) === 'completed';
    const submitter = await usersRepository.getUserById(userId);
    if (submitter) {
      await notificationsService.notifyTeamMembersByRole(
        goal.team_id,
        ['owner', 'admin'],
        isCompletionRequest
          ? {
              category: 'goal.completion_requested',
              preferenceGroup: 'goal_completion',
              title: 'Completion approval requested',
              message: `${submitter.full_name} requested completion approval for "${goal.title}"`,
              goalId,
            }
          : {
              category: 'goal.review_requested',
              preferenceGroup: 'goal_completion',
              title: 'Progress approval requested',
              message: `${submitter.full_name} requested approval for "${goal.title}"`,
              goalId,
            },
        userId
      );
    }

    return updated;
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

    const updated = await goalsRepository.updateGoal(goalId, updates);

    if (goal.submitted_for_review_by) {
      await notificationsService.notifyUser(
        isCompletionRequest
          ? {
              recipientUserId: goal.submitted_for_review_by,
              category: 'goal.completion_approved',
              preferenceGroup: 'goal_completion',
              title: 'Goal completion approved',
              message: `"${goal.title}" is now marked Completed`,
              goalId,
              teamId: goal.team_id,
            }
          : {
              recipientUserId: goal.submitted_for_review_by,
              category: 'goal.review_approved',
              preferenceGroup: 'goal_completion',
              title: 'Your goal progress was approved',
              message: `Your update on "${goal.title}" was approved`,
              goalId,
              teamId: goal.team_id,
            }
      );
    }

    return updated;
  }

  async returnGoal(userId: string, goalId: string, targetStatus?: string) {
    const goal = await goalsRepository.getGoal(goalId);
    if (!goal) {
      throw new BadRequestError('Goal not found');
    }
    if (goal.status !== 'pending_review') {
      throw new BadRequestError('This goal is not currently awaiting review.');
    }

    const updated = await goalsRepository.updateGoal(goalId, {
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

    if (goal.submitted_for_review_by) {
      await notificationsService.notifyUser({
        recipientUserId: goal.submitted_for_review_by,
        category: 'goal.returned',
        preferenceGroup: 'goal_completion',
        title: 'Goal sent back for changes',
        message: `"${goal.title}" was sent back by your team leader`,
        goalId,
        teamId: goal.team_id,
      });
    }

    return updated;
  }

  // --- Creation-governance workflow ------------------------------------
  // Distinct from the completion-review workflow above: this governs
  // whether a PROPOSED team goal ever becomes official at all, not
  // whether a goal already in progress may be marked completed.
  // Authorization for both actions is enforced at the route level
  // (isTeamLeader -- same owner/admin check the completion workflow
  // uses), never trusted from the request body.

  async approveCreation(userId: string, goalId: string) {
    const goal = await goalsRepository.getGoal(goalId);
    if (!goal) {
      throw new BadRequestError('Goal not found');
    }
    if (goal.creation_status !== 'pending_approval') {
      throw new BadRequestError('This goal is not currently awaiting creation approval.');
    }

    const updated = await goalsRepository.updateGoal(goalId, {
      creation_status: null,
      creation_reviewed_by: userId,
      creation_reviewed_at: new Date(),
    });

    await notificationsService.notifyUser({
      recipientUserId: goal.created_by,
      category: 'goal.creation_approved',
      preferenceGroup: 'goal_creation',
      title: 'Your team goal was approved',
      message: `"${goal.title}" is now an official team goal`,
      goalId,
      teamId: goal.team_id,
    });

    return updated;
  }

  async rejectCreation(userId: string, goalId: string) {
    const goal = await goalsRepository.getGoal(goalId);
    if (!goal) {
      throw new BadRequestError('Goal not found');
    }
    if (goal.creation_status !== 'pending_approval') {
      throw new BadRequestError('This goal is not currently awaiting creation approval.');
    }

    const updated = await goalsRepository.updateGoal(goalId, {
      creation_status: 'rejected',
      creation_reviewed_by: userId,
      creation_reviewed_at: new Date(),
    });

    await notificationsService.notifyUser({
      recipientUserId: goal.created_by,
      category: 'goal.creation_rejected',
      preferenceGroup: 'goal_creation',
      title: 'Your goal proposal was rejected',
      message: `"${goal.title}" was not approved`,
      goalId,
      teamId: goal.team_id,
    });

    return updated;
  }
}

export const goalsService = new GoalsService();
