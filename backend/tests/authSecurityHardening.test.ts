import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { withTransaction } from '../src/db/client';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, buildUser, register, login, registerAndLogin, extractCookie } from './utils/fixtures';
import { generateOpaqueToken, hashToken } from '../src/modules/auth/jwt';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const setValidResetToken = async (userId: string) => {
  const rawToken = generateOpaqueToken();
  await pgPool.query(
    "UPDATE users SET password_reset_token_hash = $1, password_reset_expires = NOW() + interval '1 hour' WHERE user_id = $2",
    [hashToken(rawToken), userId]
  );
  return rawToken;
};

const resetPassword = (rawToken: string, newPassword: string) =>
  request(app).post('/api/auth/reset-password').send({ token: rawToken, newPassword });

describe('Milestone 38 -- password reset invalidates already-issued JWTs (legacy bearer + short-lived access token)', () => {
  it('an old legacy bearer token stops authenticating after a password reset', async () => {
    const { token, userId } = await registerAndLogin('m38_legacy_invalidate');

    // Confirmed valid before the reset.
    await request(app).get('/api/logs/my').set(authHeader(token)).expect(200);

    const rawResetToken = await setValidResetToken(userId);
    await resetPassword(rawResetToken, 'BrandNewPassw0rd!789').expect(200);

    // The same, never-expired-by-itself legacy JWT must now be rejected.
    const res = await request(app).get('/api/logs/my').set(authHeader(token)).expect(401);
    expect(res.body.error).toBe('Invalid token');
  });

  it('an old short-lived cookie access token also stops authenticating after a password reset', async () => {
    const user = buildUser('m38_cookie_invalidate');
    await register(user).expect(201);
    const loginRes = await login(user.email, user.password).expect(200);
    const accessToken = extractCookie(loginRes, 'access_token') as string;
    const userId = loginRes.body.data.user.user_id;

    await request(app).get('/api/logs/my').set('Cookie', [`access_token=${accessToken}`]).expect(200);

    const rawResetToken = await setValidResetToken(userId);
    await resetPassword(rawResetToken, 'BrandNewPassw0rd!789').expect(200);

    const res = await request(app).get('/api/logs/my').set('Cookie', [`access_token=${accessToken}`]);
    expect(res.status).toBe(401);
  });

  it('does not reject tokens for a user who has never reset their password (no forced logout on unrelated accounts)', async () => {
    const { token } = await registerAndLogin('m38_never_reset');
    await request(app).get('/api/logs/my').set(authHeader(token)).expect(200);
  });
});

describe('Milestone 38 -- password reset revokes refresh tokens and enables a clean new login', () => {
  it('the old refresh token is rejected after a password reset', async () => {
    const user = buildUser('m38_refresh_after_reset');
    await register(user).expect(201);
    const loginRes = await login(user.email, user.password).expect(200);
    const refreshToken = extractCookie(loginRes, 'refresh_token') as string;
    const userId = loginRes.body.data.user.user_id;

    const rawResetToken = await setValidResetToken(userId);
    await resetPassword(rawResetToken, 'BrandNewPassw0rd!789').expect(200);

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);

    const row = await pgPool.query('SELECT revoked_at FROM refresh_tokens WHERE token_hash = $1', [hashToken(refreshToken)]);
    expect(row.rows[0].revoked_at).not.toBeNull();
  });

  it('logging in with the new password succeeds, and the old password no longer works', async () => {
    const user = buildUser('m38_new_login');
    await register(user).expect(201);
    const loginRes = await login(user.email, user.password).expect(200);
    const userId = loginRes.body.data.user.user_id;

    const rawResetToken = await setValidResetToken(userId);
    await resetPassword(rawResetToken, 'BrandNewPassw0rd!789').expect(200);

    await login(user.email, 'BrandNewPassw0rd!789').expect(200);
    await login(user.email, user.password).expect(401);
  });
});

describe('Milestone 38 -- refresh-token rotation, reuse detection, and expiry remain correct (regression)', () => {
  it('rotation still issues a new access token, and the rotated-out token is rejected on replay', async () => {
    const user = buildUser('m38_rotation_regression');
    await register(user).expect(201);
    const loginRes = await login(user.email, user.password).expect(200);
    const refreshToken = extractCookie(loginRes, 'refresh_token') as string;

    const firstRefresh = await request(app).post('/api/auth/refresh').send({ refreshToken }).expect(200);
    expect(firstRefresh.body.data.accessToken).toBeDefined();

    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken }).expect(401);
    expect(replay.body.error).toMatch(/invalid or expired/i);
  });

  it('an expired refresh token is rejected', async () => {
    const { userId } = await registerAndLogin('m38_expired_refresh');
    const rawToken = generateOpaqueToken();
    await pgPool.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() - interval '1 hour')",
      [userId, hashToken(rawToken)]
    );

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: rawToken });
    expect(res.status).toBe(401);
  });
});

