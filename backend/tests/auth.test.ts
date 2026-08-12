import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool, testPool } from './utils/db';
import { buildUser, register, login, extractCookie } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  // Two separate pools point at commandcenter_test: this file's own
  // testPool (table resets) and the app's real pgPool (everything the
  // routes under test actually query through). Both have to close or
  // Jest hangs waiting for their idle connections after the run finishes.
  await closeTestPool();
  await pgPool.end();
});

describe('POST /api/auth/register', () => {
  it('registers a new user with valid input', async () => {
    const user = buildUser('reg_valid');
    const res = await register(user).expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(user.email);
    // .env.test has AUTO_VERIFY=true -- development behavior.
    expect(res.body.data.is_verified).toBe(true);
  });

  it('rejects a duplicate email', async () => {
    const user = buildUser('reg_dupe');
    await register(user).expect(201);

    const res = await register({ ...user, username: `${user.username}_2` }).expect(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('rejects registration with missing required fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'incomplete@test.local', password: 'Passw0rd!123' })
      .expect(400);
    expect(res.body.error).toBeDefined();
  });

  it('rejects registration with a too-short password', async () => {
    const user = buildUser('reg_shortpw');
    const res = await register({ ...user, password: 'short' }).expect(400);
    expect(res.body.error).toMatch(/password/i);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const user = buildUser('login_ok');
    await register(user).expect(201);

    const res = await login(user.email, user.password).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(user.email);
  });

  it('rejects an incorrect password', async () => {
    const user = buildUser('login_badpw');
    await register(user).expect(201);

    const res = await login(user.email, 'WrongPassword1').expect(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it('rejects a nonexistent user', async () => {
    const res = await login('nobody_here@test.local', 'Passw0rd!123').expect(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });
});

describe('Refresh token flow', () => {
  const getRefreshToken = async () => {
    const user = buildUser('refresh_setup');
    await register(user).expect(201);
    const res = await login(user.email, user.password).expect(200);
    const refreshToken = extractCookie(res, 'refresh_token');
    expect(refreshToken).toBeDefined();
    return refreshToken as string;
  };

  it('issues a new access token for a valid refresh token', async () => {
    const refreshToken = await getRefreshToken();

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken }).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('rotates the refresh token -- the old one no longer works after one use', async () => {
    const refreshToken = await getRefreshToken();

    // First use succeeds and rotates (auth.service.ts's refresh() revokes
    // the old token the moment a new one is issued from it).
    await request(app).post('/api/auth/refresh').send({ refreshToken }).expect(200);

    // Replaying the same (now-revoked) refresh token must fail.
    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken }).expect(401);
    expect(replay.body.error).toMatch(/invalid or expired/i);
  });

  it('rejects a refresh token after logout revokes it', async () => {
    const refreshToken = await getRefreshToken();

    await request(app).post('/api/auth/logout').send({ refreshToken }).expect(200);

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken }).expect(401);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it('rejects a garbage refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' }).expect(401);
    expect(res.body.error).toBeDefined();
  });
});

describe('Email verification gate', () => {
  // This file's other tests rely on .env.test's AUTO_VERIFY=true (loaded
  // by tests/setup/env.ts before any import below runs). To exercise the
  // opposite branch -- production, where autoVerify is forced false
  // regardless of the AUTO_VERIFY value (see config/env.ts) -- this test
  // needs its own fresh module registry with NODE_ENV overridden BEFORE
  // config/env.ts is first imported. `import` statements are hoisted
  // above any other top-level statement, which would run the override too
  // late, so this uses `require()` (not hoisted) instead.
  it('requires verification before login when NODE_ENV=production, even with AUTO_VERIFY=true in the environment', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const prodRequest = require('supertest');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app: prodApp } = require('../src/app');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { pgPool: prodPool } = require('../src/utils/database');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildUser: prodBuildUser } = require('./utils/fixtures');

    try {
      const user = prodBuildUser('prod_verify');
      const regRes = await prodRequest(prodApp)
        .post('/api/auth/register')
        .send({ email: user.email, password: user.password, fullName: user.fullName, username: user.username })
        .expect(201);

      // autoVerify forced false in production -- registration must not
      // auto-verify even though AUTO_VERIFY=true is set in the environment.
      expect(regRes.body.data.is_verified).toBe(false);

      // Milestone 38: login no longer reveals verification state via a
      // distinct status/message -- an unverified account now gets the
      // exact same 401 "Invalid credentials" as every other login failure.
      const loginRes = await prodRequest(prodApp).post('/api/auth/login').send({ email: user.email, password: user.password }).expect(401);
      expect(loginRes.body.error).toBe('Invalid credentials');
    } finally {
      await prodPool.end();
      process.env.NODE_ENV = originalNodeEnv;
      jest.resetModules();
    }
  });

  it('preserves development auto-verify behavior (unchanged from before Milestone 7/8)', async () => {
    const user = buildUser('dev_verify');
    const res = await register(user).expect(201);
    expect(res.body.data.is_verified).toBe(true);

    // Auto-verified, so login should succeed immediately with no
    // separate verification step.
    await login(user.email, user.password).expect(200);
  });
});

