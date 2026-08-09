import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, addMember, registerAndLogin } from './utils/fixtures';
import { GroqProvider } from '../src/modules/ai/providers/groqProvider';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

// ---------------------------------------------------------------------------
// Milestone 42 -- POST /teams: parentTeamId destination-authorization gap
// ---------------------------------------------------------------------------

describe('Milestone 42 -- POST /teams closes the missing parentTeamId destination-authorization check', () => {
  it('rejects creating a team nested under a team the caller has no access to, and the team is never created', async () => {
    const ownerA = await registerAndLogin('m42_teams_owner_a');
    const outsider = await registerAndLogin('m42_teams_outsider');
    const teamAId = await createTeam(ownerA.token, `M42_TeamsA_${Date.now()}`);

    const teamName = `M42_Nested_${Date.now()}`;
    const res = await request(app)
      .post('/api/teams')
      .set(authHeader(outsider.token))
      .send({ teamName, parentTeamId: teamAId });
    expect(res.status).toBe(403);

    const row = await pgPool.query('SELECT team_id FROM teams WHERE team_name = $1', [teamName]);
    expect(row.rows.length).toBe(0);
  });

  it('allows creating a team nested under a team the caller has owner/admin access to', async () => {
    const owner = await registerAndLogin('m42_teams_owner_authorized');
    const teamAId = await createTeam(owner.token, `M42_TeamsAuthorized_${Date.now()}`);

    const res = await request(app)
      .post('/api/teams')
      .set(authHeader(owner.token))
      .send({ teamName: `M42_NestedOk_${Date.now()}`, parentTeamId: teamAId })
      .expect(201);
    expect(res.body.data.parent_team_id).toBe(teamAId);
  });

  it('creating a team with no parentTeamId at all still works (regression -- the guard is opt-in)', async () => {
    const owner = await registerAndLogin('m42_teams_no_parent');
    await request(app).post('/api/teams').set(authHeader(owner.token)).send({ teamName: `M42_NoParent_${Date.now()}` }).expect(201);
  });

  it('rejects an out-of-range maxTeamSize', async () => {
    const owner = await registerAndLogin('m42_teams_oversized');
    const res = await request(app)
      .post('/api/teams')
      .set(authHeader(owner.token))
      .send({ teamName: `M42_Oversized_${Date.now()}`, maxTeamSize: 999999 });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Milestone 42 -- POST /goals: parentGoalId destination-authorization gap
// ---------------------------------------------------------------------------

describe('Milestone 42 -- POST /goals closes the missing parentGoalId destination-authorization check', () => {
  const createGoal = (token: string, body: Record<string, any>) => request(app).post('/api/goals').set(authHeader(token)).send(body);

  it('rejects creating a goal nested under a goal in a team the caller has no write access to, and no goal is created', async () => {
    const ownerA = await registerAndLogin('m42_goals_owner_a');
    const outsider = await registerAndLogin('m42_goals_outsider');
    const teamAId = await createTeam(ownerA.token, `M42_GoalsA_${Date.now()}`);
    const parentRes = await createGoal(ownerA.token, { title: 'Parent Goal', teamId: teamAId }).expect(201);
    const parentId = parentRes.body.data.goal_id;

    const title = `M42_ChildGoal_${Date.now()}`;
    const res = await createGoal(outsider.token, { title, parentGoalId: parentId });
    expect(res.status).toBe(403);

    const row = await pgPool.query('SELECT goal_id FROM goals WHERE title = $1', [title]);
    expect(row.rows.length).toBe(0);
  });

  it('allows creating a goal nested under a goal the caller has write access to', async () => {
    const owner = await registerAndLogin('m42_goals_owner_authorized');
    const teamId = await createTeam(owner.token, `M42_GoalsAuthorized_${Date.now()}`);
    const parentRes = await createGoal(owner.token, { title: 'Parent Goal Ok', teamId }).expect(201);
    const parentId = parentRes.body.data.goal_id;

    const res = await createGoal(owner.token, { title: `M42_ChildGoalOk_${Date.now()}`, parentGoalId: parentId }).expect(201);
    expect(res.body.data.parent_goal_id).toBe(parentId);
  });

  it('rejects a malformed (non-UUID) parentGoalId with a clean 400', async () => {
    const owner = await registerAndLogin('m42_goals_malformed_parent');
    const res = await createGoal(owner.token, { title: 'Bad Parent', parentGoalId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });

  it('creating a goal with no parentGoalId at all still works (regression -- the guard is opt-in)', async () => {
    const owner = await registerAndLogin('m42_goals_no_parent');
    await createGoal(owner.token, { title: `M42_GoalNoParent_${Date.now()}` }).expect(201);
  });
});

// ---------------------------------------------------------------------------
// Milestone 42 -- AI-provider GET endpoints now rate-limited
// ---------------------------------------------------------------------------

describe('Milestone 42 -- previously unrated, repeatable AI-provider GET endpoints are now rate-limited', () => {
  let generateCompletionSpy: jest.SpyInstance;

  beforeEach(() => {
    generateCompletionSpy = jest.spyOn(GroqProvider.prototype, 'generateCompletion');
  });

  afterEach(() => {
    generateCompletionSpy.mockRestore();
  });

  it('GET /blockers/:blockerId/ai-advice: the 21st call within the window is rejected before reaching the AI provider', async () => {
    generateCompletionSpy.mockResolvedValue('Some AI advice');
    const owner = await registerAndLogin('m42_blocker_ai_limit');
    const teamId = await createTeam(owner.token, `M42_BlockerAI_${Date.now()}`);
    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'M42 Blocker' })
      .expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    // createBlocker itself calls the AI provider once (for its own
    // suggestions/analyzeBlocker step) -- clear that call before
    // measuring the ai-advice endpoint's own budget in isolation.
    generateCompletionSpy.mockClear();

    for (let i = 0; i < 20; i++) {
      await request(app).get(`/api/blockers/${blockerId}/ai-advice`).set(authHeader(owner.token)).expect(200);
    }
    expect(generateCompletionSpy).toHaveBeenCalledTimes(20);

    const overLimit = await request(app).get(`/api/blockers/${blockerId}/ai-advice`).set(authHeader(owner.token));
    expect(overLimit.status).toBe(429);
    expect(generateCompletionSpy).toHaveBeenCalledTimes(20);
  });

  it('GET /logs/suggestions: the 21st call within the window is rejected before reaching the AI provider', async () => {
    generateCompletionSpy.mockResolvedValue('{"suggestions": [], "focus_areas": [], "productivity_tip": "tip"}');
    const { token } = await registerAndLogin('m42_logs_suggestions_limit');

    for (let i = 0; i < 20; i++) {
      await request(app).get('/api/logs/suggestions').set(authHeader(token)).expect(200);
    }
    expect(generateCompletionSpy).toHaveBeenCalledTimes(20);

    const overLimit = await request(app).get('/api/logs/suggestions').set(authHeader(token));
    expect(overLimit.status).toBe(429);
    expect(generateCompletionSpy).toHaveBeenCalledTimes(20);
  });

  it('GET /logs/insights: under-limit requests succeed and each one calls the provider exactly once', async () => {
    generateCompletionSpy.mockResolvedValue(
      '{"strengths": [], "improvements": [], "recommendations": [], "overall_assessment": "ok"}'
    );
    const { token } = await registerAndLogin('m42_logs_insights_normal');

    await request(app).get('/api/logs/insights').set(authHeader(token)).expect(200);
    expect(generateCompletionSpy).toHaveBeenCalledTimes(1);
  });

  it('GET /logs/standup: under-limit requests succeed and call the provider', async () => {
    generateCompletionSpy.mockResolvedValue('Standup summary');
    const { token } = await registerAndLogin('m42_logs_standup_normal');

    await request(app).get('/api/logs/standup').set(authHeader(token)).expect(200);
    expect(generateCompletionSpy).toHaveBeenCalledTimes(1);
  });

  it('a different user has their own independent budget on the same endpoint', async () => {
    generateCompletionSpy.mockResolvedValue('{"suggestions": [], "focus_areas": [], "productivity_tip": "tip"}');
    const userA = await registerAndLogin('m42_logs_isolation_a');
    const userB = await registerAndLogin('m42_logs_isolation_b');

    for (let i = 0; i < 20; i++) {
      await request(app).get('/api/logs/suggestions').set(authHeader(userA.token)).expect(200);
    }
    await request(app).get('/api/logs/suggestions').set(authHeader(userA.token)).expect(429);

    await request(app).get('/api/logs/suggestions').set(authHeader(userB.token)).expect(200);
  });
});

// ---------------------------------------------------------------------------
// Milestone 42 -- GET /projects/:projectId/tasks N+1 fix (functional
// correctness, not a performance benchmark)
// ---------------------------------------------------------------------------

describe('Milestone 42 -- GET /projects/:projectId/tasks batch-loading regression', () => {
  it('still returns the correct owner/reviewer/contributor/dependency shape for multiple tasks with cross-references', async () => {
    const owner = await registerAndLogin('m42_batch_owner');
    const member = await registerAndLogin('m42_batch_member');
    const teamId = await createTeam(owner.token, `M42_Batch_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const projectRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'M42 Batch Project', teamId })
      .expect(201);
    const projectId = projectRes.body.data.project_id;

    const taskARes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task A', owner: owner.userId, contributors: [member.userId] })
      .expect(201);
    const taskAId = taskARes.body.data.task_id;

    const taskBRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task B', reviewer: member.userId, dependencies: [taskAId] })
      .expect(201);

    const res = await request(app).get(`/api/projects/${projectId}/tasks`).set(authHeader(owner.token)).expect(200);
    const taskA = res.body.data.find((t: any) => t.task_id === taskAId);
    const taskB = res.body.data.find((t: any) => t.task_id === taskBRes.body.data.task_id);

    expect(taskA.owner_user.user_id).toBe(owner.userId);
    expect(taskA.contributor_users.map((u: any) => u.user_id)).toContain(member.userId);
    expect(taskB.reviewer_user.user_id).toBe(member.userId);
    expect(taskB.dependency_tasks.map((t: any) => t.task_id)).toContain(taskAId);
  });

  it('handles a task with no references at all (empty arrays, null owner/reviewer)', async () => {
    const owner = await registerAndLogin('m42_batch_empty_owner');
    const teamId = await createTeam(owner.token, `M42_BatchEmpty_${Date.now()}`);
    const projectRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'M42 Empty Project', teamId })
      .expect(201);
    const projectId = projectRes.body.data.project_id;

    await request(app).post(`/api/projects/${projectId}/tasks`).set(authHeader(owner.token)).send({ title: 'Bare Task' }).expect(201);

    const res = await request(app).get(`/api/projects/${projectId}/tasks`).set(authHeader(owner.token)).expect(200);
    const task = res.body.data[0];
    expect(task.owner_user).toBeNull();
    expect(task.reviewer_user).toBeNull();
    expect(task.contributor_users).toEqual([]);
    expect(task.dependency_tasks).toEqual([]);
  });
});
