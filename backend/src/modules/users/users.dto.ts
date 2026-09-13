import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

export const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(255).optional(),
  // .nullable() -- the controller's `!== undefined` checks (not `!== null`)
  // are a deliberate "null means explicitly clear this field, undefined
  // means leave it alone" convention; the schema previously rejected null
  // outright (400), silently blocking the one path meant to support it.
  // full_name is intentionally not nullable -- it's NOT NULL in the DB and
  // has no "clear it" affordance anywhere in the product.
  bio: z.string().max(500).nullable().optional(),
  pronouns: z.string().max(50).nullable().optional(),
  location: z.string().max(100).nullable().optional(),
  is_profile_public: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  current_password: requiredString('Current password required'),
  new_password: requiredString('New password must be at least 8 characters', 8),
});

// Phase 4 email-change request. Only format is validated here (a
// malformed address is safe to reject plainly -- it's a client input
// problem, not an account-existence oracle). "Already registered to
// someone else" and "identical to current email" are deliberately NOT
// distinguished from each other by this schema or by users.service.ts's
// requestEmailChange -- both collapse into the same generic error there,
// per the Phase 4 audit's enumeration-resistance recommendation (§2.7).
export const requestEmailChangeSchema = z.object({
  new_email: z.string().email('Invalid email address').max(255),
  current_password: requiredString('Current password required'),
});

export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;
export type RequestEmailChangeRequest = z.infer<typeof requestEmailChangeSchema>;
