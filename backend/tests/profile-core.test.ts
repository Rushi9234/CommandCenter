import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { closeTestPool, resetDatabase } from './utils/db';
import { registerAndLogin, authHeader } from './utils/fixtures';

let testToken: string;
let testUserId: string;

beforeEach(async () => {
  await resetDatabase();

  // Register and login a test user
  const result = await registerAndLogin('profile');
  testUserId = result.userId;
  testToken = result.token;
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('Profile API (Core Tests)', () => {
  it('GET /api/users/me returns authenticated user profile', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set(authHeader(testToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('user_id', testUserId);
    expect(res.body.data).toHaveProperty('email');
    expect(res.body.data).toHaveProperty('username');
    expect(res.body.data).toHaveProperty('full_name');
    expect(res.body.data).toHaveProperty('is_profile_public');
    expect(res.body.data).not.toHaveProperty('password_hash');
  });

  it('PUT /api/users/me/profile updates profile fields', async () => {
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

  it('GET /api/users/me returns updated profile after save', async () => {
    // Update the profile
    await request(app)
      .put('/api/users/me/profile')
      .set(authHeader(testToken))
      .send({
        bio: 'My new bio',
      });

    // Fetch it again
    const res = await request(app)
      .get('/api/users/me')
      .set(authHeader(testToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('bio', 'My new bio');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/users/me');

    expect(res.status).toBe(401);
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
});
