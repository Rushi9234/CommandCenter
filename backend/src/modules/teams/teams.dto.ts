import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

// Each schema mirrors exactly what the pre-refactor controller already
// required by hand (`if (!teamName) return 400...`) -- additive validation,
// nothing that was previously accepted is now rejected.

export const createTeamSchema = z.object({
  teamName: requiredString('Team name is required'),
  description: z.string().optional(),
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

export const updateTeamSettingsSchema = z.record(z.string(), z.any());
