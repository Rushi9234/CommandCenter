import { Logger, LogContext } from './logger.interface';

// The free, zero-dependency default (Engineering Charter rule 1). Writes
// one structured JSON object to stdout per call -- console.log for info,
// console.warn for warn, console.error for error, matching each method's
// native severity so nothing about *where* a line ends up (stdout vs
// stderr) changes from direct console usage.
export class ConsoleLogger implements Logger {
  info(message: string, context?: LogContext): void {
    console.log(this.format('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.format('warn', message, context));
  }

  error(message: string, context?: LogContext): void {
    console.error(this.format('error', message, context));
  }

  private format(level: 'info' | 'warn' | 'error', message: string, context?: LogContext) {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context ? { context } : {}),
    };
  }
}
