import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

export const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(255).optional(),
  bio: z.string().max(500).optional(),
  pronouns: z.string().max(50).optional(),
  location: z.string().max(100).optional(),
  is_profile_public: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  current_password: requiredString('Current password required'),
  new_password: requiredString('New password must be at least 8 characters', 8),
});

export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;
