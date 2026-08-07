import { ConsoleEmailProvider } from '../src/services/email/providers/consoleEmailProvider';
import { getEmailProvider, resetEmailProviderCache } from '../src/services/email/providers/emailProviderFactory';

describe('ConsoleEmailProvider', () => {
  it('resolves true and logs only safe fields, never body or templateData', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const provider = new ConsoleEmailProvider();

    const secretToken = 'raw-secret-verification-token-abc123';
    const result = await provider.send({
      to: 'someone@test.local',
      subject: 'Verify your account',
      body: `Click here: https://example.com/verify?token=${secretToken}`,
      templateData: { verificationUrl: `https://example.com/verify?token=${secretToken}` },
      metadata: { event: 'email.verification_sent', to: 'someone@test.local', name: 'Someone' },
    });

    expect(result).toBe(true);
    expect(logSpy).toHaveBeenCalledTimes(1);

    const entry = logSpy.mock.calls[0][0] as any;
    expect(entry.context.event).toBe('email.verification_sent');
    expect(entry.context.to).toBe('someone@test.local');
    expect(entry.context.subject).toBe('Verify your account');

    const loggedText = JSON.stringify(entry);
    expect(loggedText).not.toContain(secretToken);
    expect(loggedText).not.toContain('templateData');

    logSpy.mockRestore();
  });
});

describe('emailProviderFactory', () => {
  afterEach(() => {
    resetEmailProviderCache();
  });

  it('selects ConsoleEmailProvider by default (EMAIL_PROVIDER unset)', () => {
    const original = process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_PROVIDER;
    jest.resetModules();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getEmailProvider: freshGetEmailProvider } = require('../src/services/email/providers/emailProviderFactory');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ConsoleEmailProvider: FreshConsoleEmailProvider } = require('../src/services/email/providers/consoleEmailProvider');

      expect(freshGetEmailProvider()).toBeInstanceOf(FreshConsoleEmailProvider);
    } finally {
      if (original !== undefined) process.env.EMAIL_PROVIDER = original;
      jest.resetModules();
    }
  });

  it('selects ConsoleEmailProvider when EMAIL_PROVIDER=console', () => {
    const original = process.env.EMAIL_PROVIDER;
    process.env.EMAIL_PROVIDER = 'console';
    jest.resetModules();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getEmailProvider: freshGetEmailProvider } = require('../src/services/email/providers/emailProviderFactory');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ConsoleEmailProvider: FreshConsoleEmailProvider } = require('../src/services/email/providers/consoleEmailProvider');

      expect(freshGetEmailProvider()).toBeInstanceOf(FreshConsoleEmailProvider);
    } finally {
      process.env.EMAIL_PROVIDER = original;
      jest.resetModules();
    }
  });

  it('falls back safely to ConsoleEmailProvider for an unknown EMAIL_PROVIDER value', () => {
    const original = process.env.EMAIL_PROVIDER;
    process.env.EMAIL_PROVIDER = 'some-vendor-that-does-not-exist';
    jest.resetModules();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getEmailProvider: freshGetEmailProvider } = require('../src/services/email/providers/emailProviderFactory');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ConsoleEmailProvider: FreshConsoleEmailProvider } = require('../src/services/email/providers/consoleEmailProvider');

      expect(freshGetEmailProvider()).toBeInstanceOf(FreshConsoleEmailProvider);
    } finally {
      process.env.EMAIL_PROVIDER = original;
      jest.resetModules();
    }
  });

  it('caches the selected provider across repeated calls until reset', () => {
    const first = getEmailProvider();
    const second = getEmailProvider();
    expect(first).toBe(second);

    resetEmailProviderCache();
    const third = getEmailProvider();
    expect(third).not.toBe(first);
  });
});
