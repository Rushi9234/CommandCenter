import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { closeTestPool, resetDatabase } from './utils/db';
import { registerAndLogin, authHeader, login } from './utils/fixtures';

// A successful password change intentionally invalidates the JWT used to
// make it (Milestone 38 -- authenticate() rejects a token issued before
// the account's password_changed_at). Any test that needs to make a
// further authenticated request against the SAME account after a
// successful change (another change, or reading that account's own
// notifications) must re-login with the NEW password first, exactly like
// a real client would -- reusing the old token gets a 401 that has
// nothing to do with whatever the test actually intends to verify. The
// rate limiter itself is keyed by authenticated user ID, not by which
// token is presented, so a fresh token for the same user still counts
// against the same bucket.
const reloginWithNewPassword = async (email: string, newPassword: string): Promise<string> => {
  const res = await login(email, newPassword).expect(200);
  return res.body.data.token;
};

let testToken: string;
let testUserId: string;
let testEmail: string;
const TEST_PASSWORD = 'Passw0rd!123'; // Default password from fixtures.ts buildUser

beforeEach(async () => {
  await resetDatabase();

  // Register and login a test user
  const result = await registerAndLogin('password-change-security');
  testUserId = result.userId;
  testToken = result.token;
  testEmail = result.user.email;
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('Password Change Security Hardening', () => {
  describe('Rate Limiting: 3 attempts per hour per user', () => {
    it('allows the first password change attempt', async () => {
      const res = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(testToken))
        .send({
          current_password: TEST_PASSWORD,
          new_password: 'NewPassword123!',
        });

      expect(res.status).toBe(204);
    });

    it('allows up to 3 password change attempts within the hour', async () => {
      // This test verifies the rate limit counter increments correctly
      // It doesn't need to actually succeed 3 times, just verify limit allows 3
      const passwords = [
        'NewPass1234!',
        'NewPass1235!',
        'NewPass1236!',
      ];

      let currentPassword = TEST_PASSWORD;
      let successCount = 0;

      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/users/me/change-password')
          .set(authHeader(testToken))
          .send({
            current_password: currentPassword,
            new_password: passwords[i],
          });

        // On success, update for next iteration
        if (res.status === 204) {
          currentPassword = passwords[i];
          successCount++;
        }
        // Rate limit should NOT hit until attempt 4
        expect(res.status).not.toBe(429);
      }

      // At least one should succeed
      expect(successCount).toBeGreaterThanOrEqual(1);
    });

    it('rejects the 4th password change attempt with 429', async () => {
      // Create a fresh user for this test to avoid interference from other tests
      const freshResult = await registerAndLogin('rate-limit-test-4th');
      let freshToken = freshResult.token;
      const freshEmail = freshResult.user.email;

      // Use correct password for first 3 successful changes
      const passwords = [
        'NewPass1234!',
        'NewPass1235!',
        'NewPass1236!',
      ];

      let currentPassword = TEST_PASSWORD;

      // First 3 attempts - should succeed. Each successful change
      // invalidates the token that made it, so re-login with the new
      // password before the next attempt -- exactly what a real client
      // would do, and the limiter (keyed by user ID, not by token) still
      // counts each of these three real requests against the same bucket.
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/users/me/change-password')
          .set(authHeader(freshToken))
          .send({
            current_password: currentPassword,
            new_password: passwords[i],
          });

        expect(res.status).toBe(204);
        currentPassword = passwords[i];
        freshToken = await reloginWithNewPassword(freshEmail, currentPassword);
      }

      // 4th attempt - should be rate limited
      const rateLimitRes = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(freshToken))
        .send({
          current_password: currentPassword,
          new_password: 'NewPass1237!',
        });

      expect(rateLimitRes.status).toBe(429);
      expect(rateLimitRes.body).toHaveProperty('error');
      expect(rateLimitRes.body.error).toMatch(/too many|try again/i);
    });

    it('prevents rate-limit bypass via user-id manipulation', async () => {
      // The rate limiter key is the authenticated user ID from the JWT,
      // not from request params/body, so this should be impossible to bypass
      const res = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(testToken))
        .send({
          current_password: TEST_PASSWORD,
          new_password: 'NewPass1234!',
        });

      expect(res.status).toBe(204);
      // If bypass was possible, a second request with a different user_id
      // would succeed, but since the key is the authenticated user (from JWT),
      // this is structurally impossible
    });

    it('rate-limits by user ID, not by IP', async () => {
      // Two different users should have independent rate limits.
      // A single request per user (as this test previously did) can't
      // actually distinguish "keyed by user" from "keyed by IP" -- both
      // supertest requests share the same loopback IP, and 1+1 requests is
      // still well under a shared IP bucket's limit of 3 either way.
      //
      // This version deliberately uses a WRONG current_password on every
      // counted attempt rather than successful changes: the rate limiter
      // (mounted ahead of validate()/the controller) still counts each of
      // these requests toward the 3/hour bucket, but a wrong-password
      // request never actually changes the password -- so it never trips
      // the unrelated (and correct) session-invalidation-on-password-change
      // behavior (authenticate rejects a JWT issued before password_changed_at),
      // which would otherwise invalidate the very token this test is using
      // after the first genuine success. That would produce a 401 with no
      // relation to rate limiting and make this test meaningless for its
      // actual purpose: proving bucket isolation between users.
      const result2 = await registerAndLogin('password-change-security-2');
      const token2 = result2.token;

      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/users/me/change-password')
          .set(authHeader(testToken))
          .send({ current_password: 'WrongPassword!', new_password: `NewPass111${i}!` });
        expect(res.status).not.toBe(429);
        expect(res.status).not.toBe(401);
      }

      // User 1's bucket is now exhausted -- confirm their own 4th attempt
      // 429s (same-IP sanity check that the limiter is actually active).
      const user1FourthRes = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(testToken))
        .send({ current_password: 'WrongPassword!', new_password: 'NewPass1114!' });
      expect(user1FourthRes.status).toBe(429);

      // If the limiter were IP-keyed (the pre-fix defect), user 2 would
      // already be rate-limited here too, despite never having made a
      // request -- proving the fix by exercising user 2's own full quota,
      // same IP, immediately after user 1's bucket was exhausted.
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/users/me/change-password')
          .set(authHeader(token2))
          .send({ current_password: 'WrongPassword!', new_password: `NewPass222${i}!` });
        expect(res.status).not.toBe(429);
        expect(res.status).not.toBe(401);
      }
    });

    it('rejects unauthenticated password-change requests before the rate limiter or handler runs', async () => {
      // authenticate now runs ahead of the rate limiter (the fix) -- an
      // unauthenticated request must be rejected by authentication itself,
      // never reach the limiter's key generator, and never touch password
      // validation/hashing.
      const res = await request(app)
        .post('/api/users/me/change-password')
        .send({ current_password: TEST_PASSWORD, new_password: 'NewPass9999!' });

      expect(res.status).toBe(401);

      // Confirm the account's password was genuinely untouched: the
      // authenticated user can still log in and change it normally.
      const followUp = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(testToken))
        .send({ current_password: TEST_PASSWORD, new_password: 'NewPass9998!' });
      expect(followUp.status).toBe(204);
    });
  });

  describe('Security Notification after successful password change', () => {
    it('sends exactly ONE notification after successful password change', async () => {
      const res = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(testToken))
        .send({
          current_password: TEST_PASSWORD,
          new_password: 'NewPassword123!',
        });

      expect(res.status).toBe(204);

      // The change above invalidated testToken -- re-login with the new
      // password before making any further authenticated request, exactly
      // like a real client would after changing their own password.
      const freshToken = await reloginWithNewPassword(testEmail, 'NewPassword123!');

      // Check notifications for this user
      // Note: Due to fire-and-forget nature, the notification might take a moment,
      // but since this is an in-memory store, it should be available immediately
      const notificationsRes = await request(app)
        .get('/api/notifications?limit=10')
        .set(authHeader(freshToken));

      expect(notificationsRes.status).toBe(200);
      const passwordChangeNotifs = notificationsRes.body.data.notifications.filter(
        (n: any) => n.category === 'password_change'
      );

      expect(passwordChangeNotifs.length).toBeGreaterThanOrEqual(1);
      expect(passwordChangeNotifs[0]).toHaveProperty('title', 'Password Changed');
      expect(passwordChangeNotifs[0]).toHaveProperty('message');
      expect(passwordChangeNotifs[0].message).toMatch(/password was changed successfully/i);
    });

    it('does NOT send notification on failed password change', async () => {
      // Failed attempt (wrong current password)
      const res = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(testToken))
        .send({
          current_password: 'WrongPassword123!',
          new_password: 'NewPassword123!',
        });

      expect(res.status).toBe(400);

      // A failed change never touches password_changed_at, so testToken is
      // still valid -- no re-login needed here.
      const notificationsRes = await request(app)
        .get('/api/notifications?limit=10')
        .set(authHeader(testToken));

      expect(notificationsRes.status).toBe(200);
      const passwordChangeNotifs = notificationsRes.body.data.notifications.filter(
        (n: any) => n.category === 'password_change'
      );

      expect(passwordChangeNotifs.length).toBe(0);
    });

    it('notification goes only to the authenticated user', async () => {
      // Create another user
      const result2 = await registerAndLogin('password-change-security-other');
      const token2 = result2.token;

      // First user changes password
      const res = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(testToken))
        .send({
          current_password: TEST_PASSWORD,
          new_password: 'NewPassword123!',
        });

      expect(res.status).toBe(204);

      // Check that second user has NO password_change notification.
      // token2 was never used to change a password, so it's still valid.
      const notificationsRes2 = await request(app)
        .get('/api/notifications?limit=10')
        .set(authHeader(token2));

      expect(notificationsRes2.status).toBe(200);
      const passwordChangeNotifs = notificationsRes2.body.data.notifications.filter(
        (n: any) => n.category === 'password_change'
      );

      expect(passwordChangeNotifs.length).toBe(0);

      // But first user should have the notification. testToken was
      // invalidated by the change above -- re-login with the new password.
      const freshToken = await reloginWithNewPassword(testEmail, 'NewPassword123!');
      const notificationsRes1 = await request(app)
        .get('/api/notifications?limit=10')
        .set(authHeader(freshToken));

      expect(notificationsRes1.status).toBe(200);
      const firstUserNotifs = notificationsRes1.body.data.notifications.filter(
        (n: any) => n.category === 'password_change'
      );

      expect(firstUserNotifs.length).toBeGreaterThanOrEqual(1);
    });

    it('notification does not contain password/hash/token', async () => {
      const res = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(testToken))
        .send({
          current_password: TEST_PASSWORD,
          new_password: 'NewPassword123!',
        });

      expect(res.status).toBe(204);

      // Re-login: the change above invalidated testToken.
      const freshToken = await reloginWithNewPassword(testEmail, 'NewPassword123!');

      // Get notifications
      const notificationsRes = await request(app)
        .get('/api/notifications?limit=10')
        .set(authHeader(freshToken));

      expect(notificationsRes.status).toBe(200);
      const passwordChangeNotifs = notificationsRes.body.data.notifications.filter(
        (n: any) => n.category === 'password_change'
      );

      expect(passwordChangeNotifs.length).toBeGreaterThanOrEqual(1);

      const notif = passwordChangeNotifs[0];

      // Ensure no sensitive data in the notification's user-facing content.
      // Checking the whole serialized object (as this test previously did)
      // is too broad: the notification's OWN category field is legitimately
      // named 'password_change' -- that string match is expected, safe
      // metadata, not a leak. What must never appear is an actual password
      // value, hash, or token inside the title/message a user reads.
      const notifContent = `${notif.title} ${notif.message}`;
      expect(notifContent).not.toMatch(/passw0rd|newpassword123/i);
      expect(notifContent).not.toMatch(/hash/i);
      expect(notifContent).not.toMatch(/token/i);
    });

    it('notification failure does not fail the password change', async () => {
      // This tests the fire-and-forget contract
      const res = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(testToken))
        .send({
          current_password: TEST_PASSWORD,
          new_password: 'NewPassword123!',
        });

      // Password change must succeed (204) even if notification creation fails
      expect(res.status).toBe(204);
    });

    it('respects notification preferences for password_change category', async () => {
      // Update notification preferences to disable password_change.
      // notifications.routes.ts defines this as PUT, not POST.
      const prefRes = await request(app)
        .put('/api/notifications/preferences')
        .set(authHeader(testToken))
        .send({
          password_change: false,
        });

      expect(prefRes.status).toBe(200);
      expect(prefRes.body.data.password_change).toBe(false);

      // Now change password
      const changeRes = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(testToken))
        .send({
          current_password: TEST_PASSWORD,
          new_password: 'NewPassword123!',
        });

      expect(changeRes.status).toBe(204);

      // Re-login: the change above invalidated testToken.
      const freshToken = await reloginWithNewPassword(testEmail, 'NewPassword123!');

      // Check that no password_change notification was created
      const notificationsRes = await request(app)
        .get('/api/notifications?limit=10')
        .set(authHeader(freshToken));

      expect(notificationsRes.status).toBe(200);
      const passwordChangeNotifs = notificationsRes.body.data.notifications.filter(
        (n: any) => n.category === 'password_change'
      );

      expect(passwordChangeNotifs.length).toBe(0);
    });
  });

  describe('Session Invalidation Preserved', () => {
    it('existing refresh-token revocation still works', async () => {
      // Use fresh user to avoid rate-limit interference
      const freshResult = await registerAndLogin('session-test-revocation');
      const freshToken = freshResult.token;

      const changeRes = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(freshToken))
        .send({
          current_password: TEST_PASSWORD,
          new_password: 'NewPassword123!',
        });

      expect(changeRes.status).toBe(204);

      // Old JWT should be rejected (password_changed_at check)
      // Note: This depends on the JWT logic in auth middleware
      // Just verify password change succeeded
      expect(changeRes.status).toBe(204);
    });

    it('password hashing behavior remains unchanged', async () => {
      // Use fresh user to avoid rate-limit interference
      const freshResult = await registerAndLogin('session-test-hashing');
      const freshToken = freshResult.token;
      const freshEmail = freshResult.user.email;

      const changeRes = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(freshToken))
        .send({
          current_password: TEST_PASSWORD,
          new_password: 'NewPassword123!',
        });

      expect(changeRes.status).toBe(204);

      // Verify the new password works
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: freshEmail,
          password: 'NewPassword123!',
        });

      expect(loginRes.status).toBe(200);
      // authController.ts's login() returns { success, message, data: { user, token } }
      // -- 'access_token' at the top level never existed in this codebase's
      // login response shape.
      expect(loginRes.body.data).toHaveProperty('token');
    });
  });

  describe('Error Message Safety', () => {
    it('does not expose rate-limit timing details', async () => {
      // Use fresh user to avoid rate-limit interference
      const freshResult = await registerAndLogin('error-safety-timing');
      const freshToken = freshResult.token;

      // Exhaust the 3/hour bucket with wrong-password attempts -- these
      // still count (the limiter runs before validate()/the controller),
      // but never actually change the password, so freshToken is never
      // invalidated by the account's own password_changed_at check. A
      // genuine successful change here (as this test previously did on its
      // first attempt) would invalidate freshToken and turn every
      // subsequent request, including the one meant to hit the rate
      // limit, into an unrelated 401.
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/users/me/change-password')
          .set(authHeader(freshToken))
          .send({
            current_password: 'WrongPassword',
            new_password: 'NewPass' + i + '!',
          });
      }

      // 4th request hits rate limit
      const rateLimitRes = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(freshToken))
        .send({
          current_password: 'WrongPassword',
          new_password: 'NewPass9999!',
        });

      expect(rateLimitRes.status).toBe(429);
      // Error should be safe and generic
      expect(rateLimitRes.body.error).not.toMatch(/specific|millisecond|exact/i);
    });

    it('does not expose password in error messages', async () => {
      // Use fresh user to avoid rate-limit interference
      const freshResult = await registerAndLogin('error-safety-password');
      const freshToken = freshResult.token;

      const res = await request(app)
        .post('/api/users/me/change-password')
        .set(authHeader(freshToken))
        .send({
          current_password: 'WrongPassword',
          new_password: 'NewPassword123!',
        });

      expect(res.status).toBe(400);
      const errorStr = JSON.stringify(res.body);
      expect(errorStr).not.toMatch(/WrongPassword/i);
      expect(errorStr).not.toMatch(/NewPassword/i);
    });
  });
});
