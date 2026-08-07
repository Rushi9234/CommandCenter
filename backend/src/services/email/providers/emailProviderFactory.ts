import { env } from '../../../config/env';
import { EmailProvider } from './emailProvider.interface';
import { ConsoleEmailProvider } from './consoleEmailProvider';

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

  switch (env.emailProvider) {
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
