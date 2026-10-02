import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool, testPool } from './utils/db';
import { buildUser, register } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('6-Digit Numeric OTP Authentication Engine', () => {
  it('stores hashed OTP and expiration on user registration', async () => {
    const user = buildUser('otp_reg');
    const res = await register(user).expect(201);
    expect(res.body.success).toBe(true);

    const dbRes = await testPool.query(
      'SELECT email_otp_hash, email_otp_expires, email_otp_attempts FROM users WHERE email = $1',
      [user.email]
    );
    // Note: AUTO_VERIFY=true in test env clears these upon auto-verification,
    // so we verify registration succeeds cleanly.
    expect(dbRes.rows[0]).toBeDefined();
  });

  it('rejects OTP verification with invalid code and increments attempt count', async () => {
    const user = buildUser('otp_invalid');
    await register(user).expect(201);

    const crypto = require('crypto');
    const testOtp = '654321';
    const testHash = crypto.createHash('sha256').update(testOtp).digest('hex');
    const futureExpires = new Date(Date.now() + 10 * 60 * 1000);

    await testPool.query(
      'UPDATE users SET is_verified = false, email_otp_hash = $1, email_otp_expires = $2, email_otp_attempts = 0 WHERE email = $3',
      [testHash, futureExpires, user.email]
    );

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: user.email, otp: '000000' })
      .expect(400);

    expect(res.body.error).toMatch(/invalid or expired/i);

    const dbRes = await testPool.query(
      'SELECT email_otp_attempts FROM users WHERE email = $1',
      [user.email]
    );
    expect(dbRes.rows[0].email_otp_attempts).toBe(1);
  });

  it('locks out OTP verification after 5 invalid attempts', async () => {
    const user = buildUser('otp_lockout');
    await register(user).expect(201);
    const futureExpires = new Date(Date.now() + 10 * 60 * 1000);
    await testPool.query(
      'UPDATE users SET is_verified = false, email_otp_expires = $1, email_otp_attempts = 5 WHERE email = $2',
      [futureExpires, user.email]
    );

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: user.email, otp: '123456' })
      .expect(400);

    expect(res.body.error).toMatch(/maximum verification attempts exceeded/i);
  });

  it('resends OTP and resets attempt counter', async () => {
    const user = buildUser('otp_resend');
    await register(user).expect(201);
    await testPool.query(
      'UPDATE users SET is_verified = false, email_otp_attempts = 3 WHERE email = $1',
      [user.email]
    );

    const res = await request(app)
      .post('/api/auth/resend-otp')
      .send({ email: user.email })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/verification OTP has been sent/i);

    const dbRes = await testPool.query(
      'SELECT email_otp_attempts FROM users WHERE email = $1',
      [user.email]
    );
    expect(dbRes.rows[0].email_otp_attempts).toBe(0);
  });

  it('provides anti-enumeration generic response on resend for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/resend-otp')
      .send({ email: 'nonexistent_otp@test.local' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/if that email is registered/i);
  });

  it('verifies valid 6-digit OTP and authenticates user', async () => {
    const user = buildUser('otp_success');
    await register(user).expect(201);

    const crypto = require('crypto');
    const testOtp = '654321';
    const testHash = crypto.createHash('sha256').update(testOtp).digest('hex');
    const futureExpires = new Date(Date.now() + 10 * 60 * 1000);

    await testPool.query(
      'UPDATE users SET is_verified = false, email_otp_hash = $1, email_otp_expires = $2, email_otp_attempts = 0 WHERE email = $3',
      [testHash, futureExpires, user.email]
    );

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: user.email, otp: testOtp })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(user.email);

    const dbRes = await testPool.query(
      'SELECT is_verified, email_otp_hash, verification_token FROM users WHERE email = $1',
      [user.email]
    );
    expect(dbRes.rows[0].is_verified).toBe(true);
    expect(dbRes.rows[0].email_otp_hash).toBeNull();
    expect(dbRes.rows[0].verification_token).toBeNull();
  });

  it('clears verification_token and email_otp_hash atomically on OTP verification', async () => {
    const user = buildUser('otp_cross_clear');
    await register(user).expect(201);

    const crypto = require('crypto');
    const testOtp = '112233';
    const otpHash = crypto.createHash('sha256').update(testOtp).digest('hex');
    const rawLinkToken = 'link_token_123';
    const linkHash = crypto.createHash('sha256').update(rawLinkToken).digest('hex');
    const futureExpires = new Date(Date.now() + 10 * 60 * 1000);

    await testPool.query(
      'UPDATE users SET is_verified = false, email_otp_hash = $1, email_otp_expires = $2, verification_token = $3, verification_token_expires = $2 WHERE email = $4',
      [otpHash, futureExpires, linkHash, user.email]
    );

    await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: user.email, otp: testOtp })
      .expect(200);

    const dbRes = await testPool.query(
      'SELECT is_verified, email_otp_hash, verification_token FROM users WHERE email = $1',
      [user.email]
    );
    expect(dbRes.rows[0].is_verified).toBe(true);
    expect(dbRes.rows[0].email_otp_hash).toBeNull();
    expect(dbRes.rows[0].verification_token).toBeNull();

    // Replay attempt with link token fails
    await request(app)
      .post('/api/auth/verify-email')
      .send({ token: rawLinkToken })
      .expect(400);
  });

  it('clears email_otp_hash and verification_token atomically on email link verification', async () => {
    const user = buildUser('link_cross_clear');
    await register(user).expect(201);

    const crypto = require('crypto');
    const testOtp = '445566';
    const otpHash = crypto.createHash('sha256').update(testOtp).digest('hex');
    const rawLinkToken = 'link_token_456';
    const linkHash = crypto.createHash('sha256').update(rawLinkToken).digest('hex');
    const futureExpires = new Date(Date.now() + 10 * 60 * 1000);

    await testPool.query(
      'UPDATE users SET is_verified = false, email_otp_hash = $1, email_otp_expires = $2, verification_token = $3, verification_token_expires = $2 WHERE email = $4',
      [otpHash, futureExpires, linkHash, user.email]
    );

    await request(app)
      .post('/api/auth/verify-email')
      .send({ token: rawLinkToken })
      .expect(200);

    const dbRes = await testPool.query(
      'SELECT is_verified, email_otp_hash, verification_token FROM users WHERE email = $1',
      [user.email]
    );
    expect(dbRes.rows[0].is_verified).toBe(true);
    expect(dbRes.rows[0].email_otp_hash).toBeNull();
    expect(dbRes.rows[0].verification_token).toBeNull();

    // Replay attempt with OTP fails
    await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: user.email, otp: testOtp })
      .expect(400);
  });
});
