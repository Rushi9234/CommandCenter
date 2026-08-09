import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

// Each schema mirrors exactly what the pre-refactor controller already
// required by hand (`if (!teamName) return 400...`) -- additive validation,
// nothing that was previously accepted is now rejected.

export const createTeamSchema = z.object({
  teamName: requiredString('Team name is required', 1, 255),
  description: z.string().max(5000).optional(),
  isPublic: z.boolean().optional(),
  maxTeamSize: z.union([z.number(), z.string()]).optional(),
  parentTeamId: z.string().optional(),
  department: z.string().optional(),
  teamType: z.string().optional(),
});

export const addMemberSchema = z.object({
  userId: requiredString('User ID is required'),
  role: z
    .enum(['admin', 'manager', 'member', 'viewer'], {
      message: 'Valid role is required (admin, manager, member, or viewer)',
    })
    .optional(),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'manager', 'member', 'viewer'], {
    message: 'Valid role is required (admin, manager, member, or viewer)',
  }),
});

export const updateMemberPermissionsSchema = z.object({
  permissions: z.any(),
});

export const inviteMemberSchema = z.object({
  email: requiredString('Email is required'),
});

export const searchTeamsQuerySchema = z.object({
  q: requiredString('Search query is required'),
});

// Milestone 35: was z.record(z.any()) -- any body key reached
// TEAM_SETTINGS_UPDATABLE_COLUMNS's buildSetClause allowlist unchecked.
// parent_team_id is kept (re-parenting by an authorized caller is
// legitimate) but now also gated at the route level against the
// destination team (teams.routes.ts) -- closing the M31-identified gap
// where this field had no destination-team check at all, the same class
// M29/M30 already fixed for projects.team_id/goals.parent_goal_id.
// team_type/department have no established enum anywhere in the
// product (createTeamSchema itself accepts any string for teamType), so
// they keep free-text with a length bound rather than a fabricated enum.
export const updateTeamSettingsSchema = z
  .object({
    team_name: z.string().min(1).max(255),
    description: z.string().max(5000),
    is_public: z.boolean(),
    is_discoverable: z.boolean(),
    max_team_size: z.number().int().min(1).max(10000),
    parent_team_id: z.string().uuid().nullable(),
    department: z.string().max(255),
    team_type: z.string().max(50),
  })
  .partial();
