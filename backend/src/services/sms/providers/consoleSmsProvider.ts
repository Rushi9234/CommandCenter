import { getLogger } from '../../../common/logging/loggerFactory';
import { SmsProvider } from './smsProvider.interface';

// The free, zero-dependency default (Engineering Charter rule 1),
// mirroring ConsoleEmailProvider exactly. Does not actually deliver any
// SMS -- logs that a send was attempted via the Logger abstraction. This
// is also the ENTIRE test/dev safety net: SMS_PROVIDER defaults to
// 'console', so no test run, CI run, or local dev session ever reaches a
// real MSG91 API call unless SMS_PROVIDER=msg91 is explicitly set with a
// real MSG91_API_KEY present.
//
// Deliberately logs the OTP's DESTINATION (the phone number) but never
// the OTP value itself -- same rule emailService.ts already applies to a
// verification/reset token, extended to this credential type. A developer
// reading console output to manually test the phone-verification flow
// needs a different mechanism to see the code (e.g. a direct DB query
// against phone_otp_hash is intentionally not enough -- see
// PROFILE_PHASE4_PHONE_SMS_PROVIDER_AUDIT.md §5's "raw OTP never logged"
// requirement); this provider does not create that mechanism, deliberately,
// since the phone-otp hash column already exists to be read from directly.
export class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(phoneNumber: string): Promise<boolean> {
    getLogger().info('SMS OTP sent (console provider)', {
      event: 'sms.otp_sent',
      to: phoneNumber,
    });

    return true;
  }
}
