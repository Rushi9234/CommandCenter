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

describe('POST /api/logs -- one log per user per day (Milestone 24)', () => {
  it('rejects a second sequential submission on the same day with the existing message', async () => {
    const { token } = await registerAndLogin('logdup_seq');

    await request(app).post('/api/logs').set(authHeader(token)).send({ entryText: 'First entry of the day, over ten characters.' }).expect(201);

    const second = await request(app)
      .post('/api/logs')
      .set(authHeader(token))
      .send({ entryText: 'Second entry attempt, also over ten characters.' });

    expect(second.status).toBe(400);
    expect(second.body.error).toBe('Log already submitted for today');
  });

  it('resolves two concurrent submissions as exactly one 201 and one 400 with the existing message', async () => {
    const { token } = await registerAndLogin('logdup_race');

    const [first, second] = await Promise.all([
      request(app).post('/api/logs').set(authHeader(token)).send({ entryText: 'Racing entry attempt number one here.' }),
      request(app).post('/api/logs').set(authHeader(token)).send({ entryText: 'Racing entry attempt number two here.' }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 400]);

    const failed = first.status === 400 ? first : second;
    expect(failed.body.error).toBe('Log already submitted for today');

    // Confirm the database itself only ever held one row for the day --
    // the constraint, not luck, is what decided the outcome.
    const rows = await pgPool.query(
      "SELECT COUNT(*) AS count FROM daily_logs WHERE user_id = (SELECT user_id FROM users WHERE username LIKE 'logdup_race%') AND log_date = CURRENT_DATE"
    );
    expect(Number(rows.rows[0].count)).toBe(1);
  });
});
