import { ConsoleLogger } from '../src/common/logging/consoleLogger';
import { getLogger, resetLoggerCache } from '../src/common/logging/loggerFactory';

describe('loggerFactory', () => {
  afterEach(() => {
    resetLoggerCache();
  });

  it('returns ConsoleLogger by default (LOGGER unset)', () => {
    const original = process.env.LOGGER;
    delete process.env.LOGGER;
    jest.resetModules();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getLogger: freshGetLogger } = require('../src/common/logging/loggerFactory');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ConsoleLogger: FreshConsoleLogger } = require('../src/common/logging/consoleLogger');

      expect(freshGetLogger()).toBeInstanceOf(FreshConsoleLogger);
    } finally {
      if (original !== undefined) process.env.LOGGER = original;
      jest.resetModules();
    }
  });

  it('returns ConsoleLogger when LOGGER=console', () => {
    const original = process.env.LOGGER;
    process.env.LOGGER = 'console';
    jest.resetModules();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getLogger: freshGetLogger } = require('../src/common/logging/loggerFactory');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ConsoleLogger: FreshConsoleLogger } = require('../src/common/logging/consoleLogger');

      expect(freshGetLogger()).toBeInstanceOf(FreshConsoleLogger);
    } finally {
      process.env.LOGGER = original;
      jest.resetModules();
    }
  });

  it('falls back safely to ConsoleLogger for an unknown LOGGER value', () => {
    const original = process.env.LOGGER;
    process.env.LOGGER = 'some-vendor-that-does-not-exist';
    jest.resetModules();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getLogger: freshGetLogger } = require('../src/common/logging/loggerFactory');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ConsoleLogger: FreshConsoleLogger } = require('../src/common/logging/consoleLogger');

      expect(freshGetLogger()).toBeInstanceOf(FreshConsoleLogger);
    } finally {
      process.env.LOGGER = original;
      jest.resetModules();
    }
  });

  it('caches the selected logger across repeated calls until reset', () => {
    const first = getLogger();
    const second = getLogger();
    expect(first).toBe(second);

    resetLoggerCache();
    const third = getLogger();
    expect(third).not.toBe(first);
  });
});

describe('ConsoleLogger', () => {
  it('outputs a structured {timestamp, level, message, context} object for info', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = new ConsoleLogger();

    logger.info('Something happened', { requestId: 'abc-123', module: 'test' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const entry = logSpy.mock.calls[0][0] as any;
    expect(typeof entry.timestamp).toBe('string');
    expect(new Date(entry.timestamp).toString()).not.toBe('Invalid Date');
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('Something happened');
    expect(entry.context).toEqual({ requestId: 'abc-123', module: 'test' });

    logSpy.mockRestore();
  });

  it('uses console.warn for warn and console.error for error, matching native severity', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = new ConsoleLogger();

    logger.warn('A warning', { statusCode: 429 });
    logger.error('An error', { errorType: 'TestError', statusCode: 500 });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect((warnSpy.mock.calls[0][0] as any).level).toBe('warn');
    expect((errorSpy.mock.calls[0][0] as any).level).toBe('error');

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('omits the context key entirely when no context is passed', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = new ConsoleLogger();

    logger.info('No context here');

    const entry = logSpy.mock.calls[0][0] as any;
    expect(entry.message).toBe('No context here');
    expect('context' in entry).toBe(false);

    logSpy.mockRestore();
  });
});
