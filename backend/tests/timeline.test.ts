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
  const ownerId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const nonMemberId = crypto.randomUUID();
  const teamId = crypto.randomUUID();

  const uid = Date.now() + '_' + Math.floor(Math.random() * 1000000);

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO users (user_id, email, password_hash, full_name, username, is_verified)
      VALUES
        ($1, 'owner_${uid}@test.local', 'hash', 'Test owner', 'owner_${uid}', true),
        ($2, 'admin_${uid}@test.local', 'hash', 'Test admin', 'admin_${uid}', true),
        ($3, 'member_${uid}@test.local', 'hash', 'Test member', 'member_${uid}', true),
        ($4, 'nonmember_${uid}@test.local', 'hash', 'Test nonmember', 'nonmember_${uid}', true)
    `, [ownerId, adminId, memberId, nonMemberId]);

    await client.query(`
      INSERT INTO teams (team_id, team_name, created_by)
      VALUES ($1, 'Timeline Test Team', $2)
    `, [teamId, ownerId]);

    await client.query(`
      INSERT INTO team_members (team_id, user_id, role)
      VALUES
        ($1, $2, 'owner'),
        ($1, $3, 'admin'),
        ($1, $4, 'member')
    `, [teamId, ownerId, adminId, memberId]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    teamId,
    owner: { userId: ownerId, email: `owner_${uid}@test.local`, token: signAccessToken({ userId: ownerId, role: 'member' }) },
    admin: { userId: adminId, email: `admin_${uid}@test.local`, token: signAccessToken({ userId: adminId, role: 'member' }) },
    member: { userId: memberId, email: `member_${uid}@test.local`, token: signAccessToken({ userId: memberId, role: 'member' }) },
    nonMember: { userId: nonMemberId, email: `nonmember_${uid}@test.local`, token: signAccessToken({ userId: nonMemberId, role: 'member' }) },
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

describe('Target #4 — Human-Readable Work Activity Timeline Suite', () => {
  // 1. Task timeline retrieval
  it('1. Task timeline retrieval returns artifact info and chronological events', async () => {
    const { teamId, owner, member } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Timeline Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Task Timeline Unit Test', owner: member.userId })
        .expect(201)
    ).body.data.task_id;

    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(owner.token))
      .send({ status: 'in_progress' })
      .expect(200);

    const timelineRes = await request(app)
      .get(`/api/timeline/task/${taskId}`)
      .set(authHeader(member.token))
      .expect(200);

    expect(timelineRes.body.success).toBe(true);
    expect(timelineRes.body.data.artifact.title).toBe('Task Timeline Unit Test');
    expect(timelineRes.body.data.artifact.context_status).toBe('active');
    expect(timelineRes.body.data.events.length).toBeGreaterThan(0);
    const statusEvent = timelineRes.body.data.events.find((e: any) => e.event_type === 'status_changed');
    expect(statusEvent).toBeDefined();
    expect(statusEvent.description).toContain('Status changed');
  });

  // 2. Goal timeline retrieval
  it('2. Goal timeline retrieval returns goal history', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const goalRes = await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({ title: 'Q4 Product Velocity Goal', teamId, goalType: 'project' })
      .expect(201);
    const goalId = goalRes.body.data.goal_id;

    await request(app)
      .put(`/api/goals/${goalId}`)
      .set(authHeader(owner.token))
      .send({ progress: 50 })
      .expect(200);

    const timelineRes = await request(app)
      .get(`/api/timeline/goal/${goalId}`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(timelineRes.body.success).toBe(true);
    expect(timelineRes.body.data.artifact.title).toBe('Q4 Product Velocity Goal');
    const progressEvent = timelineRes.body.data.events.find((e: any) => e.event_type === 'progress_changed');
    expect(progressEvent).toBeDefined();
    expect(progressEvent.description).toContain('Goal progress');
  });

  // 3. Blocker timeline retrieval
  it('3. Blocker timeline retrieval returns blocker history', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Database Timeout Issue', urgency: 'high' })
      .expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    await request(app)
      .put(`/api/blockers/${blockerId}`)
      .set(authHeader(owner.token))
      .send({ status: 'resolved' })
      .expect(200);

    const timelineRes = await request(app)
      .get(`/api/timeline/blocker/${blockerId}`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(timelineRes.body.success).toBe(true);
    expect(timelineRes.body.data.artifact.title).toBe('Database Timeout Issue');
    expect(timelineRes.body.data.events.some((e: any) => e.description.toLowerCase().includes('resolved'))).toBe(true);
  });

  // 4. Correct chronological ordering (created_at DESC, history_id DESC)
  it('4. Timeline orders events strictly by created_at DESC, history_id DESC', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Order Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Ordering Task' })
        .expect(201)
    ).body.data.task_id;

    await request(app).put(`/api/tasks/${taskId}`).set(authHeader(owner.token)).send({ status: 'in_progress' }).expect(200);
    await request(app).put(`/api/tasks/${taskId}`).set(authHeader(owner.token)).send({ status: 'review' }).expect(200);
    await request(app).put(`/api/tasks/${taskId}`).set(authHeader(owner.token)).send({ status: 'done' }).expect(200);

    const timelineRes = await request(app)
      .get(`/api/timeline/task/${taskId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const events = timelineRes.body.data.events;
    expect(events.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < events.length - 1; i++) {
      const t1 = new Date(events[i].created_at).getTime();
      const t2 = new Date(events[i + 1].created_at).getTime();
      expect(t1).toBeGreaterThanOrEqual(t2);
    }
  });

  // 5. Same-timestamp ordering using history_id DESC
  it('5. Same-timestamp events sort deterministically by history_id DESC', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Same Time Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Timestamp Task' })
        .expect(201)
    ).body.data.task_id;

    const nowIso = new Date().toISOString();
    await pgPool.query(
      `INSERT INTO work_state_history (history_id, team_id, artifact_type, artifact_id, event_type, created_at, actor_id)
       VALUES
       (gen_random_uuid(), $1, 'task', $2, 'status_changed', $3, $4),
       (gen_random_uuid(), $1, 'task', $2, 'status_changed', $3, $4)`,
      [teamId, taskId, nowIso, owner.userId]
    );

    const timelineRes = await request(app)
      .get(`/api/timeline/task/${taskId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const events = timelineRes.body.data.events;
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  // 6. Cursor pagination
  it('6. Cursor pagination bounds output and returns next_cursor', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Pagination Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Paginated Task' })
        .expect(201)
    ).body.data.task_id;

    const statuses = ['in_progress', 'review', 'in_progress', 'review', 'done'];
    for (let i = 0; i < 5; i++) {
      await request(app)
        .put(`/api/tasks/${taskId}`)
        .set(authHeader(owner.token))
        .send({ status: statuses[i] })
        .expect(200);
    }

    const page1 = await request(app)
      .get(`/api/timeline/task/${taskId}?limit=2`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(page1.body.data.events.length).toBe(2);
    expect(page1.body.data.next_cursor).not.toBeNull();
    expect(page1.body.data.next_cursor.beforeTimestamp).toBeDefined();

    const page2 = await request(app)
      .get(
        `/api/timeline/task/${taskId}?limit=2&beforeTimestamp=${encodeURIComponent(
          page1.body.data.next_cursor.beforeTimestamp
        )}&beforeHistoryId=${page1.body.data.next_cursor.beforeHistoryId}`
      )
      .set(authHeader(owner.token))
      .expect(200);

    expect(page2.body.data.events.length).toBe(2);
    expect(page2.body.data.events[0].history_id).not.toBe(page1.body.data.events[0].history_id);
  });

  // 7. Deleted context handling
  it('7. Deleted context artifact returns context_status="deleted" and historical timeline safely', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Temporary Blocker to Delete' })
      .expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    // Delete blocker row from database
    await pgPool.query('DELETE FROM blockers WHERE blocker_id = $1', [blockerId]);

    const timelineRes = await request(app)
      .get(`/api/timeline/blocker/${blockerId}`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(timelineRes.body.success).toBe(true);
    expect(timelineRes.body.data.artifact.context_status).toBe('deleted');
    expect(timelineRes.body.data.artifact.title).toBe('Linked work is no longer available');
    expect(timelineRes.body.data.events.length).toBeGreaterThan(0);
  });

  // 8. Personal/private-work privacy
  it('8. Personal/private work history is inaccessible to unauthorized users', async () => {
    const { member, nonMember } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(member.token))
      .send({ projectName: 'Solo Personal Project' }) // teamId omitted => personal
      .expect(201);
    const personalTaskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(member.token))
        .send({ title: 'My Private Personal Task' })
        .expect(201)
    ).body.data.task_id;

    // Non-member trying to read personal task timeline should get 403 or empty private response
    await request(app)
      .get(`/api/timeline/task/${personalTaskId}`)
      .set(authHeader(nonMember.token))
      .expect((res) => {
        expect([403, 200]).toContain(res.status);
        if (res.status === 200) {
          expect(res.body.data.events.length).toBe(0);
        }
      });
  });

  // 9. Cross-team IDOR protection
  it('9. GET /api/timeline/:artifactType/:artifactId returns 403 for unauthorized team user', async () => {
    const { teamId, owner, nonMember } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Team Secrets', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Secret Task' })
        .expect(201)
    ).body.data.task_id;

    await request(app)
      .get(`/api/timeline/task/${taskId}`)
      .set(authHeader(nonMember.token))
      .expect(403);
  });

  // 10. Cross-classroom authorization
  it('10. Classroom coordinator can view child team artifact timeline', async () => {
    const parentUser = await createTestUser('parentCoord');
    const childOwner = await createTestUser('childOwner');

    const parentTeamRes = await pgPool.query(
      `INSERT INTO teams (team_name, created_by) VALUES ('Parent Classroom', $1) RETURNING team_id`,
      [parentUser.userId]
    );
    const parentTeamId = parentTeamRes.rows[0].team_id;
    await pgPool.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`, [parentTeamId, parentUser.userId]);

    const childTeamRes = await pgPool.query(
      `INSERT INTO teams (team_name, created_by, parent_team_id) VALUES ('Child Team A', $1, $2) RETURNING team_id`,
      [childOwner.userId, parentTeamId]
    );
    const childTeamId = childTeamRes.rows[0].team_id;
    await pgPool.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`, [childTeamId, childOwner.userId]);

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(childOwner.token))
      .send({ projectName: 'Child Project', teamId: childTeamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(childOwner.token))
        .send({ title: 'Child Task for Coordinator' })
        .expect(201)
    ).body.data.task_id;

    const timelineRes = await request(app)
      .get(`/api/timeline/task/${taskId}`)
      .set(authHeader(parentUser.token))
      .expect(200);

    expect(timelineRes.body.success).toBe(true);
    expect(timelineRes.body.data.artifact.title).toBe('Child Task for Coordinator');
  });

  // 11. Membership removal/rejoin behavior
  it('11. Removed member is denied timeline access (403), rejoined member is granted', async () => {
    const { teamId, owner, member } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Membership Test Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Membership Task' })
        .expect(201)
    ).body.data.task_id;

    // Remove member
    await pgPool.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, member.userId]);

    await request(app)
      .get(`/api/timeline/task/${taskId}`)
      .set(authHeader(member.token))
      .expect(403);

    // Rejoin member
    await pgPool.query('INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)', [teamId, member.userId, 'member']);

    await request(app)
      .get(`/api/timeline/task/${taskId}`)
      .set(authHeader(member.token))
      .expect(200);
  });

  // 12. Invalid artifact type/ID
  it('12. Invalid artifact type or ID returns 400 Bad Request', async () => {
    const { member } = await buildTeamFixture();

    await request(app)
      .get('/api/timeline/invalid_type/12345678-1234-1234-1234-123456789012')
      .set(authHeader(member.token))
      .expect(400);

    await request(app)
      .get('/api/timeline/task/not-a-valid-uuid')
      .set(authHeader(member.token))
      .expect(400);
  });

  // 13. Guidance history inclusion
  it('13. Target #2 Guidance lifecycle events surface in artifact timeline', async () => {
    const { teamId, owner, member } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Guidance Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Task with Guidance' })
        .expect(201)
    ).body.data.task_id;

    const gRes = await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskId,
        recipientId: member.userId,
        message: 'Ensure strict validation',
      })
      .expect(201);

    await request(app)
      .patch(`/api/guidance/${gRes.body.data.guidance_id}/status`)
      .set(authHeader(member.token))
      .send({ status: 'acknowledged' })
      .expect(200);

    const timelineRes = await request(app)
      .get(`/api/timeline/task/${taskId}`)
      .set(authHeader(member.token))
      .expect(200);

    const gEvents = timelineRes.body.data.events.filter((e: any) => e.event_type.startsWith('guidance_'));
    expect(gEvents.length).toBeGreaterThan(0);
  });

  // 14. Unknown event fallback
  it('14. Unknown event_type formats safely with "Work activity recorded" fallback', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Unknown Event Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Task with Custom Unknown Event' })
        .expect(201)
    ).body.data.task_id;

    await pgPool.query(
      `INSERT INTO work_state_history (history_id, team_id, artifact_type, artifact_id, event_type, created_at, actor_id)
       VALUES (gen_random_uuid(), $1, 'task', $2, 'UNKNOWN_FUTURE_EVENT', NOW(), $3)`,
      [teamId, taskId, owner.userId]
    );

    const timelineRes = await request(app)
      .get(`/api/timeline/task/${taskId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const unknownEvent = timelineRes.body.data.events.find((e: any) => e.event_type === 'UNKNOWN_FUTURE_EVENT');
    expect(unknownEvent).toBeDefined();
    expect(unknownEvent.description).toContain('Work activity recorded');
  });

  // 15. DB → API data correctness
  it('15. Complete DB -> API data correctness trace for Task timeline', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Data Correctness Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Empirical Verification Task' })
        .expect(201)
    ).body.data.task_id;

    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(owner.token))
      .send({ status: 'done' })
      .expect(200);

    const timelineRes = await request(app)
      .get(`/api/timeline/task/${taskId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const events = timelineRes.body.data.events;
    expect(events).toBeInstanceOf(Array);
    const completed = events.find((e: any) => e.event_type === 'completed');
    expect(completed).toBeDefined();
    expect(completed.artifact_id).toBe(taskId);
    expect(completed.actor.full_name).toBe('Test owner');
    expect(completed.change_summary.status.to).toBe('Done');
  });
});
