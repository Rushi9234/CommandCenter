import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, registerAndLogin, register, login, buildUser, extractCookie } from './utils/fixtures';
import { ExpressRateLimitProvider } from '../src/common/rateLimit/expressRateLimitProvider';
import { getRateLimitProvider, resetRateLimitProviderCache } from '../src/common/rateLimit/rateLimitProviderFactory';
import { hashToken, generateOpaqueToken } from '../src/modules/auth/jwt';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('ExpressRateLimitProvider', () => {
  it('createAuthLimiter returns Express middleware', () => {
    const provider = new ExpressRateLimitProvider();
    const limiter = provider.createAuthLimiter();
    expect(typeof limiter).toBe('function');
    // Express middleware signature: (req, res, next).
    expect(limiter.length).toBe(3);
  });

  it('createApiLimiter returns Express middleware', () => {
    const provider = new ExpressRateLimitProvider();
    const limiter = provider.createApiLimiter();
    expect(typeof limiter).toBe('function');
    expect(limiter.length).toBe(3);
  });

  it('createRefreshLimiter returns Express middleware', () => {
    const provider = new ExpressRateLimitProvider();
    const limiter = provider.createRefreshLimiter();
    expect(typeof limiter).toBe('function');
    expect(limiter.length).toBe(3);
  });
});

describe('rateLimitProviderFactory', () => {
  afterEach(() => {
    resetRateLimitProviderCache();
  });

  it('selects ExpressRateLimitProvider by default (RATE_LIMIT_PROVIDER unset)', () => {
    const original = process.env.RATE_LIMIT_PROVIDER;
    delete process.env.RATE_LIMIT_PROVIDER;
    jest.resetModules();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getRateLimitProvider: freshGetRateLimitProvider } = require('../src/common/rateLimit/rateLimitProviderFactory');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ExpressRateLimitProvider: FreshExpressRateLimitProvider } = require('../src/common/rateLimit/expressRateLimitProvider');

      expect(freshGetRateLimitProvider()).toBeInstanceOf(FreshExpressRateLimitProvider);
    } finally {
      if (original !== undefined) process.env.RATE_LIMIT_PROVIDER = original;
      jest.resetModules();
    }
  });

  it('selects ExpressRateLimitProvider when RATE_LIMIT_PROVIDER=express', () => {
    const original = process.env.RATE_LIMIT_PROVIDER;
    process.env.RATE_LIMIT_PROVIDER = 'express';
    jest.resetModules();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getRateLimitProvider: freshGetRateLimitProvider } = require('../src/common/rateLimit/rateLimitProviderFactory');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ExpressRateLimitProvider: FreshExpressRateLimitProvider } = require('../src/common/rateLimit/expressRateLimitProvider');

      expect(freshGetRateLimitProvider()).toBeInstanceOf(FreshExpressRateLimitProvider);
    } finally {
      process.env.RATE_LIMIT_PROVIDER = original;
      jest.resetModules();
    }
  });

  it('falls back safely to ExpressRateLimitProvider for an unknown RATE_LIMIT_PROVIDER value', () => {
    const original = process.env.RATE_LIMIT_PROVIDER;
    process.env.RATE_LIMIT_PROVIDER = 'some-vendor-that-does-not-exist';
    jest.resetModules();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getRateLimitProvider: freshGetRateLimitProvider } = require('../src/common/rateLimit/rateLimitProviderFactory');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ExpressRateLimitProvider: FreshExpressRateLimitProvider } = require('../src/common/rateLimit/expressRateLimitProvider');

      expect(freshGetRateLimitProvider()).toBeInstanceOf(FreshExpressRateLimitProvider);
    } finally {
      process.env.RATE_LIMIT_PROVIDER = original;
      jest.resetModules();
    }
  });

  it('caches the selected provider across repeated calls until reset', () => {
    const first = getRateLimitProvider();
    const second = getRateLimitProvider();
    expect(first).toBe(second);

    resetRateLimitProviderCache();
    const third = getRateLimitProvider();
    expect(third).not.toBe(first);
  });
});

describe('Auth rate limiter -- threshold and keying unchanged from before Milestone 17', () => {
  it('allows attempts under the threshold, 429s at the threshold, and does not block a different email', async () => {
    const emailA = `ratelimit_a_${Date.now()}@test.local`;
    const emailB = `ratelimit_b_${Date.now()}@test.local`;

    // 10 attempts for emailA -- max: 10 allows exactly this many, none
    // should be limited.
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/auth/login').send({ email: emailA, password: 'WrongPassword1' });
      expect(res.status).not.toBe(429);
    }

    // The 11th attempt for the same identity crosses the threshold.
    const eleventh = await request(app).post('/api/auth/login').send({ email: emailA, password: 'WrongPassword1' });
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error).toMatch(/too many attempts/i);

    // A different email is keyed separately (IP+email, not IP alone) --
    // supertest requests all originate from the same connection, so this
    // proves the key isn't just req.ip.
    const otherEmail = await request(app).post('/api/auth/login').send({ email: emailB, password: 'WrongPassword1' });
    expect(otherEmail.status).not.toBe(429);
  });

  it('exposes RateLimit-* response headers (standardHeaders)', async () => {
    const email = `ratelimit_headers_${Date.now()}@test.local`;
    const res = await request(app).post('/api/auth/login').send({ email, password: 'WrongPassword1' });

    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });
});

