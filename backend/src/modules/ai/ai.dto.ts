import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

// Milestone 40: message/context feed directly into the AI provider prompt
// with no maximum length at all -- same unbounded-AI-input shape closed
// for analyzeProjectSchema (projects.dto.ts). Bounded to the same 5000
// already established for logEntrySchema.entryText.
export const chatSchema = z.object({
  message: requiredString('Message is required', 1, 5000),
  context: z.string().max(5000).optional(),
  teamId: z.string().uuid().optional(),
});

export const aiAssistantSchema = z.object({
  message: requiredString('Message is required', 1, 5000),
  scopeType: z.enum(['global', 'personal', 'team', 'class', 'project']).optional(),
  scopeId: z.string().uuid().optional().nullable(),
  explicitScopeType: z.enum(['global', 'personal', 'team', 'class', 'project']).optional(),
  explicitScopeId: z.string().uuid().optional().nullable(),
  pageContext: z.object({
    path: z.string().max(500).optional(),
    search: z.string().max(500).optional(),
    classId: z.string().uuid().optional().nullable(),
    teamId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
  }).optional(),
});
