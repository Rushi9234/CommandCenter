import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { ExpressRateLimitProvider } from '../src/common/rateLimit/expressRateLimitProvider';
import { getRateLimitProvider, resetRateLimitProviderCache } from '../src/common/rateLimit/rateLimitProviderFactory';

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
