import { getLogger } from '../../../common/logging/loggerFactory';
import { EmailProvider, EmailMessage } from './emailProvider.interface';

// The free, zero-dependency default (Engineering Charter rule 1). Does
// not actually deliver any email -- logs that a send was attempted via
// the Logger abstraction (Milestone 14), exactly as emailService.ts's
// three functions did directly before this milestone.
//
// Deliberately never logs message.body or message.templateData: those
// are exactly where a verification/reset URL (and the raw token in it)
// would live, and Milestone 11 fixed a real leak of that value into
// logs. Only `to`, `subject`, and the caller-supplied `metadata` (which
// callers must only ever populate with already-safe fields -- see
// emailService.ts) are logged.
export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<boolean> {
    getLogger().info('Email sent (console provider)', {
      event: 'email.sent',
      to: message.to,
      subject: message.subject,
      ...message.metadata,
    });

    return true;
  }
}
