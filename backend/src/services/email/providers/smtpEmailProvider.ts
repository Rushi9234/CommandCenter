import nodemailer, { Transporter } from 'nodemailer';
import { EmailProvider, EmailMessage } from './emailProvider.interface';

// Temporary E2E-testing provider only -- selected via EMAIL_PROVIDER=smtp,
// entirely additive alongside ConsoleEmailProvider/ResendEmailProvider.
// Production remains EMAIL_PROVIDER=resend; this class exists so an
// authenticated E2E pass can be run against a free SMTP testing sandbox
// (e.g. Mailtrap) without touching the Resend configuration at all.
// All connection details come from environment variables -- nothing here
// is hardcoded, matching ResendEmailProvider's own "no vendor detail
// outside its own provider file" convention.
export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;

  constructor(host: string, port: number, user: string, pass: string) {
    this.transporter = nodemailer.createTransport({
      host,
      port,
      auth: { user, pass },
    });
  }

  async send(message: EmailMessage): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: 'CommandCenter <test@commandcenter.local>',
        to: message.to,
        subject: message.subject,
        text: message.body,
      });
      return true;
    } catch {
      // Mirrors ResendEmailProvider's boundary: a send failure here becomes
      // a plain `false`, never a thrown detail -- emailService.ts's
      // sendSafely() is the layer that decides how (and how safely) that
      // gets logged, exactly as it already does for Resend. Never include
      // the caught error itself (it could echo back host/user/pass from
      // the transport's own connection string) or any part of `message`
      // (body/templateData carries the verification/reset token).
      return false;
    }
  }
}