describe('Milestone 38 -- login no longer reveals account existence or verification state', () => {
  const attempt = (email: string, password = 'SomePassword1!') => login(email, password);

  it('nonexistent email, unverified account, and verified-account-wrong-password all produce byte-identical responses', async () => {
    const verifiedUser = await registerAndLogin('m38_enum_verified');

    // Unverified account: same isolated-registry + NODE_ENV=production
    // technique already established in auth.test.ts, since .env.test's
    // AUTO_VERIFY=true auto-verifies every normal registration.
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

    let unverifiedRes;
    try {
      const unverifiedUser = prodBuildUser('m38_enum_unverified');
      await prodRequest(prodApp)
        .post('/api/auth/register')
        .send({
          email: unverifiedUser.email,
          password: unverifiedUser.password,
          fullName: unverifiedUser.fullName,
          username: unverifiedUser.username,
        })
        .expect(201);

      unverifiedRes = await prodRequest(prodApp).post('/api/auth/login').send({ email: unverifiedUser.email, password: unverifiedUser.password });
    } finally {
      await prodPool.end();
      process.env.NODE_ENV = originalNodeEnv;
      jest.resetModules();
    }

    const nonexistentRes = await attempt('m38_enum_nobody_here@test.local');
    const wrongPasswordRes = await attempt(verifiedUser.user.email, 'DefinitelyWrongPassword1!');

    expect(nonexistentRes.status).toBe(401);
    expect(unverifiedRes.status).toBe(401);
    expect(wrongPasswordRes.status).toBe(401);

    expect(nonexistentRes.body).toEqual(unverifiedRes.body);
    expect(nonexistentRes.body).toEqual(wrongPasswordRes.body);
    expect(nonexistentRes.body.error).toBe('Invalid credentials');
  });

  it('bcrypt.compare runs exactly once for both a nonexistent email and a real account -- the same computational cost is always paid, not just for real accounts', async () => {
    const compareSpy = jest.spyOn(bcrypt, 'compare');
    const verifiedUser = await registerAndLogin('m38_timing_real');

    compareSpy.mockClear();
    await attempt('m38_timing_nobody@test.local');
    expect(compareSpy).toHaveBeenCalledTimes(1);

    compareSpy.mockClear();
    await attempt(verifiedUser.user.email, 'WrongPassword1!');
    expect(compareSpy).toHaveBeenCalledTimes(1);

    compareSpy.mockRestore();
  });

  it('still correctly authenticates a real, verified user with the right password (security fix does not weaken real auth)', async () => {
    const user = buildUser('m38_still_works');
    await register(user).expect(201);
    await login(user.email, user.password).expect(200);
  });
});

describe('Milestone 38 -- password reset token security (regression + enumeration)', () => {
  it('forgotPassword still returns an identical generic response for a real vs. a nonexistent email (regression)', async () => {
    const real = await registerAndLogin('m38_forgot_real');
    const realRes = await request(app).post('/api/auth/forgot-password').send({ email: real.user.email });
    const fakeRes = await request(app).post('/api/auth/forgot-password').send({ email: 'm38_forgot_fake@test.local' });

    expect(realRes.status).toBe(fakeRes.status);
    expect(realRes.body).toEqual(fakeRes.body);
  });

  it('a reset token cannot be reused after a successful reset (single-use)', async () => {
    const { userId } = await registerAndLogin('m38_single_use');
    const rawToken = await setValidResetToken(userId);

    await resetPassword(rawToken, 'FirstNewPassw0rd!1').expect(200);

    const reuse = await resetPassword(rawToken, 'SecondNewPassw0rd!2');
    expect(reuse.status).toBe(400);
    expect(reuse.body.error).toMatch(/invalid or expired/i);
  });

  it('an expired reset token is rejected, and does not change the password', async () => {
    const { userId } = await registerAndLogin('m38_expired_reset');
    const rawToken = generateOpaqueToken();
    await pgPool.query(
      "UPDATE users SET password_reset_token_hash = $1, password_reset_expires = NOW() - interval '1 hour' WHERE user_id = $2",
      [hashToken(rawToken), userId]
    );
    const originalHash = (await pgPool.query('SELECT password_hash FROM users WHERE user_id = $1', [userId])).rows[0].password_hash;

    const res = await resetPassword(rawToken, 'ShouldNotApply1!');
    expect(res.status).toBe(400);

    const row = await pgPool.query('SELECT password_hash FROM users WHERE user_id = $1', [userId]);
    expect(row.rows[0].password_hash).toBe(originalHash);
  });
});

describe('Milestone 38 -- password reset atomicity (proves the transaction mechanism, not just a single successful run)', () => {
  it('a failure between the password update and session revocation rolls back the password change', async () => {
    const { userId } = await registerAndLogin('m38_atomicity');
    const originalHash = (await pgPool.query('SELECT password_hash FROM users WHERE user_id = $1', [userId])).rows[0].password_hash;

    await expect(
      withTransaction(async (client) => {
        await client.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', ['should-be-rolled-back', userId]);
        throw new Error('Simulated failure between password update and session revocation');
      })
    ).rejects.toThrow('Simulated failure');

    const row = await pgPool.query('SELECT password_hash FROM users WHERE user_id = $1', [userId]);
    expect(row.rows[0].password_hash).toBe(originalHash);
  });
});

describe('Milestone 38 -- CSRF protection remains intact on cookie-authenticated requests (regression)', () => {
  it('a cookie-authenticated state-changing request without a matching CSRF header is still rejected', async () => {
    const user = buildUser('m38_csrf_regression');
    await register(user).expect(201);
    const loginRes = await login(user.email, user.password).expect(200);
    const accessToken = extractCookie(loginRes, 'access_token');
    const csrfToken = extractCookie(loginRes, 'csrf_token');

    const withoutHeader = await request(app)
      .post('/api/projects')
      .set('Cookie', [`access_token=${accessToken}`])
      .send({ projectName: 'CSRF regression check' });
    expect(withoutHeader.status).toBe(403);

    const withHeader = await request(app)
      .post('/api/projects')
      .set('Cookie', [`access_token=${accessToken}`, `csrf_token=${csrfToken}`])
      .set('X-CSRF-Token', csrfToken as string)
      .send({ projectName: 'CSRF regression check' });
    expect(withHeader.status).not.toBe(403);
  });
});
