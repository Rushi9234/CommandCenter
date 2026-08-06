import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok, created } from '../../common/http/respond';
import { goalsService } from './goals.service';

export const createGoal = async (req: AuthRequest, res: Response) => {
  const goal = await goalsService.createGoal(req.user!.userId, req.body);
  created(res, goal, 'Goal created successfully');
};

export const getGoals = async (req: AuthRequest, res: Response) => {
  const { teamId, goalType } = req.query;
  const goals = await goalsService.getGoals(req.user!.userId, teamId as string | undefined, goalType as string | undefined);
  ok(res, goals);
};

export const getGoalHierarchy = async (req: AuthRequest, res: Response) => {
  const hierarchy = await goalsService.getGoalHierarchy(req.user!.userId, req.query.teamId as string | undefined);
  ok(res, hierarchy);
};

export const updateGoal = async (req: AuthRequest, res: Response) => {
  const goal = await goalsService.updateGoal(req.params.goalId, req.body);
  ok(res, goal, 'Goal updated successfully');
};

export const deleteGoal = async (req: AuthRequest, res: Response) => {
  await goalsService.deleteGoal(req.params.goalId);
  ok(res, undefined, 'Goal deleted successfully');
};

export const getGoalProgress = async (req: AuthRequest, res: Response) => {
  const progress = await goalsService.getGoalProgress(req.params.goalId);
  ok(res, progress);
};
