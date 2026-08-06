import { z } from 'zod';

// A required string field that produces the same custom message whether the
// field is missing entirely, null, or an empty string. Plain
// `z.string().min(1, msg)` only uses `msg` for the length check -- if the
// field is absent, Zod's base type-check fires first with its own generic
// "expected string, received undefined" message, which would have been a
// silent regression against the original hand-written `if (!field)` checks
// this DTO layer replaced.
export const requiredString = (message: string) =>
  z.preprocess((val) => (val === undefined || val === null ? '' : val), z.string().min(1, message));