describe('Milestone 22 -- POST /api/ai/chat rate limiter, keyed by user ID', () => {
  it('allows attempts under the threshold, 429s at the threshold, and does not block a different user', async () => {
    const userA = await registerAndLogin('apilimit_a');
    const userB = await registerAndLogin('apilimit_b');

    // 20 chat requests for userA -- max: 20 allows exactly this many.
    for (let i = 0; i < 20; i++) {
      const res = await request(app).post('/api/ai/chat').set(authHeader(userA.token)).send({ message: `hello ${i}` });
      expect(res.status).not.toBe(429);
    }

    // The 21st attempt for the same user crosses the threshold.
    const twentyFirst = await request(app).post('/api/ai/chat').set(authHeader(userA.token)).send({ message: 'one too many' });
    expect(twentyFirst.status).toBe(429);
    expect(twentyFirst.body.error).toMatch(/too many attempts/i);

    // A different authenticated user is keyed separately (per-user, not
    // per-IP) -- supertest requests all originate from the same
    // connection, so this proves the key is req.user.userId, not req.ip.
    const otherUser = await request(app).post('/api/ai/chat').set(authHeader(userB.token)).send({ message: 'hi' });
    expect(otherUser.status).not.toBe(429);
  });

  it('rejects unauthenticated requests before the rate limiter is ever reached', async () => {
    const res = await request(app).post('/api/ai/chat').send({ message: 'hello' });
    expect(res.status).toBe(401);
  });
});

describe('Milestone 33 -- rate limiter window reset (shared express-rate-limit mechanism)', () => {
  // Every provider method (createAuthLimiter/createApiLimiter/
  // createRefreshLimiter) is a thin wrapper around the same
  // express-rate-limit factory with a fixed 15-minute (or 5-minute)
  // window -- too long to wait out for real in a test. This builds a
  // tiny standalone app with the identical mechanism and a short window
  // instead, to prove the underlying reset behavior directly rather than
  // asserting it by reading the config.
  it('resets the counter once windowMs elapses', async () => {
    const probeApp = express();
    probeApp.use(
      rateLimit({
        windowMs: 200,
        max: 2,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: () => 'fixed-key',
        handler: (_req, res) => res.status(429).json({ error: 'Too many attempts. Please try again later.' }),
      })
    );
    probeApp.get('/probe', (_req, res) => res.json({ ok: true }));

    await request(probeApp).get('/probe').expect(200);
    await request(probeApp).get('/probe').expect(200);
    await request(probeApp).get('/probe').expect(429);

    await new Promise((resolve) => setTimeout(resolve, 250));

    await request(probeApp).get('/probe').expect(200);
  });
});

describe('Milestone 33 -- resend-verification rate limiter (reuses the auth limiter: IP+email)', () => {
  it('allows attempts under the threshold, 429s at the threshold, and does not block a different email', async () => {
    const emailA = `m33_resend_a_${Date.now()}@test.local`;
    const emailB = `m33_resend_b_${Date.now()}@test.local`;

    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/auth/resend-verification').send({ email: emailA });
      expect(res.status).not.toBe(429);
    }

    const eleventh = await request(app).post('/api/auth/resend-verification').send({ email: emailA });
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error).toMatch(/too many attempts/i);

    const otherEmail = await request(app).post('/api/auth/resend-verification').send({ email: emailB });
    expect(otherEmail.status).not.toBe(429);
  });

  it('does not reveal whether the rate-limited email exists -- identical 429 body for a real vs nonexistent email', async () => {
    const real = await registerAndLogin('m33_resend_real');
    const fakeEmail = `m33_resend_fake_${Date.now()}@test.local`;

    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/resend-verification').send({ email: real.user.email });
    }
    const realLimited = await request(app).post('/api/auth/resend-verification').send({ email: real.user.email });
    expect(realLimited.status).toBe(429);

    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/resend-verification').send({ email: fakeEmail });
    }
    const fakeLimited = await request(app).post('/api/auth/resend-verification').send({ email: fakeEmail });
    expect(fakeLimited.status).toBe(429);

    expect(realLimited.body).toEqual(fakeLimited.body);
  });

  it('a 429-rejected request never reaches the service -- no new verification token is issued', async () => {
    const { userId, user } = await registerAndLogin('m33_resend_state');
    // AUTO_VERIFY=true auto-verifies on register; force this account back
    // to unverified with a known token so a real resend would rotate it.
    await pgPool.query(
      "UPDATE users SET is_verified = false, verification_token = 'm33_placeholder_hash', verification_token_expires = NOW() + interval '1 day' WHERE user_id = $1",
      [userId]
    );

    // These 10 legitimately reach the service (account is unverified) and
    // rotate the token each time.
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/resend-verification').send({ email: user.email });
    }
    const afterTenth = await pgPool.query('SELECT verification_token FROM users WHERE user_id = $1', [userId]);

    const eleventh = await request(app).post('/api/auth/resend-verification').send({ email: user.email });
    expect(eleventh.status).toBe(429);

    const afterEleventh = await pgPool.query('SELECT verification_token FROM users WHERE user_id = $1', [userId]);
    expect(afterEleventh.rows[0].verification_token).toBe(afterTenth.rows[0].verification_token);
  });
});

