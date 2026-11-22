import request from 'supertest';
import { app } from '../src/app';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, buildTeamWithRoles } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const getTeamAttention = (token: string, teamId: string) =>
  request(app).get(`/api/teams/${teamId}/attention`).set(authHeader(token));

describe('Task #7: Explainable Attention & Risk Intelligence Integration Tests', () => {
  it('1. Returns ON_TRACK when active work exists with 0 open blockers and active submissions', async () => {
    const { teamId, owner } = await buildTeamWithRoles();

    // Create a project & task
    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'OnTrack Project', teamId })
      .expect(201);

    await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task 1' })
      .expect(201);

    // Confirm daily work submission
    await request(app)
      .post('/api/work-entries/submit')
      .set(authHeader(owner.token))
      .send({ teamId, confirmedSummary: 'Submitted daily work today' })
      .expect(201);

    const res = await getTeamAttention(owner.token, teamId).expect(200);
    const data = res.body.data.team;

    expect(data.status).toBe('ON_TRACK');
    expect(data.badge_label).toBe('🟢 On Track');
    expect(data.summary).toContain('progressing normally');
    expect(data.evidence.open_blockers).toBe(0);
    expect(data.evidence.submitted_today).toBe(true);
    expect(data.reasons.length).toBeGreaterThan(0);
  });

  it('2. Triggers NEEDS_ATTENTION when 1 open blocker exists or daily submission is missing', async () => {
    const { teamId, owner } = await buildTeamWithRoles();

    // Create project & task (active work exists)
    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Attention Project', teamId })
      .expect(201);

    await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Active Task' })
      .expect(201);

    // Create 1 open blocker
    await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Database Lag', urgency: 'medium' })
      .expect(201);

    const res = await getTeamAttention(owner.token, teamId).expect(200);
    const data = res.body.data.team;

    expect(data.status).toBe('NEEDS_ATTENTION');
    expect(data.badge_label).toBe('🟡 Needs Attention');
    expect(data.evidence.open_blockers).toBe(1);
    expect(data.reasons.some((r: string) => r.includes('1 open SOS blocker'))).toBe(true);
  });

  it('3. Triggers AT_RISK when multiple blockers or critical blockers exist', async () => {
    const { teamId, owner } = await buildTeamWithRoles();

    // Create 2 open blockers
    await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Blocker A', urgency: 'high' })
      .expect(201);

    await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Blocker B', urgency: 'medium' })
      .expect(201);

    const res = await getTeamAttention(owner.token, teamId).expect(200);
    const data = res.body.data.team;

    expect(data.status).toBe('AT_RISK');
    expect(data.badge_label).toBe('🔴 At Risk');
    expect(data.evidence.open_blockers).toBe(2);
    expect(data.evidence.critical_high_blockers).toBe(1);
    expect(data.reasons.some((r: string) => r.includes('2 open SOS blockers'))).toBe(true);
  });

  it('4. Returns NO_ACTIVE_WORK when zero tasks, goals, or blockers exist', async () => {
    const { teamId, owner } = await buildTeamWithRoles();

    const res = await getTeamAttention(owner.token, teamId).expect(200);
    const data = res.body.data.team;

    expect(data.status).toBe('NO_ACTIVE_WORK');
    expect(data.badge_label).toBe('⚪ No Active Work');
    expect(data.evidence.remaining_tasks).toBe(0);
    expect(data.evidence.open_blockers).toBe(0);
  });

  it('5. Task reopening transition history triggers explainable reason', async () => {
    const { teamId, owner } = await buildTeamWithRoles();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Reopen Project', teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task to Reopen' })
      .expect(201);
    const taskId = taskRes.body.data.task_id;

    // Move to done
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(owner.token))
      .send({ status: 'done' })
      .expect(200);

    // Reopen task back to in_progress
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(owner.token))
      .send({ status: 'in_progress' })
      .expect(200);

    const res = await getTeamAttention(owner.token, teamId).expect(200);
    const data = res.body.data.team;

    expect(data.evidence.reopened_tasks).toBe(1);
    expect(data.reasons.some((r: string) => r.includes('reopened'))).toBe(true);
  });

  it('6. Non-team member is denied access (403 Forbidden)', async () => {
    const { teamId, nonMember } = await buildTeamWithRoles();
    await getTeamAttention(nonMember.token, teamId).expect(403);
  });

  it('7. Cross-team teamId substitution attack is denied (403 Forbidden)', async () => {
    const { teamId: teamAId } = await buildTeamWithRoles();
    const { owner: ownerB } = await buildTeamWithRoles();

    await getTeamAttention(ownerB.token, teamAId).expect(403);
  });

  it('8. Unauthenticated request returns 401 Unauthorized', async () => {
    const { teamId } = await buildTeamWithRoles();
    await request(app).get(`/api/teams/${teamId}/attention`).expect(401);
  });

  it('9. Deterministically produces reproducible results for identical inputs', async () => {
    const { teamId, owner } = await buildTeamWithRoles();

    const res1 = await getTeamAttention(owner.token, teamId).expect(200);
    const res2 = await getTeamAttention(owner.token, teamId).expect(200);

    expect(res1.body.data.team.status).toEqual(res2.body.data.team.status);
    expect(res1.body.data.team.reasons).toEqual(res2.body.data.team.reasons);
    expect(res1.body.data.team.evidence).toEqual(res2.body.data.team.evidence);
  });
});
