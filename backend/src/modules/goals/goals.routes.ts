import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate } from '../../common/middleware/validate';
import * as goalsController from './goals.controller';
import { createGoalSchema } from './goals.dto';

const router = Router();

router.post('/goals', authenticate, validate(createGoalSchema), asyncHandler(goalsController.createGoal));
router.get('/goals', authenticate, asyncHandler(goalsController.getGoals));
router.get('/goals/hierarchy', authenticate, asyncHandler(goalsController.getGoalHierarchy));
router.get('/goals/:goalId/progress', authenticate, asyncHandler(goalsController.getGoalProgress));
router.put('/goals/:goalId', authenticate, asyncHandler(goalsController.updateGoal));
router.delete('/goals/:goalId', authenticate, asyncHandler(goalsController.deleteGoal));

export default router;
