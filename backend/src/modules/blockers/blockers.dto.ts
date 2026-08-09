import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

// Milestone 40: affectedTasks/affected_tasks had no length cap in either
// schema (matches the same unbounded-array shape closed for tasks'
// contributors/dependencies in projects.dto.ts).
const MAX_AFFECTED_TASKS_ARRAY_LENGTH = 50;

export const createBlockerSchema = z.object({
  teamId: requiredString('Title and team ID are required'),
  title: requiredString('Title and team ID are required', 1, 255),
  description: z.string().max(5000).optional(),
  blockerType: z.string().optional(),
  urgency: z.string().max(50).optional(),
  impact: z.string().max(50).optional(),
  // Milestone 43: was z.array(z.string()) -- no UUID-shape check at all,
  // unlike its update-path sibling (affected_tasks below, which already
  // had .uuid()). The actual existence/same-team check is added in
  // blockers.service.ts (createBlocker/updateBlocker), matching the
  // pattern M39 established for tasks.dependencies.
  affectedTasks: z.array(z.string().uuid()).max(MAX_AFFECTED_TASKS_ARRAY_LENGTH).optional(),
  attemptedSolutions: z.string().max(5000).optional(),
});

export const sendMessageSchema = z.object({
  messageText: requiredString('Message text is required', 1, 5000),
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
    affected_tasks: z.array(z.string().uuid()).max(MAX_AFFECTED_TASKS_ARRAY_LENGTH),
    attempted_solutions: z.string().max(5000),
    status: z.enum(['open', 'resolved']),
  })
  .partial();
