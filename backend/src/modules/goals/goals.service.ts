import { goalsRepository } from './goals.repository';

async function buildGoalTree(parentId: string, allGoals: any[]): Promise<any[]> {
  const children = allGoals.filter((g) => g.parent_goal_id === parentId);
  return Promise.all(
    children.map(async (child) => ({
      ...child,
      children: await buildGoalTree(child.goal_id, allGoals),
    }))
  );
}

export class GoalsService {
  createGoal(userId: string, body: any) {
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
    return Promise.all(
      rootGoals.map(async (goal: any) => ({
        ...goal,
        children: await buildGoalTree(goal.goal_id, goals),
      }))
    );
  }

  updateGoal(goalId: string, updates: Record<string, any>) {
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
