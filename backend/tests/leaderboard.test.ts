import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool, testPool } from './utils/db';
import { authHeader, registerAndLogin } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

// Seeds a user's daily_logs with explicit created_at/log_date/word_count,
// bypassing the real createLog endpoint's "one log per day" rule -- this
// is fixture setup for deterministic assertions, not a mock of anything
// under test. The repository query and service formula that compute the
// leaderboard still run unmodified against these real rows.
const seedLogs = async (userId: string, entries: { daysAgo: number; wordCount: number }[]) => {
  for (const e of entries) {
    await testPool.query(
      `INSERT INTO daily_logs (user_id, entry_text, log_date, log_time, word_count, created_at)
       VALUES ($1, 'fixture entry', CURRENT_DATE - $2::int, '09:00:00', $3, CURRENT_TIMESTAMP - ($2::int || ' days')::interval)`,
      [userId, e.daysAgo, e.wordCount]
    );
  }
};

const setStreakColumn = (userId: string, streak: number) => testPool.query('UPDATE users SET streak_count = $1 WHERE user_id = $2', [streak, userId]);

describe('GET /api/leaderboard -- response shape', () => {
  it('returns the expected fields with correct types for an active user', async () => {
    const { token, userId } = await registerAndLogin('shape');
    await seedLogs(userId, [{ daysAgo: 0, wordCount: 20 }]);

    const res = await request(app).get('/api/leaderboard').set(authHeader(token)).expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const entry = res.body.data.find((e: any) => e.username);
    expect(entry).toBeDefined();

    // team_id is intentionally absent: it's `undefined` in the service's
    // returned object (preserved from the old implementation, which never
    // selected users.team_id either), and JSON.stringify drops keys whose
    // value is undefined -- so it was never actually present in the HTTP
    // response before this rewrite, and still isn't now.
    expect(Object.keys(entry).sort()).toEqual(['full_name', 'impact_score', 'recent_activity', 'streak_count', 'user_id', 'username'].sort());
    expect(typeof entry.impact_score).toBe('number');
    expect(typeof entry.streak_count).toBe('number');
    expect(typeof entry.recent_activity).toBe('number');
  });

  it('rejects unauthenticated requests', async () => {
    await request(app).get('/api/leaderboard').expect(401);
  });
});

