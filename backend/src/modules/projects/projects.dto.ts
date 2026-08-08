import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

export const createProjectSchema = z.object({
  projectName: requiredString('Project name is required'),
  description: z.string().optional(),
  teamId: z.string().optional(),
  priority: z.string().optional(),
  deadline: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export const analyzeProjectSchema = z.object({
  projectName: requiredString('Project name and description are required'),
  description: requiredString('Project name and description are required'),
  requirements: z.string().optional(),
});

export const createTaskSchema = z.object({
  title: requiredString('Task title is required'),
  description: z.string().optional(),
  owner: z.string().optional(),
  contributors: z.array(z.string()).optional(),
  reviewer: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
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
    contributors: z.array(z.string().uuid()),
    reviewer: z.string().uuid().nullable(),
    dependencies: z.array(z.string().uuid()),
    status: z.enum(['todo', 'in_progress', 'review', 'done']),
    priority: z.enum(['low', 'medium', 'high']),
  })
  .partial();
