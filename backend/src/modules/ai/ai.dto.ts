import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

// Milestone 40: message/context feed directly into the AI provider prompt
// with no maximum length at all -- same unbounded-AI-input shape closed
// for analyzeProjectSchema (projects.dto.ts). Bounded to the same 5000
// already established for logEntrySchema.entryText.
export const chatSchema = z.object({
  message: requiredString('Message is required', 1, 5000),
  context: z.string().max(5000).optional(),
});
