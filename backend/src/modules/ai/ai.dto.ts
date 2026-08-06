import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

export const chatSchema = z.object({
  message: requiredString('Message is required'),
  context: z.string().optional(),
});
