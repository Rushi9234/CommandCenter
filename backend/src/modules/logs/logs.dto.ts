import { z } from 'zod';

export const logEntrySchema = z.object({
  entryText: z.preprocess(
    (val) => (val === undefined || val === null ? '' : val),
    z.string().min(10, 'Entry text must be 10-5000 characters').max(5000, 'Entry text must be 10-5000 characters')
  ),
});
