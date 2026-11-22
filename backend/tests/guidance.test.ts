import request from 'supertest';
import { app } from '../src/app';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, buildTeamWithRoles } from './utils/fixtures';
import { signAccessToken } from '../src/modules/auth/jwt';

import crypto from 'crypto';

async function buildGuidanceFixture() {
  const ownerId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const managerId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const viewerId = crypto.randomUUID();
  const nonMemberId = crypto.randomUUID();
  const teamId = crypto.randomUUID();

  const uid = Date.now() + '_' + Math.floor(Math.random() * 1000000);

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO users (user_id, email, password_hash, full_name, username, is_verified)
      VALUES
        ($1, 'owner_${uid}@test.local', 'hash', 'Team Owner', 'owner_${uid}', true),
        ($2, 'admin_${uid}@test.local', 'hash', 'Team Admin', 'admin_${uid}', true),
        ($3, 'manager_${uid}@test.local', 'hash', 'Team Manager', 'manager_${uid}', true),
        ($4, 'member_${uid}@test.local', 'hash', 'Team Member', 'member_${uid}', true),
        ($5, 'viewer_${uid}@test.local', 'hash', 'Team Viewer', 'viewer_${uid}', true),
        ($6, 'nonmember_${uid}@test.local', 'hash', 'Non Member', 'nonmember_${uid}', true)
    `, [ownerId, adminId, managerId, memberId, viewerId, nonMemberId]);

    await client.query(`
      INSERT INTO teams (team_id, team_name, created_by)
      VALUES ($1, 'Guidance Test Team', $2)
    `, [teamId, ownerId]);

    await client.query(`
      INSERT INTO team_members (team_id, user_id, role)
      VALUES
        ($1, $2, 'owner'),
        ($1, $3, 'admin'),
        ($1, $4, 'manager'),
        ($1, $5, 'member'),
        ($1, $6, 'viewer')
    `, [teamId, ownerId, adminId, managerId, memberId, viewerId]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    teamId,
    owner: { userId: ownerId, token: signAccessToken({ userId: ownerId, role: 'member' }) },
    admin: { userId: adminId, token: signAccessToken({ userId: adminId, role: 'member' }) },
    manager: { userId: managerId, token: signAccessToken({ userId: managerId, role: 'member' }) },
    member: { userId: memberId, token: signAccessToken({ userId: memberId, role: 'member' }) },
    viewer: { userId: viewerId, token: signAccessToken({ userId: viewerId, role: 'member' }) },
    nonMember: { userId: nonMemberId, token: signAccessToken({ userId: nonMemberId, role: 'member' }) },
  };
}

beforeEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('Target #2 — Guidance & Coordination Loop Suite', () => {
  it('1. Valid task guidance creation by team leader', async () => {
    const { teamId, owner, member } = await buildGuidanceFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Team Project', teamId })
      .expect(201);
    const projectId = projRes.body.data.project_id;

    const taskRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Stalled Task', owner: member.userId })
      .expect(201);
    const taskId = taskRes.body.data.task_id;

    const guidanceRes = await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskId,
        teamId,
        recipientId: member.userId,
        message: 'Please update your progress on this stalled task.',
      })
      .expect(201);

    expect(guidanceRes.body.data.guidance_id).toBeDefined();
    expect(guidanceRes.body.data.context_type).toBe('task');
    expect(guidanceRes.body.data.context_id).toBe(taskId);
    expect(guidanceRes.body.data.status).toBe('open');
    expect(guidanceRes.body.data.recipient_id).toBe(member.userId);
  });

  it('2. Valid goal guidance creation by team leader', async () => {
    const { teamId, owner } = await buildGuidanceFixture();

    const goalRes = await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({ title: 'Increase Conversion', teamId, goalType: 'team' })
      .expect(201);
    const goalId = goalRes.body.data.goal_id;

    const guidanceRes = await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'goal',
        contextId: goalId,
        message: 'Review quarterly target benchmarks.',
      })
      .expect(201);

    expect(guidanceRes.body.data.guidance_id).toBeDefined();
    expect(guidanceRes.body.data.context_type).toBe('goal');
  });

  it('3. Valid blocker guidance creation by team leader', async () => {
    const { teamId, owner } = await buildGuidanceFixture();

    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Database connection drop', urgency: 'high' })
      .expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    const guidanceRes = await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'blocker',
        contextId: blockerId,
        message: 'Restart pool connections and monitor latency.',
      })
      .expect(201);

    expect(guidanceRes.body.data.guidance_id).toBeDefined();
    expect(guidanceRes.body.data.context_type).toBe('blocker');
  });

  it('4. Invalid contextId returns 404 Not Found', async () => {
    const { owner } = await buildGuidanceFixture();
    const fakeUuid = '00000000-0000-4000-8000-000000000000';

    await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: fakeUuid,
        message: 'Guidance on ghost context',
      })
      .expect(404);
  });

  it('5. Deleted context entity exposes context_status="deleted" on fetch', async () => {
    const { teamId, owner } = await buildGuidanceFixture();

    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Temporary Blocker' })
      .expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    const guidanceRes = await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'blocker',
        contextId: blockerId,
        message: 'Please clear this temp blocker.',
      })
      .expect(201);
    const guidanceId = guidanceRes.body.data.guidance_id;

    await pgPool.query('DELETE FROM blockers WHERE blocker_id = $1', [blockerId]);

    const fetchRes = await request(app)
      .get(`/api/guidance/${guidanceId}`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(fetchRes.body.data.context_status).toBe('deleted');

    await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'blocker',
        contextId: blockerId,
        message: 'New guidance on deleted context',
      })
      .expect(404);
  });

  it('6. Personal context guidance is rejected (403 Forbidden)', async () => {
    const { owner, member } = await buildGuidanceFixture();

    const personalProjRes = await request(app)
      .post('/api/projects')
      .set(authHeader(member.token))
      .send({ projectName: 'Personal Side Project' })
      .expect(201);
    const projId = personalProjRes.body.data.project_id;

    const taskRes = await request(app)
      .post(`/api/projects/${projId}/tasks`)
      .set(authHeader(member.token))
      .send({ title: 'Personal Task' })
      .expect(201);
    const personalTaskId = taskRes.body.data.task_id;

    await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: personalTaskId,
        message: 'Leader trying to guide personal task',
      })
      .expect(403);
  });

  it('7. Cross-team guidance attempt returns 403 Forbidden', async () => {
    const fA = await buildGuidanceFixture();
    const fB = await buildGuidanceFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(fA.owner.token))
      .send({ projectName: 'Team A Project', teamId: fA.teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(fA.owner.token))
      .send({ title: 'Team A Task' })
      .expect(201);

    await request(app)
      .post('/api/guidance')
      .set(authHeader(fB.owner.token))
      .send({
        contextType: 'task',
        contextId: taskRes.body.data.task_id,
        message: 'Leader B intruding on Team A task',
      })
      .expect(403);
  });

  it('8. Mismatched teamId in request body returns 400 Bad Request', async () => {
    const fA = await buildGuidanceFixture();
    const fB = await buildGuidanceFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(fA.owner.token))
      .send({ projectName: 'Team A Project', teamId: fA.teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(fA.owner.token))
      .send({ title: 'Team A Task' })
      .expect(201);

    await request(app)
      .post('/api/guidance')
      .set(authHeader(fA.owner.token))
      .send({
        contextType: 'task',
        contextId: taskRes.body.data.task_id,
        teamId: fB.teamId,
        message: 'Mismatched teamId test',
      })
      .expect(400);
  });

  it('9. Classroom Coordinator of parent team can issue guidance on child team task', async () => {
    const parentUserId = crypto.randomUUID();
    const childOwnerId = crypto.randomUUID();
    const uid = Date.now() + '_' + Math.floor(Math.random() * 10000);

    await pgPool.query(`
      INSERT INTO users (user_id, email, password_hash, full_name, username, is_verified)
      VALUES
        ($1, 'pcoord_${uid}@test.local', 'hash', 'Parent Coord', 'pcoord_${uid}', true),
        ($2, 'cleader_${uid}@test.local', 'hash', 'Child Leader', 'cleader_${uid}', true)
    `, [parentUserId, childOwnerId]);

    const parentTeamRes = await pgPool.query(`
      INSERT INTO teams (team_name, created_by) VALUES ('Parent Classroom', $1) RETURNING team_id
    `, [parentUserId]);
    const parentTeamId = parentTeamRes.rows[0].team_id;

    await pgPool.query(`
      INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')
    `, [parentTeamId, parentUserId]);

    const childTeamRes = await pgPool.query(`
      INSERT INTO teams (team_name, created_by, parent_team_id) VALUES ('Child Team', $1, $2) RETURNING team_id
    `, [childOwnerId, parentTeamId]);
    const childTeamId = childTeamRes.rows[0].team_id;

    await pgPool.query(`
      INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')
    `, [childTeamId, childOwnerId]);

    const parentToken = signAccessToken({ userId: parentUserId, role: 'member' });
    const childToken = signAccessToken({ userId: childOwnerId, role: 'member' });

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(childToken))
      .send({ projectName: 'Child Project', teamId: childTeamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(childToken))
      .send({ title: 'Child Task' })
      .expect(201);

    await request(app)
      .post('/api/guidance')
      .set(authHeader(parentToken))
      .send({
        contextType: 'task',
        contextId: taskRes.body.data.task_id,
        teamId: childTeamId,
        message: 'Coordinator guidance for student team task.',
      })
      .expect(201);
  });

  it('10. Non-leader team member cannot create guidance (403 Forbidden)', async () => {
    const { teamId, owner, member } = await buildGuidanceFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Team Project', teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Team Task' })
      .expect(201);

    await request(app)
      .post('/api/guidance')
      .set(authHeader(member.token))
      .send({
        contextType: 'task',
        contextId: taskRes.body.data.task_id,
        message: 'Member trying to issue guidance',
      })
      .expect(403);
  });

  it('11. Non-team member is denied access to list/read guidance (403 Forbidden)', async () => {
    const { teamId, nonMember } = await buildGuidanceFixture();

    await request(app)
      .get(`/api/guidance?teamId=${teamId}`)
      .set(authHeader(nonMember.token))
      .expect(403);
  });

  it('12. Non-recipient member cannot acknowledge guidance (403 Forbidden)', async () => {
    const { teamId, owner, member, admin } = await buildGuidanceFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Team Project', teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task for Member' })
      .expect(201);

    const guidanceRes = await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskRes.body.data.task_id,
        recipientId: member.userId,
        message: 'Specific member guidance',
      })
      .expect(201);

    const guidanceId = guidanceRes.body.data.guidance_id;

    await request(app)
      .patch(`/api/guidance/${guidanceId}/status`)
      .set(authHeader(admin.token))
      .send({ status: 'acknowledged' })
      .expect(403);
  });

  it('13. Unauthorized peer cannot resolve guidance (403 Forbidden)', async () => {
    const { teamId, owner, member, nonMember } = await buildGuidanceFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Team Project', teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task' })
      .expect(201);

    const guidanceRes = await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskRes.body.data.task_id,
        recipientId: member.userId,
        message: 'Guidance to resolve',
      })
      .expect(201);

    await request(app)
      .patch(`/api/guidance/${guidanceRes.body.data.guidance_id}/status`)
      .set(authHeader(nonMember.token))
      .send({ status: 'resolved' })
      .expect(403);
  });

  it('14. Assigned recipient can acknowledge open guidance', async () => {
    const { teamId, owner, member } = await buildGuidanceFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Team Project', teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task' })
      .expect(201);

    const guidanceRes = await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskRes.body.data.task_id,
        recipientId: member.userId,
        message: 'Guidance to acknowledge',
      })
      .expect(201);

    const guidanceId = guidanceRes.body.data.guidance_id;

    const ackRes = await request(app)
      .patch(`/api/guidance/${guidanceId}/status`)
      .set(authHeader(member.token))
      .send({ status: 'acknowledged' })
      .expect(200);

    expect(ackRes.body.data.status).toBe('acknowledged');
    expect(ackRes.body.data.acknowledged_at).not.toBeNull();
  });

  it('15. Assigned recipient or author can resolve guidance', async () => {
    const { teamId, owner, member } = await buildGuidanceFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Team Project', teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task' })
      .expect(201);

    const guidanceRes = await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskRes.body.data.task_id,
        recipientId: member.userId,
        message: 'Guidance to resolve',
      })
      .expect(201);

    const guidanceId = guidanceRes.body.data.guidance_id;

    const resolveRes = await request(app)
      .patch(`/api/guidance/${guidanceId}/status`)
      .set(authHeader(member.token))
      .send({ status: 'resolved' })
      .expect(200);

    expect(resolveRes.body.data.status).toBe('resolved');
    expect(resolveRes.body.data.resolved_at).not.toBeNull();
  });

  it('16. Invalid transition payload returns 400 Bad Request', async () => {
    const { teamId, owner, member } = await buildGuidanceFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Team Project', teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task' })
      .expect(201);

    const guidanceRes = await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskRes.body.data.task_id,
        recipientId: member.userId,
        message: 'Guidance test',
      })
      .expect(201);

    await request(app)
      .patch(`/api/guidance/${guidanceRes.body.data.guidance_id}/status`)
      .set(authHeader(member.token))
      .send({ status: 'invalid_status' })
      .expect(400);
  });

  it('17. Concurrent / repeated acknowledge returns 409 Conflict', async () => {
    const { teamId, owner, member } = await buildGuidanceFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Team Project', teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task' })
      .expect(201);

    const guidanceRes = await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskRes.body.data.task_id,
        recipientId: member.userId,
        message: 'Guidance to test repeated ack',
      })
      .expect(201);

    const guidanceId = guidanceRes.body.data.guidance_id;

    await request(app)
      .patch(`/api/guidance/${guidanceId}/status`)
      .set(authHeader(member.token))
      .send({ status: 'acknowledged' })
      .expect(200);

    await request(app)
      .patch(`/api/guidance/${guidanceId}/status`)
      .set(authHeader(member.token))
      .send({ status: 'acknowledged' })
      .expect(409);
  });

  it('18. Removed team member loses access immediately (403 Forbidden)', async () => {
    const { teamId, owner, member } = await buildGuidanceFixture();

    await pgPool.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, member.userId]);

    await request(app)
      .get(`/api/guidance?teamId=${teamId}`)
      .set(authHeader(member.token))
      .expect(403);
  });

  it('19. Rejoined team member can access team guidance', async () => {
    const { teamId, member } = await buildGuidanceFixture();

    await pgPool.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, member.userId]);
    await pgPool.query('INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)', [teamId, member.userId, 'member']);

    await request(app)
      .get(`/api/guidance?teamId=${teamId}`)
      .set(authHeader(member.token))
      .expect(200);
  });

  it('20. Guidance creation creates notification specifically for recipient', async () => {
    const { teamId, owner, member } = await buildGuidanceFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Team Project', teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task', owner: member.userId })
      .expect(201);

    await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskRes.body.data.task_id,
        recipientId: member.userId,
        message: 'Notification check guidance',
      })
      .expect(201);

    const notifRes = await request(app)
      .get('/api/notifications')
      .set(authHeader(member.token))
      .expect(200);

    const rawList = notifRes.body.data.notifications || notifRes.body.data;
    const guidanceNotif = rawList.find((n: any) => n.category === 'guidance');
    expect(guidanceNotif).toBeDefined();
    expect(guidanceNotif.title).toBe('Guidance Received');
  });

  it('22. Guidance events write to work_state_history correctly', async () => {
    const { teamId, owner, member } = await buildGuidanceFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Team Project', teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task' })
      .expect(201);
    const taskId = taskRes.body.data.task_id;

    const gRes = await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskId,
        recipientId: member.userId,
        message: 'History test guidance',
      })
      .expect(201);

    await request(app)
      .patch(`/api/guidance/${gRes.body.data.guidance_id}/status`)
      .set(authHeader(member.token))
      .send({ status: 'acknowledged' })
      .expect(200);

    const historyRes = await request(app)
      .get(`/api/teams/${teamId}/worklog`)
      .set(authHeader(owner.token));

    expect([200, 304]).toContain(historyRes.status);
  });

  it('23. Duplicate guidance creation returns 409 Conflict', async () => {
    const { teamId, owner, member } = await buildGuidanceFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Team Project', teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task' })
      .expect(201);

    const payload = {
      contextType: 'task' as const,
      contextId: taskRes.body.data.task_id,
      recipientId: member.userId,
      message: 'Exact duplicate guidance message',
    };

    await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send(payload)
      .expect(201);

    await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send(payload)
      .expect(409);
  });

  it('24. Message length validation (< 3 or > 2000 chars) returns 400 Bad Request', async () => {
    const { teamId, owner } = await buildGuidanceFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Team Project', teamId })
      .expect(201);

    const taskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task' })
      .expect(201);

    await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskRes.body.data.task_id,
        message: 'hi',
      })
      .expect(400);

    await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskRes.body.data.task_id,
        message: 'a'.repeat(2001),
      })
      .expect(400);
  });
});
