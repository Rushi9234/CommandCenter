import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { dbService } from '../services/databaseService';

export const createGoal = async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, goalType, parentGoalId, targetDate, teamId } = req.body;
    const userId = req.user!.userId;

    if (!title) {
      return res.status(400).json({ error: 'Goal title is required' });
    }

    const goal = await dbService.createGoal({
      title,
      description: description || '',
      goal_type: goalType || 'project',
      created_by: userId,
      team_id: teamId,
      parent_goal_id: parentGoalId,
      target_date: targetDate ? new Date(targetDate) : undefined
    });

    res.status(201).json({
      success: true,
      message: 'Goal created successfully',
      data: goal,
    });
  } catch (error: any) {
    console.error('Create goal error:', error);
    res.status(400).json({ error: error.message || 'Failed to create goal' });
  }
};

export const getGoals = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { teamId, goalType } = req.query;

    let goals;
    if (teamId) {
      const canAccess = await dbService.canAccessTeam(userId, teamId as string);
      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this team' });
      }
      goals = await dbService.getTeamGoals(teamId as string);
    } else {
      goals = await dbService.getUserGoals(userId);
    }

    if (goalType) {
      goals = goals.filter(g => g.goal_type === goalType);
    }

    res.json({
      success: true,
      data: goals,
    });
  } catch (error: any) {
    console.error('Get goals error:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
};

export const getGoalHierarchy = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { teamId } = req.query;

    const goals = teamId 
      ? await dbService.getTeamGoals(teamId as string)
      : await dbService.getUserGoals(userId);

    // Build hierarchy
    const rootGoals = goals.filter(g => !g.parent_goal_id);
    const hierarchy = await Promise.all(
      rootGoals.map(async (goal) => ({
        ...goal,
        children: await buildGoalTree(goal.goal_id, goals),
      }))
    );

    res.json({
      success: true,
      data: hierarchy,
    });
  } catch (error: any) {
    console.error('Get goal hierarchy error:', error);
    res.status(500).json({ error: 'Failed to fetch goal hierarchy' });
  }
};

async function buildGoalTree(parentId: string, allGoals: any[]): Promise<any[]> {
  const children = allGoals.filter(g => g.parent_goal_id === parentId);
  return Promise.all(
    children.map(async (child) => ({
      ...child,
      children: await buildGoalTree(child.goal_id, allGoals),
    }))
  );
}

export const updateGoal = async (req: AuthRequest, res: Response) => {
  try {
    const { goalId } = req.params;
    const updates = req.body;

    const goal = await dbService.updateGoal(goalId, updates);

    res.json({
      success: true,
      message: 'Goal updated successfully',
      data: goal,
    });
  } catch (error: any) {
    console.error('Update goal error:', error);
    res.status(400).json({ error: error.message || 'Failed to update goal' });
  }
};

export const deleteGoal = async (req: AuthRequest, res: Response) => {
  try {
    const { goalId } = req.params;
    await dbService.deleteGoal(goalId);

    res.json({
      success: true,
      message: 'Goal deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete goal error:', error);
    res.status(400).json({ error: 'Failed to delete goal' });
  }
};

export const getGoalProgress = async (req: AuthRequest, res: Response) => {
  try {
    const { goalId } = req.params;
    const progress = await dbService.calculateGoalProgress(goalId);

    res.json({
      success: true,
      data: progress,
    });
  } catch (error: any) {
    console.error('Get goal progress error:', error);
    res.status(500).json({ error: 'Failed to calculate progress' });
  }
};