describe('Milestone 33 -- reset-password rate limiter (reuses the auth limiter: no email in the body, so IP-only)', () => {
  const setValidResetToken = async (userId: string) => {
    const rawToken = generateOpaqueToken();
    await pgPool.query(
      "UPDATE users SET password_reset_token_hash = $1, password_reset_expires = NOW() + interval '1 hour' WHERE user_id = $2",
      [hashToken(rawToken), userId]
    );
    return rawToken;
  };

  it('429s after exceeding the threshold, and a rejected request does not consume a valid reset token', async () => {
    const { userId } = await registerAndLogin('m33_reset_combined');
    const rawToken = await setValidResetToken(userId);

    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/auth/reset-password').send({ token: 'garbage', newPassword: 'Passw0rd!123' });
      expect(res.status).not.toBe(429);
    }

    const limited = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'NewPassw0rd!456' });
    expect(limited.status).toBe(429);

    // The real token's hash must be untouched -- resetPassword's service
    // logic (which would clear it) was never reached.
    const row = await pgPool.query('SELECT password_reset_token_hash FROM users WHERE user_id = $1', [userId]);
    expect(row.rows[0].password_reset_token_hash).toBe(hashToken(rawToken));
  });
});

describe('Milestone 33 -- refresh rate limiter (new, IP-only, more generous than the auth limiter)', () => {
  it('rotation still works below the threshold, 429s after exceeding it, does not interfere with existing revocation/replay checks, and a rejected request does not rotate a still-valid token', async () => {
    const user = buildUser('m33_refresh_combined');
    await register(user).expect(201);
    const loginRes = await login(user.email, user.password).expect(200);
    const validRefreshToken = extractCookie(loginRes, 'refresh_token') as string;
    expect(validRefreshToken).toBeDefined();

    // 1 request, well under the 30/15min cap -- rotation still works.
    const firstRefresh = await request(app).post('/api/auth/refresh').send({ refreshToken: validRefreshToken });
    expect(firstRefresh.status).toBe(200);
    expect(firstRefresh.body.data.accessToken).toBeDefined();

    // 2nd request: replaying the now-rotated-out token is rejected on its
    // own merits (existing rotation/revocation logic), not by the limiter.
    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken: validRefreshToken });
    expect(replay.status).toBe(401);

    // 28 more (garbage tokens) brings the running total to 30 -- still
    // all under the cap, still rejected for being invalid, not for 429.
    for (let i = 0; i < 28; i++) {
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' });
      expect(res.status).not.toBe(429);
    }

    // The 31st request from this IP crosses the threshold.
    const overLimit = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' });
    expect(overLimit.status).toBe(429);

    // A fresh, genuinely valid token from a second user is still rejected
    // once the IP is over its budget -- proving this is IP-only (not
    // per-token/per-user, unlike the login limiter's IP+email key) -- and
    // that the rejected request never reaches the rotation logic at all.
    const secondUser = buildUser('m33_refresh_state_check');
    await register(secondUser).expect(201);
    const secondLogin = await login(secondUser.email, secondUser.password).expect(200);
    const secondValidToken = extractCookie(secondLogin, 'refresh_token') as string;

    const rejectedWithValidToken = await request(app).post('/api/auth/refresh').send({ refreshToken: secondValidToken });
    expect(rejectedWithValidToken.status).toBe(429);

    const row = await pgPool.query('SELECT revoked_at FROM refresh_tokens WHERE token_hash = $1', [hashToken(secondValidToken)]);
    expect(row.rows[0].revoked_at).toBeNull();
  });
});
