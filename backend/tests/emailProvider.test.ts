import { ConsoleEmailProvider } from '../src/services/email/providers/consoleEmailProvider';
import { getEmailProvider, resetEmailProviderCache } from '../src/services/email/providers/emailProviderFactory';

// Milestone 55: mocks the 'resend' package itself -- these tests never
// make a real network call to Resend's API, matching how this project
// has never automated a live call to any other external provider (Groq
// included) either.
const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

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

  it('selects ResendEmailProvider when EMAIL_PROVIDER=resend and RESEND_API_KEY is set', () => {
    const originalProvider = process.env.EMAIL_PROVIDER;
    const originalKey = process.env.RESEND_API_KEY;
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 'test-key';
    jest.resetModules();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getEmailProvider: freshGetEmailProvider } = require('../src/services/email/providers/emailProviderFactory');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ResendEmailProvider: FreshResendEmailProvider } = require('../src/services/email/providers/resendEmailProvider');

      expect(freshGetEmailProvider()).toBeInstanceOf(FreshResendEmailProvider);
    } finally {
      process.env.EMAIL_PROVIDER = originalProvider;
      process.env.RESEND_API_KEY = originalKey;
      jest.resetModules();
    }
  });

  it('falls back to ConsoleEmailProvider when EMAIL_PROVIDER=resend but RESEND_API_KEY is missing', () => {
    const originalProvider = process.env.EMAIL_PROVIDER;
    const originalKey = process.env.RESEND_API_KEY;
    process.env.EMAIL_PROVIDER = 'resend';
    delete process.env.RESEND_API_KEY;
    jest.resetModules();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getEmailProvider: freshGetEmailProvider } = require('../src/services/email/providers/emailProviderFactory');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ConsoleEmailProvider: FreshConsoleEmailProvider } = require('../src/services/email/providers/consoleEmailProvider');

      expect(freshGetEmailProvider()).toBeInstanceOf(FreshConsoleEmailProvider);
    } finally {
      process.env.EMAIL_PROVIDER = originalProvider;
      if (originalKey !== undefined) process.env.RESEND_API_KEY = originalKey;
      jest.resetModules();
    }
  });
});

describe('ResendEmailProvider', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('returns true on a successful send', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ResendEmailProvider } = require('../src/services/email/providers/resendEmailProvider');
    mockSend.mockResolvedValue({ data: { id: 'email_123' }, error: null });

    const provider = new ResendEmailProvider('test-key');
    const result = await provider.send({ to: 'someone@test.local', subject: 'Hi', body: 'Hello' });

    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'someone@test.local', subject: 'Hi', text: 'Hello' })
    );
  });

  it('returns false when Resend resolves with an API-level error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ResendEmailProvider } = require('../src/services/email/providers/resendEmailProvider');
    mockSend.mockResolvedValue({ data: null, error: { message: 'Invalid API key' } });

    const provider = new ResendEmailProvider('bad-key');
    const result = await provider.send({ to: 'someone@test.local', subject: 'Hi', body: 'Hello' });

    expect(result).toBe(false);
  });

  it('propagates a thrown/rejected send -- emailService.ts is the layer that isolates this', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ResendEmailProvider } = require('../src/services/email/providers/resendEmailProvider');
    mockSend.mockRejectedValue(new Error('network error'));

    const provider = new ResendEmailProvider('test-key');
    await expect(provider.send({ to: 'someone@test.local', subject: 'Hi', body: 'Hello' })).rejects.toThrow('network error');
  });
});

describe('Milestone 55 -- emailService failure isolation (sendSafely)', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('sendVerificationEmail resolves false (never throws) when the provider throws', async () => {
    jest.resetModules();
    jest.doMock('../src/services/email/providers/emailProviderFactory', () => ({
      getEmailProvider: () => ({ send: jest.fn().mockRejectedValue(new Error('boom')) }),
    }));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sendVerificationEmail } = require('../src/services/emailService');

    const result = await sendVerificationEmail('someone@test.local', 'raw-token', 'Someone');

    expect(result).toBe(false);
    errorSpy.mockRestore();
    jest.dontMock('../src/services/email/providers/emailProviderFactory');
  });

  it('sendPasswordResetEmail resolves false (never throws) when the provider resolves false', async () => {
    jest.resetModules();
    jest.doMock('../src/services/email/providers/emailProviderFactory', () => ({
      getEmailProvider: () => ({ send: jest.fn().mockResolvedValue(false) }),
    }));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sendPasswordResetEmail } = require('../src/services/emailService');

    const result = await sendPasswordResetEmail('someone@test.local', 'raw-token', 'Someone');

    expect(result).toBe(false);
    errorSpy.mockRestore();
    jest.dontMock('../src/services/email/providers/emailProviderFactory');
  });
});
