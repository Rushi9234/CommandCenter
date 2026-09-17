import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { BadRequestError } from './errors';

// The one place libphonenumber-js is imported (Charter-rule-style
// isolation, matching every other third-party-detail-stays-in-one-file
// convention in this codebase). 'IN' is only a DEFAULT region used when
// the caller's input has no country code at all -- a number already
// given with a leading '+<countrycode>' is parsed by its own country
// code regardless, so this does not hard-block non-Indian numbers; it
// only picks a sensible default for CommandCenter's India-focused user
// base per PROFILE_PHASE4_PHONE_SMS_PROVIDER_AUDIT.md.
export const normalizePhoneToE164 = (rawPhoneNumber: string): string => {
  const parsed = parsePhoneNumberFromString(rawPhoneNumber || '', 'IN');
  if (!parsed || !parsed.isValid()) {
    throw new BadRequestError('Invalid phone number');
  }
  return parsed.number; // E.164, e.g. "+919876543210"
};
