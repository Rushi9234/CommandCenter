import { z } from 'zod';

// A required string field that produces the same custom message whether the
// field is missing entirely, null, or an empty string. Plain
// `z.string().min(1, msg)` only uses `msg` for the length check -- if the
// field is absent, Zod's base type-check fires first with its own generic
// "expected string, received undefined" message, which would have been a
// silent regression against the original hand-written `if (!field)` checks
// this DTO layer replaced.
// Milestone 40: maxLength is optional so every existing call site (which
// only ever passed message/minLength) keeps compiling and behaving
// identically -- callers that need an upper bound (closing the
// unbounded-string-length gap, see docs/security/SECURITY_FINDINGS.md)
// pass a third argument instead of chaining .max() on the result, which
// z.preprocess's wrapper type doesn't expose directly.
export const requiredString = (message: string, minLength: number = 1, maxLength?: number) => {
  const stringSchema = maxLength !== undefined ? z.string().min(minLength, message).max(maxLength, message) : z.string().min(minLength, message);
  return z.preprocess((val) => (val === undefined || val === null ? '' : val), stringSchema);
};