describe('POST /api/auth/resend-verification -- Milestone 26: no account enumeration', () => {
  const EXPECTED_MESSAGE = 'If that email is registered and not yet verified, a verification link has been sent.';

  it('returns the generic success response for a nonexistent email', async () => {
    const res = await request(app).post('/api/auth/resend-verification').send({ email: 'nobody_here_m26@test.local' }).expect(200);

    expect(res.body).toEqual({ success: true, message: EXPECTED_MESSAGE });
  });

  it('returns the same generic success response, and actually resends, for a real unverified email', async () => {
    // .env.test's AUTO_VERIFY=true auto-verifies every normal registration
    // -- creating a genuinely unverified user needs the same isolated-
    // module-registry + NODE_ENV=production technique the "Email
    // verification gate" tests above already use, since production forces
    // autoVerify false regardless of the AUTO_VERIFY env var.
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.resetModules();

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const prodRequest = require('supertest');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app: prodApp } = require('../src/app');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { pgPool: prodPool } = require('../src/utils/database');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildUser: prodBuildUser } = require('./utils/fixtures');

    try {
      const user = prodBuildUser('resend_unverified');
      const regRes = await prodRequest(prodApp)
        .post('/api/auth/register')
        .send({ email: user.email, password: user.password, fullName: user.fullName, username: user.username })
        .expect(201);
      expect(regRes.body.data.is_verified).toBe(false);

      logSpy.mockClear();
      const res = await prodRequest(prodApp).post('/api/auth/resend-verification').send({ email: user.email }).expect(200);

      expect(res.body).toEqual({ success: true, message: EXPECTED_MESSAGE });

      // Preserved existing behavior: a real unverified account still
      // actually gets a new verification email queued.
      const loggedEvents = logSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
      expect(loggedEvents).toContain('email.verification_sent');

      await prodPool.end();
    } finally {
      logSpy.mockRestore();
      process.env.NODE_ENV = originalNodeEnv;
      jest.resetModules();
    }
  });

  it('returns the same generic success response for an already-verified email, without resending', async () => {
    const user = buildUser('resend_verified');
    await register(user).expect(201); // AUTO_VERIFY=true -- already verified.

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const res = await request(app).post('/api/auth/resend-verification').send({ email: user.email }).expect(200);
    const loggedEvents = logSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
    logSpy.mockRestore();

    expect(res.body).toEqual({ success: true, message: EXPECTED_MESSAGE });
    expect(loggedEvents).not.toContain('email.verification_sent');
  });

  it('never discloses account existence or verification state -- all three cases return an identical response', async () => {
    const verifiedUser = buildUser('resend_identical_verified');
    await register(verifiedUser).expect(201);

    const nonexistentRes = await request(app).post('/api/auth/resend-verification').send({ email: 'still_nobody_m26@test.local' });
    const verifiedRes = await request(app).post('/api/auth/resend-verification').send({ email: verifiedUser.email });

    expect(nonexistentRes.status).toBe(verifiedRes.status);
    expect(nonexistentRes.body).toEqual(verifiedRes.body);
  });
});

// ---------------------------------------------------------------------------
// Milestone 55: POST /auth/verify-email + email-provider failure isolation.
// Creating a genuinely unverified user needs the same isolated-module-
// registry + NODE_ENV=production technique the "Email verification gate"
// tests above already use (.env.test's AUTO_VERIFY=true auto-verifies
// everything otherwise). The raw verification token is never returned by
// the API and never logged (by design -- see observability.test.ts) -- the
// only way to observe it in a black-box test is to spy on
// emailService.sendVerificationEmail's own `token` argument, the same
// value it's given before it's hashed for storage.
// ---------------------------------------------------------------------------

const registerUnverifiedAndCaptureToken = async (label: string) => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  jest.resetModules();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const prodRequest = require('supertest');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app: prodApp } = require('../src/app');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { pgPool: prodPool } = require('../src/utils/database');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { buildUser: prodBuildUser } = require('./utils/fixtures');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const emailService = require('../src/services/emailService');

  let capturedToken = '';
  const sendSpy = jest.spyOn(emailService, 'sendVerificationEmail').mockImplementation(async (_email: any, token: any) => {
    capturedToken = token;
    return true;
  });

  const user = prodBuildUser(label);
  await prodRequest(prodApp)
    .post('/api/auth/register')
    .send({ email: user.email, password: user.password, fullName: user.fullName, username: user.username })
    .expect(201);

  return {
    user,
    token: capturedToken,
    prodRequest,
    prodApp,
    cleanup: async () => {
      sendSpy.mockRestore();
      await prodPool.end();
      process.env.NODE_ENV = originalNodeEnv;
      jest.resetModules();
    },
  };
};

