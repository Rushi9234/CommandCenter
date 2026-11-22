import request from 'supertest';
import { app } from '../src/app';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, addMember, registerAndLogin, buildTeamWithRoles } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const getWorkHistory = (token: string, teamId: string, qs = '') =>
  request(app).get(`/api/teams/${teamId}/work-history${qs}`).set(authHeader(token));

describe('Task #6: Work-State / Progress History Foundation Integration Tests', () => {
  it('1. Task creation records "created" history event in work_state_history', async () => {
    const { teamId, owner } = await buildTeamWithRoles();

    // Create a project
    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'History Project', teamId })
      .expect(201);
    const projectId = projRes.body.data.project_id;

    // Create a task
    const taskRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Build Audit Trail', priority: 'high' })
      .expect(201);
    const taskId = taskRes.body.data.task_id;

    // Fetch history
    const historyRes = await getWorkHistory(owner.token, teamId).expect(200);
    expect(historyRes.body.data.history).toHaveLength(1);

    const event = historyRes.body.data.history[0];
    expect(event.artifact_type).toBe('task');
    expect(event.artifact_id).toBe(taskId);
    expect(event.event_type).toBe('created');
    expect(event.actor_id).toBe(owner.userId);
    expect(event.actor_name).toBe(owner.user.fullName);
    expect(event.new_state.title).toBe('Build Audit Trail');
  });

  it('2. Task state transitions (status change, completed, reopened) record accurate history', async () => {
    const { teamId, owner } = await buildTeamWithRoles();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'State Change Project', teamId })
      .expect(201);
    const projectId = projRes.body.data.project_id;

    const taskRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task State Test' })
      .expect(201);
    const taskId = taskRes.body.data.task_id;

    // Update status to in_progress
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(owner.token))
      .send({ status: 'in_progress' })
      .expect(200);

    // Update status to done
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(owner.token))
      .send({ status: 'done' })
      .expect(200);

    // Reopen task
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(owner.token))
      .send({ status: 'in_progress' })
      .expect(200);

    const historyRes = await getWorkHistory(owner.token, teamId).expect(200);
    expect(historyRes.body.data.history.length).toBeGreaterThanOrEqual(4);

    const events = historyRes.body.data.history.map((h: any) => h.event_type);
    expect(events).toContain('created');
    expect(events).toContain('status_changed');
    expect(events).toContain('completed');
    expect(events).toContain('reopened');
  });

  it('3. Goal creation and progress changes record history', async () => {
    const { teamId, owner } = await buildTeamWithRoles();

    // Create goal
    const goalRes = await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({ title: 'Q4 Product Roadmap', teamId, goalType: 'company' })
      .expect(201);
    const goalId = goalRes.body.data.goal_id;

    // Update progress
    await request(app)
      .put(`/api/goals/${goalId}`)
      .set(authHeader(owner.token))
      .send({ progress: 50 })
      .expect(200);

    const historyRes = await getWorkHistory(owner.token, teamId, '?artifactType=goal').expect(200);
    expect(historyRes.body.data.history).toHaveLength(2);

    const types = historyRes.body.data.history.map((h: any) => h.event_type);
    expect(types).toContain('created');
    expect(types).toContain('progress_changed');
  });

  it('4. Blocker creation and resolution record history', async () => {
    const { teamId, owner } = await buildTeamWithRoles();

    // Create blocker
    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Server Outage', urgency: 'high' })
      .expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    // Resolve blocker
    await request(app)
      .put(`/api/blockers/${blockerId}`)
      .set(authHeader(owner.token))
      .send({ status: 'resolved' })
      .expect(200);

    const historyRes = await getWorkHistory(owner.token, teamId, '?artifactType=blocker').expect(200);
    expect(historyRes.body.data.history).toHaveLength(2);

    const types = historyRes.body.data.history.map((h: any) => h.event_type);
    expect(types).toContain('created');
    expect(types).toContain('resolved');
  });

  it('5. Daily work submission confirmation records history', async () => {
    const { teamId, owner } = await buildTeamWithRoles();

    // Create entry
    await request(app)
      .post('/api/work-entries')
      .set(authHeader(owner.token))
      .send({ teamId, entryText: 'Fixed authentication bug' })
      .expect(201);

    // Confirm submission
    await request(app)
      .post('/api/work-entries/submit')
      .set(authHeader(owner.token))
      .send({ teamId, confirmedSummary: 'Fixed authentication bug and ran test suite' })
      .expect(201);

    const historyRes = await getWorkHistory(owner.token, teamId, '?artifactType=daily_work').expect(200);
    expect(historyRes.body.data.history).toHaveLength(1);
    expect(historyRes.body.data.history[0].event_type).toBe('confirmed');
  });

  it('6. Non-team member is denied access to work history (403)', async () => {
    const { teamId, nonMember } = await buildTeamWithRoles();
    await getWorkHistory(nonMember.token, teamId).expect(403);
  });

  it('7. Cross-team teamId substitution returns 403', async () => {
    const { teamId: teamAId, owner: ownerA } = await buildTeamWithRoles();
    const { owner: ownerB } = await buildTeamWithRoles();

    await getWorkHistory(ownerB.token, teamAId).expect(403);
  });

  it('8. Unauthenticated request returns 401', async () => {
    const { teamId } = await buildTeamWithRoles();
    await request(app).get(`/api/teams/${teamId}/work-history`).expect(401);
  });

  it('9. Pagination with limit and next_cursor works correctly', async () => {
    const { teamId, owner } = await buildTeamWithRoles();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Pagination Project', teamId })
      .expect(201);
    const projectId = projRes.body.data.project_id;

    // Create 5 tasks to generate 5 history entries
    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post(`/api/projects/${projectId}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: `Task ${i}` })
        .expect(201);
    }

    // Page 1 with limit=3
    const p1 = await getWorkHistory(owner.token, teamId, '?limit=3').expect(200);
    expect(p1.body.data.history).toHaveLength(3);
    expect(p1.body.data.next_cursor).not.toBeNull();

    // Page 2 with cursor
    const cursor = p1.body.data.next_cursor;
    const p2 = await getWorkHistory(owner.token, teamId, `?limit=3&cursor=${cursor}`).expect(200);
    expect(p2.body.data.history).toHaveLength(2);
    expect(p2.body.data.next_cursor).toBeNull();
  });
});
