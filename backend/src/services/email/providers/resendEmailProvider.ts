import { Resend } from 'resend';
import { EmailProvider, EmailMessage } from './emailProvider.interface';
import { env } from '../../../config/env';

export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;
  private readonly fromAddress: string;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
    this.fromAddress = process.env.RESEND_FROM || env.emailFrom || 'CommandCenter <onboarding@resend.dev>';
  }

  async send(message: EmailMessage): Promise<boolean> {
    const result = await this.client.emails.send({
      from: this.fromAddress,
      to: message.to,
      subject: message.subject,
      text: message.body,
      html: message.html || message.body,
    });

    return result.error === null;
  }
}
