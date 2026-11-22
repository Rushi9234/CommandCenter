import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, registerAndLogin } from './utils/fixtures';
import { GroqProvider } from '../src/modules/ai/providers/groqProvider';
import { privacyService } from '../src/modules/privacy/privacy.service';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const putSettings = (token: string, body: Record<string, any>) =>
  request(app).put('/api/privacy/settings').set(authHeader(token)).send(body);

// .env.test has no AI_PROVIDER override, so aiProviderFactory defaults to
// GroqProvider (config/env.ts). Spying on the prototype method intercepts
// every call through ai.service.ts's callAI() regardless of which cached
// instance getAIProvider() hands back, without needing real network
// access or depending on Groq actually being reachable in CI.
const VALID_LOG_ANALYSIS = JSON.stringify({
  tasks_identified: ['wrote tests'],
  sentiment_score: 0.5,
  summary: 'Wrote privacy enforcement tests.',
  bullet_points: ['Added tests'],
  achievements: ['Shipped M32'],
  blockers_detected: [],
  quality_score: 8,
});

describe('AI privacy enforcement (Milestone 32)', () => {
  let generateCompletionSpy: jest.SpyInstance;

  beforeEach(() => {
    generateCompletionSpy = jest.spyOn(GroqProvider.prototype, 'generateCompletion');
  });

  afterEach(() => {
    generateCompletionSpy.mockRestore();
  });

  describe('ai_enabled=false blocks every AI entry point', () => {
    it('log creation: analyzeLog is not called, entry gets the clean disabled summary', async () => {
      const { token, userId } = await registerAndLogin('m32_log_off');
      await putSettings(token, { ai_enabled: false }).expect(200);

      const res = await request(app)
        .post('/api/logs')
        .set(authHeader(token))
        .send({ entryText: 'A perfectly normal work log entry for today.' })
        .expect(201);

      expect(generateCompletionSpy).not.toHaveBeenCalled();
      expect(res.body.data.analysis.summary).toMatch(/disabled/i);
      expect(res.body.data.analysis.sentiment_score).toBe(0);

      const row = await pgPool.query('SELECT entry_summary FROM daily_logs WHERE user_id = $1', [userId]);
      expect(row.rows[0].entry_summary).toMatch(/disabled/i);
    });

    it('chat: chatWithAI is not called, response is the clean disabled message', async () => {
      const { token } = await registerAndLogin('m32_chat_off');
      await putSettings(token, { ai_enabled: false }).expect(200);

      const res = await request(app)
        .post('/api/ai/chat')
        .set(authHeader(token))
        .send({ message: 'How do I unblock myself?' })
        .expect(200);

      expect(generateCompletionSpy).not.toHaveBeenCalled();
      expect(res.body.data).toMatch(/disabled/i);
    });

    it('project analysis: analyzeProjectWithAI is not called, response is the clean disabled shape', async () => {
      const { token } = await registerAndLogin('m32_project_off');
      await putSettings(token, { ai_enabled: false }).expect(200);

      const res = await request(app)
        .post('/api/projects/analyze')
        .set(authHeader(token))
        .send({ projectName: 'Test Project', description: 'A project description.' })
        .expect(200);

      expect(generateCompletionSpy).not.toHaveBeenCalled();
      expect(res.body.data.suggested_tasks).toEqual([]);
      expect(res.body.data.timeline_estimate).toMatch(/disabled/i);
    });

    it('blocker creation: analyzeBlocker is not called, ai_suggestions is empty', async () => {
      const owner = await registerAndLogin('m32_blocker_off');
      await putSettings(owner.token, { ai_enabled: false }).expect(200);
      const teamId = await createTeam(owner.token, `M32_BlockerTeam_${Date.now()}`);

      const res = await request(app)
        .post('/api/blockers')
        .set(authHeader(owner.token))
        .send({ teamId, title: 'Build is failing', description: 'CI is red on main.' })
        .expect(201);

      expect(generateCompletionSpy).not.toHaveBeenCalled();
      expect(res.body.data.ai_suggestions).toEqual([]);
    });

    it('blocker mentor advice: generateMentorAdvice is not called, advice is the clean disabled message', async () => {
      const owner = await registerAndLogin('m32_mentor_off');
      await putSettings(owner.token, { ai_enabled: false }).expect(200);
      const teamId = await createTeam(owner.token, `M32_MentorTeam_${Date.now()}`);

      const blockerRes = await request(app)
        .post('/api/blockers')
        .set(authHeader(owner.token))
        .send({ teamId, title: 'Stuck on deploy', description: 'Deploy pipeline broken.' })
        .expect(201);
      generateCompletionSpy.mockClear();

      const res = await request(app)
        .get(`/api/blockers/${blockerRes.body.data.blocker_id}/ai-advice`)
        .set(authHeader(owner.token))
        .expect(200);

      expect(generateCompletionSpy).not.toHaveBeenCalled();
      expect(res.body.data.advice).toMatch(/disabled/i);
    });

    it('log suggestions: generateLogSuggestions is not called, response is the clean disabled shape', async () => {
      const { token } = await registerAndLogin('m32_suggestions_off');
      await putSettings(token, { ai_enabled: false }).expect(200);

      const res = await request(app).get('/api/logs/suggestions').set(authHeader(token)).expect(200);

      expect(generateCompletionSpy).not.toHaveBeenCalled();
      expect(res.body.data.suggestions).toEqual([]);
      expect(res.body.data.productivity_tip).toMatch(/disabled/i);
    });

    it('log insights: generateProductivityInsights is not called, response is the clean disabled shape', async () => {
      const { token } = await registerAndLogin('m32_insights_off');
      await putSettings(token, { ai_enabled: false }).expect(200);

      const res = await request(app).get('/api/logs/insights').set(authHeader(token)).expect(200);

      expect(generateCompletionSpy).not.toHaveBeenCalled();
      expect(res.body.data.overall_assessment).toMatch(/disabled/i);
    });

    it('standup: generateStandup is not called, standup summary is the clean disabled message, but real log data is still returned', async () => {
      const { token } = await registerAndLogin('m32_standup_off');
      await putSettings(token, { ai_enabled: false }).expect(200);

      await request(app)
        .post('/api/logs')
        .set(authHeader(token))
        .send({ entryText: 'Working on the standup privacy test today.' })
        .expect(201);
      generateCompletionSpy.mockClear();

      const res = await request(app).get('/api/logs/standup').set(authHeader(token)).expect(200);

      expect(generateCompletionSpy).not.toHaveBeenCalled();
      expect(res.body.data.summary).toMatch(/disabled/i);
      expect(res.body.data.logs).toHaveLength(1);
    });
  });

  describe('ai_enabled=true (or untouched, default) preserves normal AI behavior', () => {
    it('log creation: analyzeLog IS called and its real output is persisted', async () => {
      generateCompletionSpy.mockResolvedValue(VALID_LOG_ANALYSIS);
      const { token, userId } = await registerAndLogin('m32_log_on');

      const res = await request(app)
        .post('/api/logs')
        .set(authHeader(token))
        .send({ entryText: 'A perfectly normal work log entry for today.' })
        .expect(201);

      expect(generateCompletionSpy).toHaveBeenCalledTimes(1);
      expect(res.body.data.analysis.summary).toBe('Wrote privacy enforcement tests.');

      const row = await pgPool.query('SELECT entry_summary, sentiment_score FROM daily_logs WHERE user_id = $1', [userId]);
      expect(row.rows[0].entry_summary).toBe('Wrote privacy enforcement tests.');
    });

    it('chat: chatWithAI IS called when ai_enabled is explicitly true', async () => {
      generateCompletionSpy.mockResolvedValue('Here is some real AI advice.');
      const { token } = await registerAndLogin('m32_chat_on');
      await putSettings(token, { ai_enabled: true }).expect(200);

      const res = await request(app).post('/api/ai/chat').set(authHeader(token)).send({ message: 'Help me plan my day.' }).expect(200);

      expect(generateCompletionSpy).toHaveBeenCalledTimes(1);
      expect(res.body.data).toBe('Here is some real AI advice.');
    });

    it('project analysis, blocker creation, mentor advice, suggestions, insights, and standup all still call the provider when AI is enabled', async () => {
      generateCompletionSpy.mockResolvedValue('{}');
      const owner = await registerAndLogin('m32_all_on');
      const teamId = await createTeam(owner.token, `M32_AllOnTeam_${Date.now()}`);

      await request(app)
        .post('/api/projects/analyze')
        .set(authHeader(owner.token))
        .send({ projectName: 'P', description: 'D' })
        .expect(200);
      expect(generateCompletionSpy).toHaveBeenCalledTimes(1);

      const blockerRes = await request(app)
        .post('/api/blockers')
        .set(authHeader(owner.token))
        .send({ teamId, title: 'Blocked', description: 'Something broke.' })
        .expect(201);
      expect(generateCompletionSpy).toHaveBeenCalledTimes(2);

      await request(app).get(`/api/blockers/${blockerRes.body.data.blocker_id}/ai-advice`).set(authHeader(owner.token)).expect(200);
      expect(generateCompletionSpy).toHaveBeenCalledTimes(3);

      await request(app).get('/api/logs/suggestions').set(authHeader(owner.token)).expect(200);
      expect(generateCompletionSpy).toHaveBeenCalledTimes(4);

      await request(app).get('/api/logs/insights').set(authHeader(owner.token)).expect(200);
      expect(generateCompletionSpy).toHaveBeenCalledTimes(5);

      await request(app)
        .post('/api/logs')
        .set(authHeader(owner.token))
        .send({ entryText: 'Logging progress for the standup test.' })
        .expect(201);
      expect(generateCompletionSpy).toHaveBeenCalledTimes(6);

      await request(app).get('/api/logs/standup').set(authHeader(owner.token)).expect(200);
      expect(generateCompletionSpy).toHaveBeenCalledTimes(7);
    });
  });

  describe('one user\'s privacy setting cannot affect another user', () => {
    it('user A disabling ai_enabled has no effect on user B', async () => {
      generateCompletionSpy.mockResolvedValue(VALID_LOG_ANALYSIS);
      const userA = await registerAndLogin('m32_isolation_a');
      const userB = await registerAndLogin('m32_isolation_b');
      await putSettings(userA.token, { ai_enabled: false }).expect(200);

      await request(app)
        .post('/api/logs')
        .set(authHeader(userA.token))
        .send({ entryText: 'User A entry, AI should be skipped here.' })
        .expect(201);
      expect(generateCompletionSpy).not.toHaveBeenCalled();

      await request(app)
        .post('/api/logs')
        .set(authHeader(userB.token))
        .send({ entryText: 'User B entry, AI should run normally here.' })
        .expect(201);
      expect(generateCompletionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('fail-safe behavior for missing/invalid privacy data', () => {
    it('isAiEnabledForUser fails closed (returns false) for a user that cannot be found', async () => {
      const result = await privacyService.isAiEnabledForUser('00000000-0000-0000-0000-000000000000');
      expect(result).toBe(false);
    });

    it('a user whose privacy_settings has no ai_enabled key defaults to enabled (matches the schema column default)', async () => {
      generateCompletionSpy.mockResolvedValue(VALID_LOG_ANALYSIS);
      const { token, userId } = await registerAndLogin('m32_missing_key');

      // Simulate a legacy/partial privacy_settings value directly, bypassing
      // the API (which always writes all four keys) -- proves the read path
      // itself, not just updatePrivacySettings's merge behavior.
      await pgPool.query('UPDATE users SET privacy_settings = $1 WHERE user_id = $2', ['{}', userId]);

      const enabled = await privacyService.isAiEnabledForUser(userId);
      expect(enabled).toBe(true);

      await request(app)
        .post('/api/logs')
        .set(authHeader(token))
        .send({ entryText: 'Entry with a missing ai_enabled key in settings.' })
        .expect(201);
      expect(generateCompletionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('existing authentication/authorization is unchanged', () => {
    it('unauthenticated chat request is still rejected before any privacy check runs', async () => {
      await request(app).post('/api/ai/chat').send({ message: 'hi' }).expect(401);
      expect(generateCompletionSpy).not.toHaveBeenCalled();
    });

    it('creating a blocker in a team the caller does not belong to is still rejected', async () => {
      const owner = await registerAndLogin('m32_authz_owner');
      const outsider = await registerAndLogin('m32_authz_outsider');
      const teamId = await createTeam(owner.token, `M32_AuthzTeam_${Date.now()}`);

      await request(app)
        .post('/api/blockers')
        .set(authHeader(outsider.token))
        .send({ teamId, title: 'Should be rejected', description: 'Not a member.' })
        .expect(403);
    });
  });
});

describe('Leaderboard privacy enforcement (Milestone 32)', () => {
  it('a user with leaderboard_visible=false does not appear in the results', async () => {
    const visible = await registerAndLogin('m32_lb_visible');
    const hidden = await registerAndLogin('m32_lb_hidden');
    await putSettings(hidden.token, { leaderboard_visible: false }).expect(200);

    await request(app).post('/api/logs').set(authHeader(visible.token)).send({ entryText: 'Visible user logging work today.' }).expect(201);
    await request(app).post('/api/logs').set(authHeader(hidden.token)).send({ entryText: 'Hidden user logging work today.' }).expect(201);

    const res = await request(app).get('/api/leaderboard').set(authHeader(visible.token)).expect(200);
    const userIds = res.body.data.map((row: any) => row.user_id);

    expect(userIds).toContain(visible.userId);
    expect(userIds).not.toContain(hidden.userId);
  });

  it('a user with leaderboard_visible=true (default) appears normally', async () => {
    const { token, userId } = await registerAndLogin('m32_lb_default');
    await request(app).post('/api/logs').set(authHeader(token)).send({ entryText: 'Default-visibility user logging today.' }).expect(201);

    const res = await request(app).get('/api/leaderboard').set(authHeader(token)).expect(200);
    const userIds = res.body.data.map((row: any) => row.user_id);

    expect(userIds).toContain(userId);
  });

  it('hiding a user from the leaderboard does not stop their impact_score from being refreshed', async () => {
    const hidden = await registerAndLogin('m32_lb_score_still_updates');
    await putSettings(hidden.token, { leaderboard_visible: false }).expect(200);

    await request(app).post('/api/logs').set(authHeader(hidden.token)).send({ entryText: 'Hidden user still earns impact score.' }).expect(201);
    await request(app).get('/api/leaderboard').set(authHeader(hidden.token)).expect(200);

    const row = await pgPool.query('SELECT impact_score FROM users WHERE user_id = $1', [hidden.userId]);
    // recent_activity (1 log) contributes to impact_score's log-quality term,
    // so a real log means a non-zero score if and only if the bulk update
    // still ran for this hidden user.
    expect(Number(row.rows[0].impact_score)).toBeGreaterThan(0);
  });

  it('does not leak the leaderboard_visible field itself in any returned row', async () => {
    const { token } = await registerAndLogin('m32_lb_no_leak');
    await request(app).post('/api/logs').set(authHeader(token)).send({ entryText: 'Checking response shape today.' }).expect(201);

    const res = await request(app).get('/api/leaderboard').set(authHeader(token)).expect(200);
    for (const row of res.body.data) {
      expect(row).not.toHaveProperty('leaderboard_visible');
    }
  });

  it('one user\'s leaderboard_visible setting does not affect another user\'s visibility', async () => {
    const userA = await registerAndLogin('m32_lb_isolation_a');
    const userB = await registerAndLogin('m32_lb_isolation_b');
    await putSettings(userA.token, { leaderboard_visible: false }).expect(200);

    await request(app).post('/api/logs').set(authHeader(userA.token)).send({ entryText: 'User A hidden from leaderboard.' }).expect(201);
    await request(app).post('/api/logs').set(authHeader(userB.token)).send({ entryText: 'User B visible on leaderboard.' }).expect(201);

    const res = await request(app).get('/api/leaderboard').set(authHeader(userB.token)).expect(200);
    const userIds = res.body.data.map((row: any) => row.user_id);

    expect(userIds).not.toContain(userA.userId);
    expect(userIds).toContain(userB.userId);
  });
});