describe('Milestone 55 -- POST /auth/verify-email', () => {
  it('verifies a valid token and returns a full session', async () => {
    const { token, prodRequest, prodApp, cleanup } = await registerUnverifiedAndCaptureToken('m55_verify_ok');
    try {
      const res = await prodRequest(prodApp).post('/api/auth/verify-email').send({ token }).expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it('rejects an expired verification token', async () => {
    const { user, token, prodRequest, prodApp, cleanup } = await registerUnverifiedAndCaptureToken('m55_verify_expired');
    try {
      await testPool.query(`UPDATE users SET verification_token_expires = NOW() - INTERVAL '1 hour' WHERE email = $1`, [user.email]);

      const res = await prodRequest(prodApp).post('/api/auth/verify-email').send({ token }).expect(400);
      expect(res.body.error).toMatch(/invalid or expired/i);
    } finally {
      await cleanup();
    }
  });

  it('rejects a token that has already been used once (single-use)', async () => {
    const { token, prodRequest, prodApp, cleanup } = await registerUnverifiedAndCaptureToken('m55_verify_reuse');
    try {
      await prodRequest(prodApp).post('/api/auth/verify-email').send({ token }).expect(200);

      const replay = await prodRequest(prodApp).post('/api/auth/verify-email').send({ token });
      expect(replay.status).toBe(400);
      expect(replay.body.error).toMatch(/invalid or expired/i);
    } finally {
      await cleanup();
    }
  });

  it('rejects a garbage token without leaking internal detail', async () => {
    const res = await request(app).post('/api/auth/verify-email').send({ token: 'not-a-real-token' }).expect(400);
    expect(res.body.error).toBe('Invalid or expired verification token');
  });
});

describe('Milestone 55 -- email provider failure isolation', () => {
  it('registration still succeeds when the email provider throws', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const prodRequest = require('supertest');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app: prodApp } = require('../src/app');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { pgPool: prodPool } = require('../src/utils/database');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildUser: prodBuildUser } = require('./utils/fixtures');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const factory = require('../src/services/email/providers/emailProviderFactory');

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const providerSpy = jest.spyOn(factory, 'getEmailProvider').mockReturnValue({
      send: jest.fn().mockRejectedValue(new Error('SENSITIVE_PROVIDER_DETAIL_should_never_leak')),
    });

    try {
      const user = prodBuildUser('m55_provider_throws');
      const res = await prodRequest(prodApp)
        .post('/api/auth/register')
        .send({ email: user.email, password: user.password, fullName: user.fullName, username: user.username })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.is_verified).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain('SENSITIVE_PROVIDER_DETAIL_should_never_leak');
    } finally {
      providerSpy.mockRestore();
      errorSpy.mockRestore();
      await prodPool.end();
      process.env.NODE_ENV = originalNodeEnv;
      jest.resetModules();
    }
  });

  it('forgot-password still succeeds when the email provider returns false', async () => {
    // Milestone 55: isolated module registry (same technique as the
    // "provider throws" test above) so the mocked factory is guaranteed
    // to be the exact instance app.ts's require graph resolves to --
    // spying on a bare require() of the factory from within an
    // already-shared module registry was found NOT to intercept
    // emailService.ts's own call during this test's development (the
    // real ConsoleEmailProvider ran instead), which is exactly the class
    // of false-positive this isolated-registry pattern avoids.
    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const prodRequest = require('supertest');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app: freshApp } = require('../src/app');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { pgPool: freshPool } = require('../src/utils/database');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildUser: freshBuildUser } = require('./utils/fixtures');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const factory = require('../src/services/email/providers/emailProviderFactory');

    const providerSpy = jest.spyOn(factory, 'getEmailProvider').mockReturnValue({
      send: jest.fn().mockResolvedValue(false),
    });

    try {
      const user = freshBuildUser('m55_forgot_provider_false');
      await prodRequest(freshApp)
        .post('/api/auth/register')
        .send({ email: user.email, password: user.password, fullName: user.fullName, username: user.username })
        .expect(201);

      const res = await prodRequest(freshApp).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
      expect(res.body).toEqual({ success: true, message: 'If that email is registered, a reset link has been sent.' });
      expect(factory.getEmailProvider).toHaveBeenCalled();
    } finally {
      providerSpy.mockRestore();
      await freshPool.end();
      jest.resetModules();
    }
  });
});
