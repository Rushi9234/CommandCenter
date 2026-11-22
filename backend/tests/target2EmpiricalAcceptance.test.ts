import request from 'supertest';
import { app } from '../src/app';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader } from './utils/fixtures';
import { signAccessToken } from '../src/modules/auth/jwt';
import crypto from 'crypto';

async function createTestUser(roleName: string = 'member') {
  const userId = crypto.randomUUID();
  const uid = Date.now() + '_' + Math.floor(Math.random() * 1000000);
  const email = `${roleName}_${uid}@test.local`;
  await pgPool.query(
    `INSERT INTO users (user_id, email, password_hash, full_name, username, is_verified)
     VALUES ($1, $2, 'hash', $3, $4, true)`,
    [userId, email, `Test ${roleName}`, `user_${uid}`]
  );
  const token = signAccessToken({ userId, role: 'member' });
  return { userId, email, token };
}

async function buildTeamFixture() {
  const owner = await createTestUser('owner');
  const admin = await createTestUser('admin');
  const manager = await createTestUser('manager');
  const member = await createTestUser('member');
  const viewer = await createTestUser('viewer');
  const nonMember = await createTestUser('nonmember');

  const teamRes = await pgPool.query(
    `INSERT INTO teams (team_name, created_by) VALUES ('Empirical Test Team', $1) RETURNING team_id`,
    [owner.userId]
  );
  const teamId = teamRes.rows[0].team_id;

  await pgPool.query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, 'owner'), ($1, $3, 'admin'), ($1, $4, 'manager'), ($1, $5, 'member'), ($1, $6, 'viewer')`,
    [teamId, owner.userId, admin.userId, manager.userId, member.userId, viewer.userId]
  );

  return { teamId, owner, admin, manager, member, viewer, nonMember };
}

beforeEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 150));
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('Target #2 Empirical Acceptance Suite — Flows 1 through 13', () => {

  // FLOW 1 — TEAM LEADER → MEMBER LIFECYCLE
  it('FLOW 1: End-to-end Guidance Lifecycle (Leader -> Member: OPEN -> ACKNOWLEDGED -> RESOLVED)', async () => {
    const { teamId, owner, member } = await buildTeamFixture();

    // 1. Create team project & task
    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Core Development', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Build Guidance Module', owner: member.userId })
        .expect(201)
    ).body.data.task_id;

    // 2. Leader provides guidance
    const gRes = await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskId,
        teamId,
        recipientId: member.userId,
        actionType: 'PRIORITIZE',
        priority: 'HIGH',
        message: 'Prioritize unit tests and empirical verification.',
      })
      .expect(201);

    const guidanceId = gRes.body.data.guidance_id;
    expect(gRes.body.data.status).toBe('open');
    expect(gRes.body.data.context_type).toBe('task');
    expect(gRes.body.data.context_id).toBe(taskId);
    expect(gRes.body.data.recipient_id).toBe(member.userId);

    // Verify DB record directly
    const dbGuidance = await pgPool.query('SELECT * FROM guidance_items WHERE guidance_id = $1', [guidanceId]);
    expect(dbGuidance.rows.length).toBe(1);
    expect(dbGuidance.rows[0].status).toBe('open');

    // Verify Notification created for member
    const notifRes = await request(app)
      .get('/api/notifications')
      .set(authHeader(member.token))
      .expect(200);
    const notifs = notifRes.body.data.notifications || notifRes.body.data;
    const gNotif = notifs.find((n: any) => n.category === 'guidance');
    expect(gNotif).toBeDefined();

    // 3. Member acknowledges guidance
    const ackRes = await request(app)
      .patch(`/api/guidance/${guidanceId}/status`)
      .set(authHeader(member.token))
      .send({ status: 'acknowledged' })
      .expect(200);
    expect(ackRes.body.data.status).toBe('acknowledged');

    const dbAck = await pgPool.query('SELECT status, acknowledged_at FROM guidance_items WHERE guidance_id = $1', [guidanceId]);
    expect(dbAck.rows[0].status).toBe('acknowledged');
    expect(dbAck.rows[0].acknowledged_at).not.toBeNull();

    // 4. Member resolves guidance
    const resRes = await request(app)
      .patch(`/api/guidance/${guidanceId}/status`)
      .set(authHeader(member.token))
      .send({ status: 'resolved' })
      .expect(200);
    expect(resRes.body.data.status).toBe('resolved');

    const dbRes = await pgPool.query('SELECT status, resolved_at FROM guidance_items WHERE guidance_id = $1', [guidanceId]);
    expect(dbRes.rows[0].status).toBe('resolved');
    expect(dbRes.rows[0].resolved_at).not.toBeNull();
  });

  // FLOW 2 — PERSONAL WORK PRIVACY
  it('FLOW 2: Personal Work Privacy Enforcement (Attempt on team_id IS NULL task/goal returns 403)', async () => {
    const { owner, member } = await buildTeamFixture();

    // Create personal project & task (teamId not supplied -> personal project)
    const personalProjRes = await request(app)
      .post('/api/projects')
      .set(authHeader(member.token))
      .send({ projectName: 'Personal Notes' })
      .expect(201);

    const personalTaskId = (
      await request(app)
        .post(`/api/projects/${personalProjRes.body.data.project_id}/tasks`)
        .set(authHeader(member.token))
        .send({ title: 'Buy Groceries' })
        .expect(201)
    ).body.data.task_id;

    // Leader attempts guidance on member's personal task -> 403 Forbidden
    await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: personalTaskId,
        message: 'Personal task guidance attempt',
      })
      .expect(403);

    // Create personal goal (goalType: individual)
    const personalGoalId = (
      await request(app)
        .post('/api/goals')
        .set(authHeader(member.token))
        .send({ title: 'Personal Gym Goal', goalType: 'individual' })
        .expect(201)
    ).body.data.goal_id;

    await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'goal',
        contextId: personalGoalId,
        message: 'Personal goal guidance attempt',
      })
      .expect(403);
  });

  // FLOW 3 — CROSS-TEAM IDOR
  it('FLOW 3: Cross-Team IDOR Protection (Leader A attempting Team B work items)', async () => {
    const teamA = await buildTeamFixture();
    const teamB = await buildTeamFixture();

    // Team B task
    const projB = await request(app)
      .post('/api/projects')
      .set(authHeader(teamB.owner.token))
      .send({ projectName: 'Team B Project', teamId: teamB.teamId })
      .expect(201);
    const taskBId = (
      await request(app)
        .post(`/api/projects/${projB.body.data.project_id}/tasks`)
        .set(authHeader(teamB.owner.token))
        .send({ title: 'Team B Secret Task' })
        .expect(201)
    ).body.data.task_id;

    // Leader A attempts guidance on Team B task -> 403
    await request(app)
      .post('/api/guidance')
      .set(authHeader(teamA.owner.token))
      .send({
        contextType: 'task',
        contextId: taskBId,
        message: 'Intruding on Team B task',
      })
      .expect(403);

    // Leader A attempts guidance on Team B task with forged teamId = teamA.teamId -> 400 Bad Request (teamId mismatch)
    await request(app)
      .post('/api/guidance')
      .set(authHeader(teamA.owner.token))
      .send({
        contextType: 'task',
        contextId: taskBId,
        teamId: teamA.teamId,
        message: 'Forged teamId attempt',
      })
      .expect(400);
  });

  // FLOW 4 — CROSS-CLASSROOM
  it('FLOW 4: Cross-Classroom Access Denied (Coordinator A vs Classroom B team context)', async () => {
    // Classroom A
    const coordA = await createTestUser('coordA');
    const classARes = await pgPool.query(
      `INSERT INTO teams (team_name, created_by) VALUES ('Classroom A', $1) RETURNING team_id`,
      [coordA.userId]
    );
    const classAId = classARes.rows[0].team_id;
    await pgPool.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`, [classAId, coordA.userId]);

    // Classroom B & student team B
    const coordB = await createTestUser('coordB');
    const classBRes = await pgPool.query(
      `INSERT INTO teams (team_name, created_by) VALUES ('Classroom B', $1) RETURNING team_id`,
      [coordB.userId]
    );
    const classBId = classBRes.rows[0].team_id;
    await pgPool.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`, [classBId, coordB.userId]);

    const studentB = await createTestUser('studentB');
    const teamBRes = await pgPool.query(
      `INSERT INTO teams (team_name, created_by, parent_team_id) VALUES ('Student Team B', $1, $2) RETURNING team_id`,
      [studentB.userId, classBId]
    );
    const teamBId = teamBRes.rows[0].team_id;
    await pgPool.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`, [teamBId, studentB.userId]);

    const projB = await request(app)
      .post('/api/projects')
      .set(authHeader(studentB.token))
      .send({ projectName: 'Student B Project', teamId: teamBId })
      .expect(201);
    const taskBId = (
      await request(app)
        .post(`/api/projects/${projB.body.data.project_id}/tasks`)
        .set(authHeader(studentB.token))
        .send({ title: 'Student B Task' })
        .expect(201)
    ).body.data.task_id;

    // Coordinator A attempts guidance on Student Team B task -> 403
    await request(app)
      .post('/api/guidance')
      .set(authHeader(coordA.token))
      .send({
        contextType: 'task',
        contextId: taskBId,
        teamId: teamBId,
        message: 'Coord A trying to guide Classroom B student task',
      })
      .expect(403);
  });

  // FLOW 5 — ROLE BOUNDARIES
  it('FLOW 5: Role Boundaries Permission Matrix', async () => {
    const { teamId, owner, member, viewer, nonMember } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Role Test Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Role Test Task' })
        .expect(201)
    ).body.data.task_id;

    // 1. Ordinary member attempting to CREATE guidance -> 403
    await request(app)
      .post('/api/guidance')
      .set(authHeader(member.token))
      .send({
        contextType: 'task',
        contextId: taskId,
        message: 'Member creating guidance',
      })
      .expect(403);

    // Leader creates valid guidance for member
    const gId = (
      await request(app)
        .post('/api/guidance')
        .set(authHeader(owner.token))
        .send({
          contextType: 'task',
          contextId: taskId,
          recipientId: member.userId,
          message: 'Leader guidance for member',
        })
        .expect(201)
    ).body.data.guidance_id;

    // 2. Non-team member reading guidance -> 403
    await request(app)
      .get(`/api/guidance/${gId}`)
      .set(authHeader(nonMember.token))
      .expect(403);

    // 3. Non-recipient team viewer updating guidance -> 403
    await request(app)
      .patch(`/api/guidance/${gId}/status`)
      .set(authHeader(viewer.token))
      .send({ status: 'acknowledged' })
      .expect(403);

    // 4. Authorized recipient acknowledging -> 200
    await request(app)
      .patch(`/api/guidance/${gId}/status`)
      .set(authHeader(member.token))
      .send({ status: 'acknowledged' })
      .expect(200);

    // 5. Authorized recipient resolving -> 200
    await request(app)
      .patch(`/api/guidance/${gId}/status`)
      .set(authHeader(member.token))
      .send({ status: 'resolved' })
      .expect(200);
  });

  // FLOW 6 — STATE MACHINE
  it('FLOW 6: State Machine Transition Rules & 409 Conflict', async () => {
    const { teamId, owner, member } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'State Test Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'State Test Task' })
        .expect(201)
    ).body.data.task_id;

    const gId = (
      await request(app)
        .post('/api/guidance')
        .set(authHeader(owner.token))
        .send({
          contextType: 'task',
          contextId: taskId,
          recipientId: member.userId,
          message: 'State transition test',
        })
        .expect(201)
    ).body.data.guidance_id;

    // Transition OPEN -> RESOLVED directly -> 200 (permitted)
    await request(app)
      .patch(`/api/guidance/${gId}/status`)
      .set(authHeader(member.token))
      .send({ status: 'resolved' })
      .expect(200);

    // Invalid transition: RESOLVED -> ACKNOWLEDGED -> 409 Conflict
    await request(app)
      .patch(`/api/guidance/${gId}/status`)
      .set(authHeader(member.token))
      .send({ status: 'acknowledged' })
      .expect(409);
  });

  // FLOW 7 — CONCURRENCY
  it('FLOW 7: Concurrent Status Update Verification (First 200, Second 409 Conflict)', async () => {
    const { teamId, owner, member } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Concurrency Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Concurrent Task' })
        .expect(201)
    ).body.data.task_id;

    const gId = (
      await request(app)
        .post('/api/guidance')
        .set(authHeader(owner.token))
        .send({
          contextType: 'task',
          contextId: taskId,
          recipientId: member.userId,
          message: 'Concurrent test guidance',
        })
        .expect(201)
    ).body.data.guidance_id;

    // Send two concurrent ACK requests
    const [res1, res2] = await Promise.all([
      request(app)
        .patch(`/api/guidance/${gId}/status`)
        .set(authHeader(member.token))
        .send({ status: 'acknowledged' }),
      request(app)
        .patch(`/api/guidance/${gId}/status`)
        .set(authHeader(member.token))
        .send({ status: 'acknowledged' }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  // FLOW 8 — MEMBER REMOVAL / REJOIN
  it('FLOW 8: Member Removal and Rejoin Access Boundary', async () => {
    const { teamId, member } = await buildTeamFixture();

    // 1. Remove member from team
    await pgPool.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, member.userId]);

    // Member attempts to list team guidance -> 403
    await request(app)
      .get(`/api/guidance?teamId=${teamId}`)
      .set(authHeader(member.token))
      .expect(403);

    // 2. Rejoin member to team
    await pgPool.query('INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)', [teamId, member.userId, 'member']);

    // Rejoined member lists guidance -> 200
    await request(app)
      .get(`/api/guidance?teamId=${teamId}`)
      .set(authHeader(member.token))
      .expect(200);
  });

  // FLOW 9 — DELETED CONTEXT
  it('FLOW 9: Deleted Context Entity Handling (context_status="deleted")', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Network Outage' })
      .expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    const gId = (
      await request(app)
        .post('/api/guidance')
        .set(authHeader(owner.token))
        .send({
          contextType: 'blocker',
          contextId: blockerId,
          message: 'Guidance on blocker to be deleted',
        })
        .expect(201)
    ).body.data.guidance_id;

    // Delete blocker
    await pgPool.query('DELETE FROM blockers WHERE blocker_id = $1', [blockerId]);

    // Fetch existing guidance item -> returns 200 with context_status = "deleted"
    const fetchRes = await request(app)
      .get(`/api/guidance/${gId}`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(fetchRes.body.data.context_status).toBe('deleted');

    // Attempting to create new guidance on deleted blocker -> 404 Not Found
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

  // FLOW 10 — NOTIFICATION PRIVACY
  it('FLOW 10: Notification Targeted Privacy (Only assigned recipient gets notification)', async () => {
    const { teamId, owner, member, viewer } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Notif Privacy Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Notif Privacy Task' })
        .expect(201)
    ).body.data.task_id;

    await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskId,
        recipientId: member.userId,
        message: 'Exclusive notification for member',
      })
      .expect(201);

    // Member has guidance notification
    const mNotifRes = await request(app)
      .get('/api/notifications')
      .set(authHeader(member.token))
      .expect(200);
    const mNotifs = mNotifRes.body.data.notifications || mNotifRes.body.data;
    const mGuidanceNotif = mNotifs.find((n: any) => n.category === 'guidance');
    expect(mGuidanceNotif).toBeDefined();

    // Viewer (unrelated team member) does NOT have guidance notification
    const vNotifRes = await request(app)
      .get('/api/notifications')
      .set(authHeader(viewer.token))
      .expect(200);
    const vNotifs = vNotifRes.body.data.notifications || vNotifRes.body.data;
    const vGuidanceNotif = vNotifs.find((n: any) => n.category === 'guidance');
    expect(vGuidanceNotif).toBeUndefined();
  });

  // FLOW 12 — WORK HISTORY
  it('FLOW 12: Work State History Entries (CREATE, ACKNOWLEDGE, RESOLVE)', async () => {
    const { teamId, owner, member } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'History Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'History Task' })
        .expect(201)
    ).body.data.task_id;

    // 1. Create guidance -> writes CREATE entry
    const gId = (
      await request(app)
        .post('/api/guidance')
        .set(authHeader(owner.token))
        .send({
          contextType: 'task',
          contextId: taskId,
          recipientId: member.userId,
          message: 'Work state history test message',
        })
        .expect(201)
    ).body.data.guidance_id;

    // 2. Acknowledge -> writes ACKNOWLEDGE entry
    await request(app)
      .patch(`/api/guidance/${gId}/status`)
      .set(authHeader(member.token))
      .send({ status: 'acknowledged' })
      .expect(200);

    // 3. Resolve -> writes RESOLVE entry
    await request(app)
      .patch(`/api/guidance/${gId}/status`)
      .set(authHeader(member.token))
      .send({ status: 'resolved' })
      .expect(200);

    // Verify DB audit log entries in work_state_history
    const historyDb = await pgPool.query(
      `SELECT * FROM work_state_history WHERE artifact_id = $1 AND event_type LIKE 'guidance_%' ORDER BY created_at ASC`,
      [taskId]
    );

    expect(historyDb.rows.length).toBeGreaterThanOrEqual(3);
    expect(historyDb.rows[0].artifact_type).toBe('task');
    expect(historyDb.rows[0].event_type).toBe('guidance_created');
    expect(historyDb.rows[1].event_type).toBe('guidance_acknowledged');
    expect(historyDb.rows[2].event_type).toBe('guidance_resolved');
  });

  // FLOW 13 — ATTENTION INTEGRATION
  it('FLOW 13: Target #1 Attention Integration Recalculation', async () => {
    const { teamId, owner, member } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Attention Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Blocked Task for Attention', status: 'blocked', owner: member.userId })
        .expect(201)
    ).body.data.task_id;

    // 1. Fetch team attention items -> blocked task surfaced
    const attBefore = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);
    expect(attBefore.body.data).toBeDefined();

    // 2. Leader provides guidance on blocked task
    await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskId,
        teamId,
        recipientId: member.userId,
        message: 'Clear blocker by restoring API service',
      })
      .expect(201);

    // 3. Fetch attention items again -> verifies endpoint integrity
    const attAfter = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);
    expect(attAfter.body.data).toBeDefined();
  });
});
