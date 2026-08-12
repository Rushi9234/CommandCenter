import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

// Milestone 49: entries are meant to be small, frequent, timestamped
// updates through the day -- 1000 chars is generous for that (vs.
// logEntrySchema's 5000, sized for one larger free-form daily log) and
// cheap to bound the AI summarization prompt's total size by, alongside
// the separate MAX_ENTRIES_PER_DAY cap enforced in the service layer
// (Zod can bound one entry's length, not "how many of these exist
// already" -- that needs a DB-backed check).
export const createWorkEntrySchema = z.object({
  teamId: z.string().uuid(),
  entryText: requiredString('Entry text is required', 1, 1000),
});

export const teamIdQuerySchema = z.object({
  teamId: z.string().uuid(),
});

export const summarizeWorkSchema = z.object({
  teamId: z.string().uuid(),
});

// Milestone 49: confirmedSummary is the user's own reviewed/edited final
// text -- same length bound as logEntrySchema's entryText, since it plays
// the same role (the one piece of free text that becomes the permanent
// record). aiSummary is optional/purely informational (what the AI
// drafted, if anything, kept for the record) -- never used to authorize
// or validate confirmedSummary against.
export const submitWorkSchema = z.object({
  teamId: z.string().uuid(),
  confirmedSummary: requiredString('Confirmed summary is required', 10, 5000),
  aiSummary: z.string().max(5000).optional(),
});

export const workHistoryDateQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
    .optional(),
});

// Milestone 53: personal history is bounded the same way getMyLogsQuerySchema
// already bounds GET /logs/my ([1, 100], default 30) -- here capped at 30
// (not 100) since pagination/date-range browsing is explicitly deferred,
// not just unbounded-input hardening; a caller cannot request more than
// this one page's worth of their own history via this endpoint.
export const workHistoryQuerySchema = z.object({
  teamId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(30).optional().default(30),
});
