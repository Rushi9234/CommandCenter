// Charter rules 2/13: business logic (emailService.ts) must never call a
// vendor (SendGrid, AWS SES, Mailgun, Resend, ...) directly. Every
// provider implementation in this directory implements this one
// interface; emailService.ts only ever talks to it through
// emailProviderFactory.ts, never to a concrete class.

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  html?: string;
  attachments?: EmailAttachment[];
  templateData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<boolean>;
}
