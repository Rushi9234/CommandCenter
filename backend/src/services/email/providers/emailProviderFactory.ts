import { env } from '../../../config/env';
import { EmailProvider } from './emailProvider.interface';
import { ConsoleEmailProvider } from './consoleEmailProvider';
import { ResendEmailProvider } from './resendEmailProvider';
import { SmtpEmailProvider } from './smtpEmailProvider';

// The one place that decides which EmailProvider implementation is
// active, based on the EMAIL_PROVIDER env var (config/env.ts).
// emailService.ts calls getEmailProvider() and never imports a concrete
// provider class directly. Adding a future provider (SendGrid, SES) means
// adding one class implementing EmailProvider and one branch here -- no
// change to emailService.ts or anything that calls it.
let cachedProvider: EmailProvider | null = null;

export const getEmailProvider = (): EmailProvider => {
  if (cachedProvider) {
    return cachedProvider;
  }

  console.log('EMAIL DEBUG:', {
  provider: env.emailProvider,
  hasHost: !!process.env.SMTP_HOST,
  hasPort: !!process.env.SMTP_PORT,
  hasUser: !!process.env.SMTP_USER,
  hasPass: !!process.env.SMTP_PASS,
});

  switch (env.emailProvider) {
    // Milestone 55: RESEND_API_KEY is read directly here (not added to
    // config/env.ts) -- this is the one place that already decides which
    // provider is active, and the key is needed by no other module. If the
    // key is missing, fall back to the console provider rather than
    // throwing at request time (matches the 'unrecognized value' fallback
    // below -- an EmailProvider that can't send should degrade, not crash
    // every auth flow that sends an email).
    case 'resend':
      cachedProvider = process.env.RESEND_API_KEY
        ? new ResendEmailProvider(process.env.RESEND_API_KEY)
        : new ConsoleEmailProvider();
      break;
    // Temporary E2E-testing provider (see smtpEmailProvider.ts) -- not a
    // production option. Falls back to ConsoleEmailProvider if any of the
    // four required variables is missing, matching the 'resend' case's
    // same "degrade, don't crash" precedent above.
    case 'smtp':
      cachedProvider =
        process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS
          ? new SmtpEmailProvider(
              process.env.SMTP_HOST,
              parseInt(process.env.SMTP_PORT, 10),
              process.env.SMTP_USER,
              process.env.SMTP_PASS
            )
          : new ConsoleEmailProvider();
      break;
    case 'console':
    default:
      // Free-first default (Engineering Charter rule 1): an unrecognized
      // value falls back to the free console provider rather than
      // failing every auth/team-invite email flow closed.
      cachedProvider = new ConsoleEmailProvider();
      break;
  }

  return cachedProvider;
};

// Test-only: forces the next getEmailProvider() call to re-read
// env.emailProvider and re-select instead of reusing the cached instance.
export const resetEmailProviderCache = (): void => {
  cachedProvider = null;
};
