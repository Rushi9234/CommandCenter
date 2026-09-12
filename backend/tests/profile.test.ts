import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { closeTestPool, resetDatabase } from './utils/db';
import { registerAndLogin, authHeader } from './utils/fixtures';

let testToken: string;
let testUserId: string;
let testEmail: string;
let testUsername: string;
let testFullName: string;

beforeEach(async () => {
  await resetDatabase();

  // Register and login a test user. fixtures.ts's buildUser() appends a
  // unique timestamp+counter suffix to email/username (never a fixed
  // 'profile@example.com'/'profileuser') so tests can run repeatedly
  // without colliding -- capture the actual generated values instead of
  // hardcoding the pre-suffix literals a stale version of this file used to
  // assume.
  const result = await registerAndLogin('profile');
  testUserId = result.userId;
  testToken = result.token;
  testEmail = result.user.email;
  testUsername = result.user.username;
  testFullName = result.user.fullName;
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('Profile API', () => {
  describe('GET /api/users/me', () => {
    it('returns authenticated user profile with all fields', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set(authHeader(testToken));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('user_id', testUserId);
      expect(res.body.data).toHaveProperty('email', testEmail);
      expect(res.body.data).toHaveProperty('username', testUsername);
      expect(res.body.data).toHaveProperty('full_name', testFullName);
      expect(res.body.data).toHaveProperty('role');
      expect(res.body.data).toHaveProperty('is_profile_public');
      expect(res.body.data).toHaveProperty('bio');
      expect(res.body.data).toHaveProperty('pronouns');
      expect(res.body.data).toHaveProperty('location');
    });

    it('rejects unauthenticated request', async () => {
      const res = await request(app)
        .get('/api/users/me');

      expect(res.status).toBe(401);
    });

    it('does not return password hash', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set(authHeader(testToken));

      expect(res.status).toBe(200);
      expect(res.body.data).not.toHaveProperty('password_hash');
    });
  });

  describe('PUT /api/users/me/profile', () => {
    it('updates profile with new values', async () => {
      const res = await request(app)
        .put('/api/users/me/profile')
        .set(authHeader(testToken))
        .send({
          full_name: 'Updated Name',
          bio: 'My bio',
          pronouns: 'they/them',
          location: 'San Francisco',
          is_profile_public: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('full_name', 'Updated Name');
      expect(res.body.data).toHaveProperty('bio', 'My bio');
      expect(res.body.data).toHaveProperty('pronouns', 'they/them');
      expect(res.body.data).toHaveProperty('location', 'San Francisco');
      expect(res.body.data).toHaveProperty('is_profile_public', true);
    });

    it('updates partial profile fields', async () => {
      const res = await request(app)
        .put('/api/users/me/profile')
        .set(authHeader(testToken))
        .send({
          bio: 'Updated bio only',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('bio', 'Updated bio only');
      // Other fields should remain unchanged -- this test only sends `bio`,
      // so full_name stays whatever registration set it to (previously
      // asserted 'Updated Name', a value only ever set by a *different*
      // test's own PUT, which cannot carry over since beforeEach resets the
      // database before every test).
      expect(res.body.data).toHaveProperty('full_name', testFullName);
    });

    it('clears fields when set to empty string or null', async () => {
      const res = await request(app)
        .put('/api/users/me/profile')
        .set(authHeader(testToken))
        .send({
          bio: '',
          pronouns: null,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.bio).toBeFalsy();
      expect(res.body.data.pronouns).toBeFalsy();
    });

    it('validates full_name length', async () => {
      const res = await request(app)
        .put('/api/users/me/profile')
        .set(authHeader(testToken))
        .send({
          full_name: 'x'.repeat(256),
        });

      expect(res.status).toBe(400);
    });

    it('validates bio length', async () => {
      const res = await request(app)
        .put('/api/users/me/profile')
        .set(authHeader(testToken))
        .send({
          bio: 'x'.repeat(501),
        });

      expect(res.status).toBe(400);
    });

    it('validates pronouns length', async () => {
      const res = await request(app)
        .put('/api/users/me/profile')
        .set(authHeader(testToken))
        .send({
          pronouns: 'x'.repeat(51),
        });

      expect(res.status).toBe(400);
    });

    it('validates location length', async () => {
      const res = await request(app)
        .put('/api/users/me/profile')
        .set(authHeader(testToken))
        .send({
          location: 'x'.repeat(101),
        });

      expect(res.status).toBe(400);
    });

    it('rejects unauthenticated request', async () => {
      const res = await request(app)
        .put('/api/users/me/profile')
        .send({
          full_name: 'Hacker',
        });

      expect(res.status).toBe(401);
    });

    it('ignores unknown fields', async () => {
      const res = await request(app)
        .put('/api/users/me/profile')
        .set(authHeader(testToken))
        .send({
          full_name: 'New Name',
          password: 'hacked', // This should be ignored
          email: 'hacked@example.com', // This should be ignored
          user_id: 'different-id', // This should be ignored
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('full_name', 'New Name');
      expect(res.body.data).toHaveProperty('email', testEmail); // Unchanged
      expect(res.body.data).toHaveProperty('user_id', testUserId); // Unchanged
    });

    it('preserves username immutability', async () => {
      const res = await request(app)
        .put('/api/users/me/profile')
        .set(authHeader(testToken))
        .send({
          username: 'newusername',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('username', testUsername); // Should be unchanged
    });

    it('does not expose password hash in response', async () => {
      const res = await request(app)
        .put('/api/users/me/profile')
        .set(authHeader(testToken))
        .send({
          full_name: 'Test Name',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).not.toHaveProperty('password_hash');
    });

    it('persists profile visibility flag', async () => {
      const res1 = await request(app)
        .put('/api/users/me/profile')
        .set(authHeader(testToken))
        .send({
          is_profile_public: false,
        });

      expect(res1.status).toBe(200);
      expect(res1.body.data).toHaveProperty('is_profile_public', false);

      const res2 = await request(app)
        .get('/api/users/me')
        .set(authHeader(testToken));

      expect(res2.status).toBe(200);
      expect(res2.body.data).toHaveProperty('is_profile_public', false);
    });
  });

  describe('Authorization', () => {
    it('user can only modify their own profile via /me endpoint', async () => {
      // PUT /me/profile always modifies the authenticated user's profile
      // so this endpoint inherently cannot be used to modify others
      const res = await request(app)
        .put('/api/users/me/profile')
        .set(authHeader(testToken))
        .send({
          full_name: 'Modified Name',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('full_name', 'Modified Name');
    });
  });
});
