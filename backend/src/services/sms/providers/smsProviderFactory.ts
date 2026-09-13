import { env } from '../../../config/env';
import { SmsProvider } from './smsProvider.interface';
import { ConsoleSmsProvider } from './consoleSmsProvider';
import { Msg91SmsProvider } from './msg91SmsProvider';

// The one place that decides which SmsProvider implementation is active,
// based on the SMS_PROVIDER env var (config/env.ts). smsService.ts calls
// getSmsProvider() and never imports a concrete provider class directly.
// Mirrors emailProviderFactory.ts exactly.
let cachedProvider: SmsProvider | null = null;

export const getSmsProvider = (): SmsProvider => {
  if (cachedProvider) {
    return cachedProvider;
  }

  switch (env.smsProvider) {
    // If MSG91_API_KEY/MSG91_SENDER_ID/MSG91_DLT_TEMPLATE_ID are missing,
    // fall back to the console provider rather than throwing at request
    // time -- matches emailProviderFactory.ts's "degrade, don't crash"
    // precedent for a misconfigured real provider (e.g. RESEND_API_KEY
    // missing). This is also what keeps SMS_PROVIDER=msg91 safe to set in
    // an environment where the DLT/vendor setup (see
    // PROFILE_PHASE4_PHONE_SMS_PROVIDER_AUDIT.md) isn't finished yet --
    // it degrades to logging instead of crashing every phone-verification
    // request.
    case 'msg91':
      cachedProvider =
        process.env.MSG91_API_KEY && process.env.MSG91_SENDER_ID && process.env.MSG91_DLT_TEMPLATE_ID
          ? new Msg91SmsProvider(process.env.MSG91_API_KEY, process.env.MSG91_SENDER_ID, process.env.MSG91_DLT_TEMPLATE_ID)
          : new ConsoleSmsProvider();
      break;
    case 'console':
    default:
      // Free-first default (Engineering Charter rule 1): an unrecognized
      // value falls back to the free console provider rather than
      // failing every phone-verification flow closed -- and is also the
      // reason no test, CI run, or plain local dev session ever reaches
      // MSG91 unless SMS_PROVIDER is explicitly set to 'msg91'.
      cachedProvider = new ConsoleSmsProvider();
      break;
  }

  return cachedProvider;
};

// Test-only: forces the next getSmsProvider() call to re-read
// env.smsProvider and re-select instead of reusing the cached instance.
export const resetSmsProviderCache = (): void => {
  cachedProvider = null;
};
