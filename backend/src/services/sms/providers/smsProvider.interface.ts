// Charter rules 2/13: business logic (smsService.ts) must never call a
// vendor (MSG91, Twilio, AWS, ...) directly. Every provider implementation
// in this directory implements this one interface; smsService.ts only
// ever talks to it through smsProviderFactory.ts, never to a concrete
// class. Mirrors emailProvider.interface.ts exactly.
//
// Per PROFILE_PHASE4_PHONE_SMS_PROVIDER_AUDIT.md §3.2/§4: CommandCenter
// owns the entire OTP lifecycle (generation, hashing, storage, expiry,
// attempt-counting, verification). This interface deliberately has no
// verifyOtp() method -- the provider is delivery-only. The OTP is already
// generated and embedded in `otp` by the time this is called; the
// provider's only job is getting that exact 6-digit string in front of
// the user via SMS.

export interface SmsProvider {
  // `phoneNumber` is always E.164-normalized by the caller (users.service.ts)
  // before this is invoked -- providers never see or need to normalize a
  // raw, user-typed phone number. Returns false (never throws a vendor-
  // specific error type) on a resolved-but-failed send, mirroring
  // EmailProvider.send()'s exact contract so smsService.ts's
  // sendSafely-equivalent wrapper can treat every provider identically.
  sendOtp(phoneNumber: string, otp: string): Promise<boolean>;
}
