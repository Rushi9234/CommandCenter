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

// Milestone 35: was z.record(z.any()) -- any body key reached
// BLOCKER_UPDATABLE_COLUMNS's buildSetClause allowlist unchecked,
// including resolved_by/resolved_at (M31 finding: spoofable whenever the
// SAME request didn't also set status:'resolved', since the old guard in
// blockers.service.ts only overwrote them in that one branch and let them
// through raw otherwise) and the AI-derived fields (ai_suggestions,
// similar_blockers, suggested_helpers -- populated by createBlocker,
// never meant to be client-editable at all). None of those five appear
// here; resolved_by/resolved_at are now derived server-side from status
// transitions (blockers.service.ts), and the AI-derived fields are simply
// not client-writable through this endpoint. blocker_type matches
// SOSHub.tsx's dropdown; urgency/impact/severity have no established
// frontend enum (SOSHub's own "severity" field is a known, separate,
// pre-existing create-path contract mismatch -- see
// docs/security/SECURITY_FINDINGS.md -- not invented here), so they keep
// free-text with a length bound rather than a fabricated enum.
export const updateBlockerSchema = z
  .object({
    title: z.string().min(1).max(255),
    description: z.string().max(5000),
    blocker_type: z.enum(['technical', 'resource', 'dependency', 'clarity']),
    urgency: z.string().max(50),
    impact: z.string().max(50),
    severity: z.enum(['low', 'medium', 'high']),
    affected_tasks: z.array(z.string().uuid()),
    attempted_solutions: z.string().max(5000),
    status: z.enum(['open', 'resolved']),
  })
  .partial();
