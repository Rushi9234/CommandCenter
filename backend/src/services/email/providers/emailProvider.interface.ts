// Charter rules 2/13: business logic (emailService.ts) must never call a
// vendor (SendGrid, AWS SES, Mailgun, Resend, ...) directly. Every
// provider implementation in this directory implements this one
// interface; emailService.ts only ever talks to it through
// emailProviderFactory.ts, never to a concrete class.

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  // Whatever a real provider (SendGrid, SES, ...) would need to render or
  // send the actual message later -- may contain sensitive values like a
  // verification/reset URL. Providers decide for themselves what's safe
  // to log; see consoleEmailProvider.ts for why it never logs this.
  templateData?: Record<string, unknown>;
  // Caller-supplied, already-safe-to-log fields (event name, recipient
  // name, team name, etc.) -- never a token or a URL containing one.
  // Providers may log this freely.
  metadata?: Record<string, unknown>;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<boolean>;
}
