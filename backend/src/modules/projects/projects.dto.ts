import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

export const createProjectSchema = z.object({
  projectName: requiredString('Project name is required', 1, 255),
  description: z.string().max(5000).optional(),
  teamId: z.string().optional(),
  priority: z.string().optional(),
  deadline: z.string().optional(),
  isPublic: z.boolean().optional(),
});

// Milestone 40: description/requirements feed straight into the AI
// provider prompt (ai.service.ts's analyzeProjectWithAI) with no length
// bound at all -- unlike logEntrySchema.entryText (logs.dto.ts), which has
// carried a .max(5000) since it was first written. Bounded to the same
// limit for consistency; the 100kb express.json() body-parser default was
// the only thing capping this before.
export const analyzeProjectSchema = z.object({
  projectName: requiredString('Project name and description are required'),
  description: requiredString('Project name and description are required', 1, 5000),
  requirements: z.string().max(5000).optional(),
});

// Milestone 40: contributors/dependencies had no length cap -- a caller
// could submit an array of thousands of UUIDs, which tasksExistInProject
// (tasks.repository.ts) would run through `ANY($1)` against on every
// create/update. 50 comfortably covers any legitimate team/task size in
// this product's model while closing the unbounded-array shape.
const MAX_TASK_REFERENCE_ARRAY_LENGTH = 50;

export const createTaskSchema = z.object({
  title: requiredString('Task title is required', 1, 255),
  description: z.string().max(5000).optional(),
  owner: z.string().optional(),
  contributors: z.array(z.string()).max(MAX_TASK_REFERENCE_ARRAY_LENGTH).optional(),
  reviewer: z.string().optional(),
  dependencies: z.array(z.string()).max(MAX_TASK_REFERENCE_ARRAY_LENGTH).optional(),
  priority: z.string().optional(),
});

// Milestone 35: was z.record(z.any()) -- any body key reached
// PROJECT_UPDATABLE_COLUMNS's buildSetClause allowlist unchecked. team_id
// is kept here (Milestone 29 already guards a specified destination team
// via requireTeamRoleIfSpecified at the route level; this just adds the
// missing type check) rather than removed, since cross-team transfer by
// an authorized caller is legitimate. Enum/length values match
// Projects.tsx's own dropdowns (getStatusColor/getPriorityColor).
export const updateProjectSchema = z
  .object({
    project_name: z.string().min(1).max(255),
    description: z.string().max(5000),
    team_id: z.string().uuid().nullable(),
    status: z.enum(['planning', 'active', 'completed', 'on_hold']),
    priority: z.enum(['low', 'medium', 'high']),
    is_public: z.boolean(),
    deadline: z.string(),
  })
  .partial();

// Milestone 35: was z.record(z.any()) -- any body key reached
// TASK_UPDATABLE_COLUMNS's buildSetClause allowlist unchecked, including
// completed_at (client could set an arbitrary completion timestamp
// independent of status). completed_at is deliberately absent here --
// projects.service.ts derives it from status transitions. owner/reviewer/
// contributors/dependencies keep their existing (pre-Milestone-35) lack
// of a team-membership/existence check on the referenced IDs -- that is
// a separate, already-catalogued deferred finding (see
// docs/security/SECURITY_FINDINGS.md), not a generic-schema problem;
// this milestone only adds the type/format check (must be a real UUID
// shape) that was missing entirely before.
export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(255),
    description: z.string().max(5000),
    owner: z.string().uuid().nullable(),
    contributors: z.array(z.string().uuid()).max(MAX_TASK_REFERENCE_ARRAY_LENGTH),
    reviewer: z.string().uuid().nullable(),
    dependencies: z.array(z.string().uuid()).max(MAX_TASK_REFERENCE_ARRAY_LENGTH),
    status: z.enum(['todo', 'in_progress', 'review', 'done']),
    priority: z.enum(['low', 'medium', 'high']),
  })
  .partial();
