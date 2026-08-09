import { z } from 'zod';

export const logEntrySchema = z.object({
  entryText: z.preprocess(
    (val) => (val === undefined || val === null ? '' : val),
    z.string().min(10, 'Entry text must be 10-5000 characters').max(5000, 'Entry text must be 10-5000 characters')
  ),
});

// Milestone 41: `?limit=` on GET /logs/my reached a raw SQL LIMIT with only
// `parseInt(...) || 30` guarding it (logs.controller.ts) -- a negative
// value (parseInt('-1') = -1, truthy) reached Postgres directly (which
// rejects a negative LIMIT, surfacing as an untranslated 500), and there
// was no upper bound at all, so a caller could request their entire log
// history in one query. Self-scoped (WHERE user_id = $1 elsewhere), so
// this was never a cross-user exposure -- just an unvalidated/unbounded
// input. Bounded to the same [1, 100] range Zod already coerces/validates
// before the controller ever runs.
export const getMyLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});
