import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, buildUser, register, login, registerAndLogin } from './utils/fixtures';
import { sendVerificationEmail, sendPasswordResetEmail } from '../src/services/emailService';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('emailService -- never logs tokens or the links built from them', () => {
  const SECRET_TOKEN = 'super-secret-raw-token-should-never-appear-in-logs-abc123';

  it('sendVerificationEmail does not log the token or the verification URL', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await sendVerificationEmail('someone@test.local', SECRET_TOKEN, 'Someone');

    const allLoggedText = logSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
    expect(allLoggedText).not.toContain(SECRET_TOKEN);
    expect(allLoggedText).not.toContain('verify-email?token=');

    logSpy.mockRestore();
  });

  it('sendPasswordResetEmail does not log the token or the reset URL', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await sendPasswordResetEmail('someone@test.local', SECRET_TOKEN, 'Someone');

    const allLoggedText = logSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
    expect(allLoggedText).not.toContain(SECRET_TOKEN);
    expect(allLoggedText).not.toContain('reset-password?token=');

    logSpy.mockRestore();
  });

  it('registering a user who is not auto-verified never logs their verification token', async () => {
    // .env.test has AUTO_VERIFY=true, so this exercises the actual
    // register() -> sendVerificationEmail() call path with autoVerify
    // forced off for just this one call, the same isolated-registry
    // technique used in auth.test.ts's production-mode test.
    const originalAutoVerify = process.env.AUTO_VERIFY;
    process.env.AUTO_VERIFY = 'false';
    jest.resetModules();

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const freshRequest = require('supertest');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app: freshApp } = require('../src/app');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { pgPool: freshPool } = require('../src/utils/database');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { buildUser: freshBuildUser } = require('./utils/fixtures');

      const user = freshBuildUser('noautoverify');
      await freshRequest(freshApp)
        .post('/api/auth/register')
        .send({ email: user.email, password: user.password, fullName: user.fullName, username: user.username })
        .expect(201);

      const allLoggedText = logSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
      expect(allLoggedText).not.toMatch(/token=[a-f0-9]{20,}/i);
      expect(allLoggedText).toContain('email.verification_sent');

      await freshPool.end();
    } finally {
      logSpy.mockRestore();
      process.env.AUTO_VERIFY = originalAutoVerify;
      jest.resetModules();
    }
  });
});

describe('X-Request-ID -- every response carries a correlation ID', () => {
  it('includes an X-Request-ID header on a successful response', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('includes a different X-Request-ID on each request', async () => {
    const first = await request(app).get('/health');
    const second = await request(app).get('/health');
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('includes an X-Request-ID header on an error response too', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@test.local', password: 'WrongPassword1' }).expect(401);
    expect(res.headers['x-request-id']).toBeDefined();
  });
});

describe('errorHandler -- structured logs carry the request ID', () => {
  // auth.routes.ts's controllers predate the asyncHandler/next(error)
  // convention (Milestone 2 excluded auth from that refactor) and catch
  // their own errors inline, so they never reach errorHandler.ts at all --
  // confirmed by controllers/authController.ts's own try/catch. Every
  // other module's routes DO flow through asyncHandler -> next(error) ->
  // errorHandler, including validate() middleware's BadRequestError on a
  // failed Zod parse, which is what this test exercises instead.
  it('logs the same request ID that was returned in the X-Request-ID response header', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { token } = await registerAndLogin('errhandler');

    const res = await request(app).post('/api/teams').set(authHeader(token)).send({}).expect(400);
    const responseRequestId = res.headers['x-request-id'];
    expect(responseRequestId).toBeDefined();

    const loggedEntry = errorSpy.mock.calls.find((call) => {
      const arg = call[0];
      return typeof arg === 'object' && arg !== null && (arg as any).context?.event === 'request.error';
    });

    // Milestone 14: errorHandler.ts now logs through ConsoleLogger, which
    // wraps every call in {timestamp, level, message, context} -- the
    // same requestId/method/path/errorType/statusCode fields this test
    // has always checked now live under `context`, not at the top level.
    expect(loggedEntry).toBeDefined();
    const entry = loggedEntry![0] as any;
    expect(entry.level).toBe('error');
    expect(entry.context.requestId).toBe(responseRequestId);
    expect(entry.context.method).toBe('POST');
    expect(entry.context.path).toBe('/api/teams');
    expect(entry.context.statusCode).toBe(400);
    expect(entry.context.errorType).toBe('BadRequestError');

    errorSpy.mockRestore();
  });
});

describe('auth.service.ts -- security event logs never include secrets', () => {
  it('logs a failed-login event without the password', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = buildUser('secloguser');
    await register(user).expect(201);

    await login(user.email, 'TotallyWrongPassword1').expect(401);

    // Milestone 14: auth.service.ts now logs through ConsoleLogger --
    // event/email/reason live under `context`, not at the top level.
    const loggedEntry = warnSpy.mock.calls.find((call) => (call[0] as any)?.context?.event === 'auth.failed_login');
    expect(loggedEntry).toBeDefined();
    const entry = loggedEntry![0] as any;
    expect(entry.context.email).toBe(user.email);
    expect(entry.context.reason).toBe('invalid_password');

    const allLoggedText = warnSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
    expect(allLoggedText).not.toContain('TotallyWrongPassword1');

    warnSpy.mockRestore();
  });

  it('logs an invalid-refresh-token event without the raw token', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rawToken = 'garbage-refresh-token-value-that-does-not-exist';

    await request(app).post('/api/auth/refresh').send({ refreshToken: rawToken }).expect(401);

    const loggedEntry = warnSpy.mock.calls.find((call) => (call[0] as any)?.context?.event === 'auth.invalid_refresh_token');
    expect(loggedEntry).toBeDefined();

    const allLoggedText = warnSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
    expect(allLoggedText).not.toContain(rawToken);

    warnSpy.mockRestore();
  });
});
