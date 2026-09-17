import { z } from 'zod';

export const getWorklogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});
