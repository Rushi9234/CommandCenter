import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

export const createGoalSchema = z.object({
  title: requiredString('Goal title is required'),
  description: z.string().optional(),
  goalType: z.string().optional(),
  parentGoalId: z.string().optional(),
  targetDate: z.string().optional(),
  teamId: z.string().optional(),
});

export const updateGoalSchema = z.record(z.string(), z.any());
