import nodemailer, { Transporter } from 'nodemailer';
import { EmailProvider, EmailMessage } from './emailProvider.interface';
import { env } from '../../../config/env';
import { getLogger } from '../../../common/logging/loggerFactory';

export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor(host: string, port: number, user: string, pass: string, fromAddress?: string) {
    const isSecure = port === 465;
    this.fromAddress = fromAddress || env.emailFrom;

    this.transporter = nodemailer.createTransport({
      host: host.trim(),
      port,
      secure: isSecure,
      auth: { user: user.trim(), pass: pass.trim() },
    });
  }

  async send(message: EmailMessage): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: message.to,
        subject: message.subject,
        text: message.body,
        html: message.html || message.body,
      });
      return true;
    } catch (err: any) {
      getLogger().error('SMTP send failed', {
        event: 'smtp.send_error',
        to: message.to,
        subject: message.subject,
        code: err?.code,
        command: err?.command,
        responseCode: err?.responseCode,
        message: err?.message,
      });
      return false;
    }
  }
}
