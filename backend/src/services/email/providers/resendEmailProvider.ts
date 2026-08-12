import { Resend } from 'resend';
import { EmailProvider, EmailMessage } from './emailProvider.interface';

// Milestone 55: the first real (non-console) EmailProvider implementation --
// exactly one class implementing the pre-existing interface, selected by
// emailProviderFactory.ts. Nothing about EmailMessage's shape, emailService.ts's
// call sites, or getEmailProvider()'s callers changes.
//
// `from` uses Resend's own sandbox sender (no domain verification required
// to start sending) -- a real deployment should replace this with a
// verified sending domain, which is an operational/deploy-time concern,
// not a new required environment variable for this code to function.
const FROM_ADDRESS = 'CommandCenter <onboarding@resend.dev>';

export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send(message: EmailMessage): Promise<boolean> {
    const result = await this.client.emails.send({
      from: FROM_ADDRESS,
      to: message.to,
      subject: message.subject,
      text: message.body,
    });

    // Resend's SDK resolves (never rejects) with { data, error } -- an API-
    // level failure (invalid key, rate limit, etc.) surfaces as `error`,
    // not a thrown exception. emailService.ts's sendSafely wrapper is the
    // layer that isolates a thrown exception; this is the layer that
    // isolates a resolved-but-failed send.
    return result.error === null;
  }
}
