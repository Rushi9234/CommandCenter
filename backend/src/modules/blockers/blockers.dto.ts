import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

export const createBlockerSchema = z.object({
  teamId: requiredString('Title and team ID are required'),
  title: requiredString('Title and team ID are required'),
  description: z.string().optional(),
  blockerType: z.string().optional(),
  urgency: z.string().optional(),
  impact: z.string().optional(),
  affectedTasks: z.array(z.string()).optional(),
  attemptedSolutions: z.string().optional(),
});

export const sendMessageSchema = z.object({
  messageText: requiredString('Message text is required'),
});

export const updateBlockerSchema = z.record(z.string(), z.any());
