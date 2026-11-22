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

describe('POST /api/logs -- multiple entries per day', () => {
  it('allows multiple sequential submissions on the same day', async () => {
    const { token } = await registerAndLogin('log_multi_seq');

    const first = await request(app)
      .post('/api/logs')
      .set(authHeader(token))
      .send({
        entryText: 'First entry of the day, over ten characters.',
      })
      .expect(201);

    const second = await request(app)
      .post('/api/logs')
      .set(authHeader(token))
      .send({
        entryText: 'Second entry of the same day.',
      })
      .expect(201);

    expect(first.body.success).toBe(true);
    expect(second.body.success).toBe(true);
    expect(first.body.data.log.log_id).not.toBe(second.body.data.log.log_id);
  });

  it('allows concurrent submissions on the same day', async () => {
    const { token } = await registerAndLogin('log_multi_race');

    const [first, second] = await Promise.all([
      request(app)
        .post('/api/logs')
        .set(authHeader(token))
        .send({
          entryText: 'Concurrent entry number one.',
        }),

      request(app)
        .post('/api/logs')
        .set(authHeader(token))
        .send({
          entryText: 'Concurrent entry number two.',
        }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const rows = await pgPool.query(
      `SELECT COUNT(*) AS count
       FROM daily_logs
       WHERE user_id = (
         SELECT user_id
         FROM users
         WHERE username LIKE 'log_multi_race%'
       )
       AND log_date = CURRENT_DATE`
    );

    expect(Number(rows.rows[0].count)).toBe(2);
  });
});