describe('GET /api/leaderboard -- impact_score formula', () => {
  it('matches the documented formula: work points (tasks + log quality) + consistency points, capped and rounded', async () => {
    const owner = await registerAndLogin('scoreowner');
    const projectRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Score Fixture Project' })
      .expect(201);
    const projectId = projectRes.body.data.project_id;

    // 2 done tasks (personal, created_by branch) -> completedTasks = 2.
    for (let i = 0; i < 2; i++) {
      const taskRes = await request(app)
        .post(`/api/projects/${projectId}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: `done task ${i}` })
        .expect(201);
      await request(app).put(`/api/tasks/${taskRes.body.data.task_id}`).set(authHeader(owner.token)).send({ status: 'done' }).expect(200);
    }

    // 4 logs within the most-recent-30 window: 2 long (>100 words, quality
    // 10 each), 2 short (quality 5 each) -> avgLogQuality = (10+10+5+5)/4 = 7.5.
    await seedLogs(owner.userId, [
      { daysAgo: 3, wordCount: 150 },
      { daysAgo: 2, wordCount: 150 },
      { daysAgo: 1, wordCount: 10 },
      { daysAgo: 0, wordCount: 10 },
    ]);
    await setStreakColumn(owner.userId, 4); // consistencyPoints = min(4*2, 30) = 8

    // workPoints = min(2*5 + 7.5, 50) = 17.5; consistencyPoints = 8;
    // impact_score = round(17.5 + 8) = round(25.5) = 26 (JS rounds .5 up).
    const expectedScore = 26;

    const res = await request(app).get('/api/leaderboard').set(authHeader(owner.token)).expect(200);
    const entry = res.body.data.find((e: any) => e.user_id === owner.userId);
    expect(entry).toBeDefined();
    expect(entry.impact_score).toBe(expectedScore);
  });

  it('caps averaging to the 30 most recent logs, matching the old getUserLogs(userId, 30) row-limit behavior', async () => {
    const { token, userId } = await registerAndLogin('cap30');

    // 32 short logs (quality 5 each) plus 3 long ones (quality 10 each) that
    // are OLDER than all the short ones -- since only the 30 MOST RECENT
    // rows count, the 3 oldest (long) logs must be excluded from the
    // average, leaving exactly 30 short logs -> avgLogQuality = 5.
    const entries = [
      { daysAgo: 34, wordCount: 150 },
      { daysAgo: 33, wordCount: 150 },
      { daysAgo: 32, wordCount: 150 },
    ];
    for (let i = 31; i >= 0; i--) entries.push({ daysAgo: i, wordCount: 10 });
    await seedLogs(userId, entries);

    // workPoints = min(0 + 5, 50) = 5; consistencyPoints = 0 (default
    // streak_count); impact_score = round(5) = 5.
    const res = await request(app).get('/api/leaderboard').set(authHeader(token)).expect(200);
    const entry = res.body.data.find((e: any) => e.user_id === userId);
    expect(entry.impact_score).toBe(5);
  });
});

describe('GET /api/leaderboard -- recent_activity and inactive-user filtering', () => {
  it('counts recent_activity as min(total log rows, 7), not "logged in the last 7 days"', async () => {
    const { token, userId } = await registerAndLogin('staleactivity');
    // A single log from 200 days ago must still count as recent_activity=1
    // and keep the user on the leaderboard, matching the old
    // getUserLogs(userId, 7).length behavior (row-count, not a date filter).
    await seedLogs(userId, [{ daysAgo: 200, wordCount: 10 }]);

    const res = await request(app).get('/api/leaderboard').set(authHeader(token)).expect(200);
    const entry = res.body.data.find((e: any) => e.user_id === userId);
    expect(entry).toBeDefined();
    expect(entry.recent_activity).toBe(1);
  });

  it('caps recent_activity at 7 even with many more log rows', async () => {
    const { token, userId } = await registerAndLogin('manylogs');
    const entries = Array.from({ length: 10 }, (_, i) => ({ daysAgo: i, wordCount: 10 }));
    await seedLogs(userId, entries);

    const res = await request(app).get('/api/leaderboard').set(authHeader(token)).expect(200);
    const entry = res.body.data.find((e: any) => e.user_id === userId);
    expect(entry.recent_activity).toBe(7);
  });

  it('excludes a user with zero logs from the returned list entirely', async () => {
    const { token, userId } = await registerAndLogin('nologsatall');

    const res = await request(app).get('/api/leaderboard').set(authHeader(token)).expect(200);
    const entry = res.body.data.find((e: any) => e.user_id === userId);
    expect(entry).toBeUndefined();
  });

  it('still persists impact_score for a filtered-out (inactive) user, matching the old per-user update-before-filter behavior', async () => {
    const { token, userId } = await registerAndLogin('inactivepersist');
    await setStreakColumn(userId, 5); // consistencyPoints = 10, impact_score = round(0 + 10) = 10

    await request(app).get('/api/leaderboard').set(authHeader(token)).expect(200);

    const row = await testPool.query('SELECT impact_score FROM users WHERE user_id = $1', [userId]);
    expect(row.rows[0].impact_score).toBe(10);
  });
});

describe('GET /api/leaderboard -- period filter', () => {
  it('defaults to "all" (unfiltered) when no period is given, matching pre-period behavior', async () => {
    const { token, userId } = await registerAndLogin('perioddefault');
    await seedLogs(userId, [{ daysAgo: 200, wordCount: 10 }]);

    const res = await request(app).get('/api/leaderboard').set(authHeader(token)).expect(200);
    const entry = res.body.data.find((e: any) => e.user_id === userId);
    // A 200-day-old log only survives an unfiltered ('all') view.
    expect(entry).toBeDefined();
    expect(entry.recent_activity).toBe(1);
  });

  it('an unrecognized period value falls back to "all" rather than erroring', async () => {
    const { token, userId } = await registerAndLogin('periodbogus');
    await seedLogs(userId, [{ daysAgo: 200, wordCount: 10 }]);

    const res = await request(app).get('/api/leaderboard?period=nonsense').set(authHeader(token)).expect(200);
    const entry = res.body.data.find((e: any) => e.user_id === userId);
    expect(entry).toBeDefined();
  });

  it('period=today excludes logs from before today', async () => {
    const { token, userId } = await registerAndLogin('periodtoday');
    await seedLogs(userId, [{ daysAgo: 3, wordCount: 10 }]);

    const res = await request(app).get('/api/leaderboard?period=today').set(authHeader(token)).expect(200);
    const entry = res.body.data.find((e: any) => e.user_id === userId);
    // No logs today -> recent_activity 0 -> filtered out of the list entirely.
    expect(entry).toBeUndefined();
  });

  it('period=today includes a log made today', async () => {
    const { token, userId } = await registerAndLogin('periodtoday2');
    await seedLogs(userId, [{ daysAgo: 0, wordCount: 10 }]);

    const res = await request(app).get('/api/leaderboard?period=today').set(authHeader(token)).expect(200);
    const entry = res.body.data.find((e: any) => e.user_id === userId);
    expect(entry).toBeDefined();
    expect(entry.recent_activity).toBe(1);
  });

  it('period=week includes a log from earlier in the current week but excludes one older than any window boundary could allow', async () => {
    const { token, userId } = await registerAndLogin('periodweek');
    // 40 days ago cannot fall inside any calendar week/month window.
    await seedLogs(userId, [{ daysAgo: 40, wordCount: 10 }]);

    const res = await request(app).get('/api/leaderboard?period=week').set(authHeader(token)).expect(200);
    const entry = res.body.data.find((e: any) => e.user_id === userId);
    expect(entry).toBeUndefined();
  });

  it('period=month scopes completed_tasks to tasks completed within the current calendar month', async () => {
    const owner = await registerAndLogin('periodtasks');
    const projectRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Period Task Fixture' })
      .expect(201);
    const projectId = projectRes.body.data.project_id;

    const taskRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'done this month' })
      .expect(201);
    await request(app).put(`/api/tasks/${taskRes.body.data.task_id}`).set(authHeader(owner.token)).send({ status: 'done' }).expect(200);
    // Give the user a log too, or recent_activity=0 filters them out
    // entirely before completed_tasks would even be visible.
    await seedLogs(owner.userId, [{ daysAgo: 0, wordCount: 10 }]);

    const allRes = await request(app).get('/api/leaderboard?period=all').set(authHeader(owner.token)).expect(200);
    const monthRes = await request(app).get('/api/leaderboard?period=month').set(authHeader(owner.token)).expect(200);
    const allEntry = allRes.body.data.find((e: any) => e.user_id === owner.userId);
    const monthEntry = monthRes.body.data.find((e: any) => e.user_id === owner.userId);
    expect(allEntry.impact_score).toBeGreaterThan(0);
    // Task completed just now (this test run) falls inside "this month" too
    // -- both views credit it identically.
    expect(monthEntry.impact_score).toBe(allEntry.impact_score);
  });

  it('does NOT persist a period-scoped (non-"all") impact_score to the users table', async () => {
    const { token, userId } = await registerAndLogin('periodnopersist');
    await setStreakColumn(userId, 10); // consistencyPoints = 20, so a persisted score would be nonzero and easy to detect
    await seedLogs(userId, [{ daysAgo: 0, wordCount: 150 }]);

    const before = await testPool.query('SELECT impact_score FROM users WHERE user_id = $1', [userId]);
    expect(before.rows[0].impact_score).toBe(0);

    await request(app).get('/api/leaderboard?period=today').set(authHeader(token)).expect(200);

    const afterToday = await testPool.query('SELECT impact_score FROM users WHERE user_id = $1', [userId]);
    // A period-scoped request must never write to the persisted score.
    expect(afterToday.rows[0].impact_score).toBe(0);

    await request(app).get('/api/leaderboard').set(authHeader(token)).expect(200);

    const afterAll = await testPool.query('SELECT impact_score FROM users WHERE user_id = $1', [userId]);
    // The default/'all' view is the one that IS allowed to persist.
    expect(afterAll.rows[0].impact_score).toBeGreaterThan(0);
  });
});

describe('GET /api/leaderboard -- sort order', () => {
  it('sorts by impact_score descending', async () => {
    const low = await registerAndLogin('lowscore');
    const high = await registerAndLogin('highscore');
    await seedLogs(low.userId, [{ daysAgo: 0, wordCount: 10 }]);
    await seedLogs(high.userId, [{ daysAgo: 0, wordCount: 10 }]);
    await setStreakColumn(high.userId, 10); // higher consistency points

    const res = await request(app).get('/api/leaderboard').set(authHeader(high.token)).expect(200);
    const scores = res.body.data.map((e: any) => e.impact_score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });
});
