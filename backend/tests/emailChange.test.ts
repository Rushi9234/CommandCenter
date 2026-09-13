import { describe, it, expect, beforeEach, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { closeTestPool, resetDatabase, testPool } from './utils/db';
import { registerAndLogin, authHeader, login } from './utils/fixtures';

// A successful email-change verification revokes every refresh token and
// invalidates every already-issued access/legacy token for the account
// (email_changed_at participates in JWT invalidation, mirroring
// password_changed_at -- see middleware/auth.ts and jwt.ts's `ecv` claim).
// Any test that needs to act as the account after that point must log in
// again with the NEW email, exactly like password-change-security.test.ts
// already establishes for password changes.
const reloginWith = async (email: string, password: string): Promise<string> => {
  const res = await login(email, password).expect(200);
  return res.body.data.token;
};

const emailService = require('../src/services/emailService');

let testToken: string;
let testUserId: string;
let testEmail: string;
const TEST_PASSWORD = 'Passw0rd!123'; // Default password from fixtures.ts buildUser

beforeEach(async () => {
  await resetDatabase();

  const result = await registerAndLogin('email-change');
  testUserId = result.userId;
  testToken = result.token;
  testEmail = result.user.email;
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const requestEmailChange = (token: string, newEmail: string, currentPassword: string) =>
  request(app).post('/api/users/me/request-email-change').set(authHeader(token)).send({ new_email: newEmail, current_password: currentPassword });

const resendEmailChange = (token: string) => request(app).post('/api/users/me/resend-email-change-verification').set(authHeader(token));

const verifyEmailChange = (token: string) => request(app).post('/api/auth/verify-email-change').send({ token });

describe('Phase 4 Email-Change Backend', () => {
  describe('request-email-change', () => {
    it('succeeds with correct password and returns pending_email, response envelope correct', async () => {
      const newEmail = 'new-address@test.local';
      const res = await requestEmailChange(testToken, newEmail, TEST_PASSWORD).expect(200);

      expect(res.body).toEqual({ success: true, data: { pending_email: newEmail } });
    });

    it('rejects wrong current password with a distinct message, does not touch pending state', async () => {
      const res = await requestEmailChange(testToken, 'new-address@test.local', 'WrongPassword!').expect(400);
      expect(res.body.error).toBe('Current password is incorrect');

      const row = await testPool.query('SELECT pending_email FROM users WHERE user_id = $1', [testUserId]);
      expect(row.rows[0].pending_email).toBeNull();
    });

    it('rejects a request targeting the current email itself', async () => {
      const res = await requestEmailChange(testToken, testEmail, TEST_PASSWORD).expect(400);
      expect(res.body.error).toBe('Unable to change email to the address provided');
    });

    it('rejects a request targeting an email already registered to another account, with the SAME generic message as the same-email case (enumeration resistance)', async () => {
      const other = await registerAndLogin('email-change-other');

      const sameEmailRes = await requestEmailChange(testToken, testEmail, TEST_PASSWORD).expect(400);
      const conflictRes = await requestEmailChange(testToken, other.user.email, TEST_PASSWORD).expect(400);

      expect(conflictRes.body.error).toBe(sameEmailRes.body.error);
      expect(conflictRes.body.error).toBe('Unable to change email to the address provided');
    });

    it('rejects malformed email format (client input error, distinct from the enumeration-sensitive generic message)', async () => {
      const res = await requestEmailChange(testToken, 'not-an-email', TEST_PASSWORD).expect(400);
      expect(res.body.error).toBeTruthy();
    });

    it('stores pending_email and only the HASH of the token, never the raw token', async () => {
      let capturedToken = '';
      jest.spyOn(emailService, 'sendEmailChangeVerification').mockImplementation(async (_email: any, token: any) => {
        capturedToken = token;
        return true;
      });

      const newEmail = 'hash-check@test.local';
      await requestEmailChange(testToken, newEmail, TEST_PASSWORD).expect(200);

      const row = await testPool.query('SELECT pending_email, email_change_token_hash, email_change_expires FROM users WHERE user_id = $1', [
        testUserId,
      ]);
      expect(row.rows[0].pending_email).toBe(newEmail);
      expect(capturedToken).toBeTruthy();
      expect(row.rows[0].email_change_token_hash).not.toBe(capturedToken);
      expect(row.rows[0].email_change_token_hash).toHaveLength(64); // SHA-256 hex
      expect(new Date(row.rows[0].email_change_expires).getTime()).toBeGreaterThan(Date.now());
    });

    it('sends the verification token to the NEW email address, never the old one', async () => {
      const sendSpy = jest.spyOn(emailService, 'sendEmailChangeVerification').mockResolvedValue(true as any);

      const newEmail = 'goes-to-new@test.local';
      await requestEmailChange(testToken, newEmail, TEST_PASSWORD).expect(200);

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy.mock.calls[0][0]).toBe(newEmail);
      expect(sendSpy.mock.calls[0][0]).not.toBe(testEmail);
    });

    it('sends an in-app security notification to the OLD account at request time (not asserted via email send)', async () => {
      await requestEmailChange(testToken, 'notify-check@test.local', TEST_PASSWORD).expect(200);

      const notifRes = await request(app).get('/api/notifications?limit=10').set(authHeader(testToken)).expect(200);
      const notif = notifRes.body.data.notifications.find((n: any) => n.category === 'email_change_requested');
      expect(notif).toBeTruthy();
      expect(notif.title).toBe('Email Change Requested');
    });

    it('does not fail the request even if the email_change notification preference is disabled', async () => {
      await request(app)
        .put('/api/notifications/preferences')
        .set(authHeader(testToken))
        .send({ email_change: false })
        .expect(200);

      const res = await requestEmailChange(testToken, 'prefs-off@test.local', TEST_PASSWORD).expect(200);
      expect(res.body.data.pending_email).toBe('prefs-off@test.local');

      const notifRes = await request(app).get('/api/notifications?limit=10').set(authHeader(testToken)).expect(200);
      expect(notifRes.body.data.notifications.find((n: any) => n.category === 'email_change_requested')).toBeUndefined();
    });

    it('rejects an unauthenticated request', async () => {
      await request(app).post('/api/users/me/request-email-change').send({ new_email: 'x@test.local', current_password: TEST_PASSWORD }).expect(401);
    });

    it('a second request invalidates the first request\'s token', async () => {
      const tokens: string[] = [];
      jest.spyOn(emailService, 'sendEmailChangeVerification').mockImplementation(async (_email: any, token: any) => {
        tokens.push(token);
        return true;
      });

      await requestEmailChange(testToken, 'first-target@test.local', TEST_PASSWORD).expect(200);
      await requestEmailChange(testToken, 'second-target@test.local', TEST_PASSWORD).expect(200);

      expect(tokens).toHaveLength(2);
      await verifyEmailChange(tokens[0]).expect(400); // superseded
      await verifyEmailChange(tokens[1]).expect(200); // newest wins

      const row = await testPool.query('SELECT email FROM users WHERE user_id = $1', [testUserId]);
      expect(row.rows[0].email).toBe('second-target@test.local');
    });

    it('concurrent/rapid double-submission leaves a single, well-defined final pending state (no corruption, no unhandled exception)', async () => {
      const results = await Promise.all([
        requestEmailChange(testToken, 'race-a@test.local', TEST_PASSWORD),
        requestEmailChange(testToken, 'race-b@test.local', TEST_PASSWORD),
      ]);
      for (const res of results) {
        expect(res.status).toBe(200);
      }

      const row = await testPool.query('SELECT pending_email, email_change_token_hash FROM users WHERE user_id = $1', [testUserId]);
      expect(['race-a@test.local', 'race-b@test.local']).toContain(row.rows[0].pending_email);
      expect(row.rows[0].email_change_token_hash).toHaveLength(64);
    });

    describe('rate limiting: 3 attempts per hour per user', () => {
      it('rejects the 4th request-email-change attempt with 429', async () => {
        for (let i = 0; i < 3; i++) {
          await requestEmailChange(testToken, `target${i}@test.local`, TEST_PASSWORD).expect(200);
        }
        const res = await requestEmailChange(testToken, 'target4@test.local', TEST_PASSWORD).expect(429);
        expect(res.body.error).toBeTruthy();
      });

      it('gives two different users independent rate-limit buckets (not shared)', async () => {
        const other = await registerAndLogin('email-change-bucket');

        for (let i = 0; i < 3; i++) {
          await requestEmailChange(testToken, `busy${i}@test.local`, TEST_PASSWORD).expect(200);
        }
        // testUser is now rate-limited, but a completely different user must not be.
        await requestEmailChange(testToken, 'busy-overflow@test.local', TEST_PASSWORD).expect(429);
        await requestEmailChange(other.token, 'other-user-target@test.local', TEST_PASSWORD).expect(200);
      });
    });
  });

  describe('resend-email-change-verification', () => {
    it('rejects when there is no pending email change', async () => {
      const res = await resendEmailChange(testToken).expect(400);
      expect(res.body.error).toBe('No pending email change to resend');
    });

    it('rejects an unauthenticated request', async () => {
      await request(app).post('/api/users/me/resend-email-change-verification').expect(401);
    });

    it('resend targets the SAME pending email and invalidates the previous token', async () => {
      const tokens: string[] = [];
      jest.spyOn(emailService, 'sendEmailChangeVerification').mockImplementation(async (_email: any, token: any) => {
        tokens.push(token);
        return true;
      });

      const newEmail = 'resend-target@test.local';
      await requestEmailChange(testToken, newEmail, TEST_PASSWORD).expect(200);
      const resendRes = await resendEmailChange(testToken).expect(200);

      expect(resendRes.body.data.pending_email).toBe(newEmail);
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).not.toBe(tokens[1]);

      await verifyEmailChange(tokens[0]).expect(400); // old token invalidated by resend
      await verifyEmailChange(tokens[1]).expect(200); // fresh token works
    });

    describe('rate limiting: 5 attempts per hour per user', () => {
      it('rejects the 6th resend attempt with 429', async () => {
        await requestEmailChange(testToken, 'resend-limit@test.local', TEST_PASSWORD).expect(200);
        for (let i = 0; i < 5; i++) {
          await resendEmailChange(testToken).expect(200);
        }
        await resendEmailChange(testToken).expect(429);
      });
    });
  });

  describe('verify-email-change', () => {
    it('does not require authentication', async () => {
      let capturedToken = '';
      jest.spyOn(emailService, 'sendEmailChangeVerification').mockImplementation(async (_email: any, token: any) => {
        capturedToken = token;
        return true;
      });
      await requestEmailChange(testToken, 'no-auth-needed@test.local', TEST_PASSWORD).expect(200);

      // No Authorization header at all.
      const res = await request(app).post('/api/auth/verify-email-change').send({ token: capturedToken }).expect(200);
      expect(res.body).toMatchObject({ success: true, data: { email: 'no-auth-needed@test.local' } });
    });

    it('rejects an invalid/nonexistent token with a generic message', async () => {
      const res = await verifyEmailChange('not-a-real-token').expect(400);
      expect(res.body.error).toBe('Invalid or expired verification token');
    });

    it('rejects an expired token with the IDENTICAL generic message as an invalid one', async () => {
      let capturedToken = '';
      jest.spyOn(emailService, 'sendEmailChangeVerification').mockImplementation(async (_email: any, token: any) => {
        capturedToken = token;
        return true;
      });
      await requestEmailChange(testToken, 'expired-target@test.local', TEST_PASSWORD).expect(200);

      await testPool.query("UPDATE users SET email_change_expires = NOW() - INTERVAL '1 hour' WHERE user_id = $1", [testUserId]);

      const invalidRes = await verifyEmailChange('not-a-real-token').expect(400);
      const expiredRes = await verifyEmailChange(capturedToken).expect(400);
      expect(expiredRes.body.error).toBe(invalidRes.body.error);
    });

    it('rejects a replayed (already-consumed) token with the identical generic message', async () => {
      let capturedToken = '';
      jest.spyOn(emailService, 'sendEmailChangeVerification').mockImplementation(async (_email: any, token: any) => {
        capturedToken = token;
        return true;
      });
      await requestEmailChange(testToken, 'replay-target@test.local', TEST_PASSWORD).expect(200);

      await verifyEmailChange(capturedToken).expect(200);
      const replayRes = await verifyEmailChange(capturedToken).expect(400);
      const invalidRes = await verifyEmailChange('some-other-bogus-token').expect(400);
      expect(replayRes.body.error).toBe(invalidRes.body.error);
      expect(replayRes.body.error).toBe('Invalid or expired verification token');
    });

    describe('on successful verification', () => {
      const NEW_EMAIL = 'verified-success@test.local';

      const doFullFlow = async () => {
        let capturedToken = '';
        jest.spyOn(emailService, 'sendEmailChangeVerification').mockImplementation(async (_email: any, token: any) => {
          capturedToken = token;
          return true;
        });
        await requestEmailChange(testToken, NEW_EMAIL, TEST_PASSWORD).expect(200);
        const verifyRes = await verifyEmailChange(capturedToken).expect(200);
        return verifyRes;
      };

      it('changes the authoritative email, clears pending fields, sets email_changed_at', async () => {
        await doFullFlow();

        const row = await testPool.query(
          'SELECT email, pending_email, email_change_token_hash, email_change_expires, email_changed_at FROM users WHERE user_id = $1',
          [testUserId]
        );
        expect(row.rows[0].email).toBe(NEW_EMAIL);
        expect(row.rows[0].pending_email).toBeNull();
        expect(row.rows[0].email_change_token_hash).toBeNull();
        expect(row.rows[0].email_change_expires).toBeNull();
        expect(row.rows[0].email_changed_at).not.toBeNull();
      });

      it('does not change is_verified', async () => {
        const before = await testPool.query('SELECT is_verified FROM users WHERE user_id = $1', [testUserId]);
        await doFullFlow();
        const after = await testPool.query('SELECT is_verified FROM users WHERE user_id = $1', [testUserId]);
        expect(after.rows[0].is_verified).toBe(before.rows[0].is_verified);
      });

      it('revokes all refresh tokens for the account', async () => {
        await doFullFlow();
        const rows = await testPool.query('SELECT revoked_at FROM refresh_tokens WHERE user_id = $1', [testUserId]);
        expect(rows.rows.length).toBeGreaterThan(0);
        for (const r of rows.rows) {
          expect(r.revoked_at).not.toBeNull();
        }
      });

      it('the old login email no longer works; the new login email works', async () => {
        await doFullFlow();

        await login(testEmail, TEST_PASSWORD).expect(401);
        await login(NEW_EMAIL, TEST_PASSWORD).expect(200);
      });

      it('the old access/legacy token can no longer authenticate after completion', async () => {
        await doFullFlow();

        const res = await request(app).get('/api/users/me').set(authHeader(testToken)).expect(401);
        expect(res.body.error).toBe('Invalid token');
      });

      it('a fresh token from re-login after completion authenticates successfully', async () => {
        await doFullFlow();

        const freshToken = await reloginWith(NEW_EMAIL, TEST_PASSWORD);
        const res = await request(app).get('/api/users/me').set(authHeader(freshToken)).expect(200);
        expect(res.body.data.email).toBe(NEW_EMAIL);
      });

      it('sends an in-app completion notification', async () => {
        await doFullFlow();
        const freshToken = await reloginWith(NEW_EMAIL, TEST_PASSWORD);

        const notifRes = await request(app).get('/api/notifications?limit=10').set(authHeader(freshToken)).expect(200);
        const notif = notifRes.body.data.notifications.find((n: any) => n.category === 'email_change_completed');
        expect(notif).toBeTruthy();
        expect(notif.title).toBe('Email Changed');
      });

      it('response contains no password hash, token hash, or raw token leakage', async () => {
        const verifyRes = await doFullFlow();
        const serialized = JSON.stringify(verifyRes.body);
        expect(serialized).not.toMatch(/password_hash/i);
        expect(serialized).not.toMatch(/token_hash/i);
        expect(verifyRes.body.data).toEqual({ email: NEW_EMAIL });
      });

      it('response envelope matches the established { success, data } convention', async () => {
        const verifyRes = await doFullFlow();
        expect(verifyRes.body.success).toBe(true);
        expect(verifyRes.body).toHaveProperty('data');
      });
    });

    describe('rate limiting: IP-based', () => {
      it('does not share a bucket with the per-user request-change limiter (independent limiter families)', async () => {
        // Exhaust the per-user request-change limiter...
        for (let i = 0; i < 3; i++) {
          await requestEmailChange(testToken, `ip-check${i}@test.local`, TEST_PASSWORD).expect(200);
        }
        await requestEmailChange(testToken, 'ip-check-overflow@test.local', TEST_PASSWORD).expect(429);

        // ...verify-email-change must still be reachable (its own, separate, much higher IP ceiling).
        const res = await verifyEmailChange('irrelevant-token').expect(400);
        expect(res.body.error).toBe('Invalid or expired verification token');
      });
    });
  });

  describe('authorization: only ever operates on req.user.userId', () => {
    it('a caller can only request a change for their own account, never via a client-supplied id', async () => {
      // There is no user-id field accepted anywhere in the request body --
      // the endpoint reads exclusively from req.user.userId (the JWT).
      // Confirmed structurally: sending an extra field is simply ignored.
      const other = await registerAndLogin('email-change-authz');
      const res = await request(app)
        .post('/api/users/me/request-email-change')
        .set(authHeader(testToken))
        .send({ new_email: 'authz-target@test.local', current_password: TEST_PASSWORD, userId: other.userId, user_id: other.userId })
        .expect(200);
      expect(res.body.data.pending_email).toBe('authz-target@test.local');

      const row = await testPool.query('SELECT pending_email FROM users WHERE user_id = $1', [testUserId]);
      expect(row.rows[0].pending_email).toBe('authz-target@test.local');
      const otherRow = await testPool.query('SELECT pending_email FROM users WHERE user_id = $1', [other.userId]);
      expect(otherRow.rows[0].pending_email).toBeNull();
    });
  });
});
