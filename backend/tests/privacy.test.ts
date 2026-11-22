import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, registerAndLogin } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const getSettings = (token: string) => request(app).get('/api/privacy/settings').set(authHeader(token));

const putSettings = (token: string, body: Record<string, any>) =>
  request(app).put('/api/privacy/settings').set(authHeader(token)).send(body);

describe('PUT /api/privacy/settings -- Milestone 28: changes must actually persist', () => {
  it('persists a single flag change across a subsequent GET (not just the PUT response)', async () => {
    const user = await registerAndLogin('m28_single_flag');

    const putRes = await putSettings(user.token, { leaderboard_visible: false }).expect(200);
    expect(putRes.body.data.leaderboard_visible).toBe(false);

    const getRes = await getSettings(user.token).expect(200);
    expect(getRes.body.data.leaderboard_visible).toBe(false);
  });

  it('persists each of the four privacy flags independently', async () => {
    const user = await registerAndLogin('m28_all_flags');

    const flags = ['ai_enabled', 'sentiment_tracking', 'leaderboard_visible', 'analytics_opt_in'];
    for (const flag of flags) {
      await putSettings(user.token, { [flag]: false }).expect(200);
      const res = await getSettings(user.token).expect(200);
      expect(res.body.data[flag]).toBe(false);
    }
  });

  it('merges partial updates -- an omitted flag keeps its previous persisted value, not the default', async () => {
    const user = await registerAndLogin('m28_merge');

    await putSettings(user.token, { ai_enabled: false }).expect(200);
    // Second call only touches a different flag -- ai_enabled must still be false, not reset to true.
    await putSettings(user.token, { analytics_opt_in: false }).expect(200);

    const res = await getSettings(user.token).expect(200);
    expect(res.body.data.ai_enabled).toBe(false);
    expect(res.body.data.analytics_opt_in).toBe(false);
    // Untouched flags remain at their default.
    expect(res.body.data.sentiment_tracking).toBe(true);
    expect(res.body.data.leaderboard_visible).toBe(true);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app).put('/api/privacy/settings').send({ ai_enabled: false }).expect(401);
    await request(app).get('/api/privacy/settings').expect(401);
  });

  it('does not affect another user\'s settings', async () => {
    const userA = await registerAndLogin('m28_isolation_a');
    const userB = await registerAndLogin('m28_isolation_b');

    await putSettings(userA.token, { leaderboard_visible: false, ai_enabled: false }).expect(200);

    const resB = await getSettings(userB.token).expect(200);
    expect(resB.body.data.leaderboard_visible).toBe(true);
    expect(resB.body.data.ai_enabled).toBe(true);
  });
});
