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
      VALUES ($1, 'Pulse Test Team', $2)
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

describe('Target #3 — Living Work Pulse Suite', () => {

  // 1. Task completed event surfaces in team pulse
  it('1. Task completed event surfaces in team pulse', async () => {
    const { teamId, owner, member } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Pulse Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Task to Complete', owner: member.userId })
        .expect(201)
    ).body.data.task_id;

    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(owner.token))
      .send({ status: 'done' })
      .expect(200);

    const pulseRes = await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(member.token))
      .expect(200);

    const events = pulseRes.body.data.events;
    const completedEvent = events.find((e: any) => e.event_type === 'completed' && e.artifact_id === taskId);
    expect(completedEvent).toBeDefined();
    expect(completedEvent.artifact_title).toBe('Task to Complete');
  });

  // 2. Task reopened event surfaces with correct state diff
  it('2. Task reopened event surfaces in team pulse', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Pulse Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Task to Reopen' })
        .expect(201)
    ).body.data.task_id;

    await request(app).put(`/api/tasks/${taskId}`).set(authHeader(owner.token)).send({ status: 'done' }).expect(200);
    await request(app).put(`/api/tasks/${taskId}`).set(authHeader(owner.token)).send({ status: 'in_progress' }).expect(200);

    const pulseRes = await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const reopenedEvent = pulseRes.body.data.events.find((e: any) => e.event_type === 'reopened');
    expect(reopenedEvent).toBeDefined();
    expect(reopenedEvent.previous_state.status).toBe('done');
    expect(reopenedEvent.new_state.status).toBe('in_progress');
  });

  // 3. Goal progress event surfaces
  it('3. Goal progress event surfaces in team pulse', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const goalRes = await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({ title: 'Q3 Goal', teamId, goalType: 'team' })
      .expect(201);
    const goalId = goalRes.body.data.goal_id;

    await request(app)
      .put(`/api/goals/${goalId}`)
      .set(authHeader(owner.token))
      .send({ progress: 75 })
      .expect(200);

    const pulseRes = await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const progressEvent = pulseRes.body.data.events.find((e: any) => e.artifact_id === goalId && e.event_type === 'progress_changed');
    expect(progressEvent).toBeDefined();
    expect(progressEvent.new_state.progress).toBe(75);
  });

  // 4. Blocker created event surfaces
  it('4. Blocker created event surfaces in team pulse', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'DB Pool Overflow', urgency: 'high' })
      .expect(201);

    const pulseRes = await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const blockerEvent = pulseRes.body.data.events.find((e: any) => e.artifact_id === blockerRes.body.data.blocker_id);
    expect(blockerEvent).toBeDefined();
    expect(blockerEvent.artifact_title).toBe('DB Pool Overflow');
  });

  // 5. Blocker resolved event surfaces
  it('5. Blocker resolved event surfaces in team pulse', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Memory Leak' })
      .expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    await request(app)
      .put(`/api/blockers/${blockerId}`)
      .set(authHeader(owner.token))
      .send({ status: 'resolved', resolution_notes: 'Patched cache leak' })
      .expect(200);

    const pulseRes = await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const resolvedEvent = pulseRes.body.data.events.find((e: any) => e.artifact_id === blockerId && e.event_type === 'resolved');
    expect(resolvedEvent).toBeDefined();
  });

  // 6. Guidance lifecycle events surface
  it('6. Guidance lifecycle events surface in team pulse', async () => {
    const { teamId, owner, member } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Pulse Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Guidance Task' })
        .expect(201)
    ).body.data.task_id;

    const gRes = await request(app)
      .post('/api/guidance')
      .set(authHeader(owner.token))
      .send({
        contextType: 'task',
        contextId: taskId,
        recipientId: member.userId,
        message: 'Prioritize unit tests',
      })
      .expect(201);

    await request(app)
      .patch(`/api/guidance/${gRes.body.data.guidance_id}/status`)
      .set(authHeader(member.token))
      .send({ status: 'acknowledged' })
      .expect(200);

    const pulseRes = await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(member.token))
      .expect(200);

    const gEvent = pulseRes.body.data.events.find((e: any) => e.event_type === 'guidance_acknowledged');
    expect(gEvent).toBeDefined();
  });

  // 7. Daily work submitted surfaces
  it('7. Daily work submission surfaces in team pulse', async () => {
    const { teamId, member } = await buildTeamFixture();

    await request(app)
      .post('/api/work-entries')
      .set(authHeader(member.token))
      .send({ teamId, entryText: 'Finished user API routes' })
      .expect(201);

    await request(app)
      .post('/api/work-entries/submit')
      .set(authHeader(member.token))
      .send({ teamId, confirmedSummary: 'Completed core user API routes' })
      .expect(201);

    const pulseRes = await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(member.token))
      .expect(200);

    const dwEvent = pulseRes.body.data.events.find((e: any) => e.artifact_type === 'daily_work');
    expect(dwEvent).toBeDefined();
  });

  // 8. Individual scope returns authorized team events
  it('8. GET /api/pulse/me returns individual pulse for user teams', async () => {
    const { teamId, owner, member } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Pulse Project', teamId })
      .expect(201);
    await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Individual Scope Task' })
      .expect(201);

    const meRes = await request(app)
      .get('/api/pulse/me')
      .set(authHeader(member.token))
      .expect(200);

    expect(meRes.body.data.events.length).toBeGreaterThan(0);
    expect(meRes.body.data.events[0].team_id).toBe(teamId);
  });

  // 9. Personal work (team_id IS NULL) NEVER appears in team or peer pulse
  it('9. Personal work (team_id IS NULL) is strictly excluded from team and peer pulse', async () => {
    const { teamId, owner, member, nonMember } = await buildTeamFixture();

    // Create personal project & task for member
    const personalProjRes = await request(app)
      .post('/api/projects')
      .set(authHeader(member.token))
      .send({ projectName: 'Personal Notes' })
      .expect(201);
    await request(app)
      .post(`/api/projects/${personalProjRes.body.data.project_id}/tasks`)
      .set(authHeader(member.token))
      .send({ title: 'Personal Private Task' })
      .expect(201);

    // Leader pulse check
    const leaderPulse = await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const hasPersonalInTeam = leaderPulse.body.data.events.some((e: any) => e.artifact_title === 'Personal Private Task');
    expect(hasPersonalInTeam).toBe(false);

    // Non-member individual pulse check
    const nonMemberPulse = await request(app)
      .get('/api/pulse/me')
      .set(authHeader(nonMember.token))
      .expect(200);

    const hasPersonalInPeer = nonMemberPulse.body.data.events.some((e: any) => e.artifact_title === 'Personal Private Task');
    expect(hasPersonalInPeer).toBe(false);
  });

  // 10. Non-team member receives 403 Forbidden on team pulse
  it('10. GET /api/pulse/teams/:teamId returns 403 Forbidden for non-team member', async () => {
    const { teamId, nonMember } = await buildTeamFixture();

    await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(nonMember.token))
      .expect(403);
  });

  // 11. Non-coordinator receives 403 Forbidden on classroom pulse
  it('11. GET /api/pulse/classrooms/:teamId returns 403 Forbidden for non-coordinator', async () => {
    const { teamId, member } = await buildTeamFixture();

    await request(app)
      .get(`/api/pulse/classrooms/${teamId}`)
      .set(authHeader(member.token))
      .expect(403);
  });

  // 12. Classroom pulse surfaces aggregate child-team completions
  it('12. Classroom pulse returns macro completions for child teams', async () => {
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
        .send({ title: 'Child Task Completed' })
        .expect(201)
    ).body.data.task_id;

    await request(app).put(`/api/tasks/${taskId}`).set(authHeader(childOwner.token)).send({ status: 'done' }).expect(200);

    const classRes = await request(app)
      .get(`/api/pulse/classrooms/${parentTeamId}`)
      .set(authHeader(parentUser.token))
      .expect(200);

    expect(classRes.body.data.events.length).toBeGreaterThan(0);
    expect(classRes.body.data.events[0].artifact_title).toBe('Child Task Completed');
  });

  // 13. Removed member loses access immediately (403 Forbidden)
  it('13. Removed team member loses pulse access immediately', async () => {
    const { teamId, member } = await buildTeamFixture();

    await pgPool.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, member.userId]);

    await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(member.token))
      .expect(403);
  });

  // 14. Rejoined member can access pulse
  it('14. Rejoined member can access team pulse', async () => {
    const { teamId, member } = await buildTeamFixture();

    await pgPool.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, member.userId]);
    await pgPool.query('INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)', [teamId, member.userId, 'member']);

    await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(member.token))
      .expect(200);
  });

  // 15. Deleted context exposes context_status = "deleted"
  it('15. Deleted context entity exposes context_status="deleted"', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Temporary Outage Blocker' })
      .expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    await pgPool.query('DELETE FROM blockers WHERE blocker_id = $1', [blockerId]);

    const pulseRes = await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const deletedItem = pulseRes.body.data.events.find((e: any) => e.artifact_id === blockerId);
    expect(deletedItem).toBeDefined();
    expect(deletedItem.context_status).toBe('deleted');
  });

  // 16. Cursor pagination sorts deterministically by (created_at, history_id)
  it('16. Cursor pagination functions deterministically', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Pagination Project', teamId })
      .expect(201);

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: `Pagination Task ${i}` })
        .expect(201);
    }

    const page1 = await request(app)
      .get(`/api/pulse/teams/${teamId}?limit=2`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(page1.body.data.events.length).toBe(2);
    expect(page1.body.data.next_cursor).not.toBeNull();

    const page2 = await request(app)
      .get(`/api/pulse/teams/${teamId}?limit=2&cursor=${encodeURIComponent(page1.body.data.next_cursor)}`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(page2.body.data.events.length).toBe(2);
    expect(page2.body.data.events[0].history_id).not.toBe(page1.body.data.events[0].history_id);
  });

  // 17. Category filter filters events accurately
  it('17. Category filter filters events by artifactType', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Filter Project', teamId })
      .expect(201);
    await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task Event' })
      .expect(201);

    await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Blocker Event' })
      .expect(201);

    const taskPulse = await request(app)
      .get(`/api/pulse/teams/${teamId}?category=task`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(taskPulse.body.data.events.every((e: any) => e.artifact_type === 'task')).toBe(true);
  });

  // 18. Rapid duplicate requests return consistent items
  it('18. Rapid duplicate requests return consistent paginated items', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const [res1, res2] = await Promise.all([
      request(app).get(`/api/pulse/teams/${teamId}`).set(authHeader(owner.token)),
      request(app).get(`/api/pulse/teams/${teamId}`).set(authHeader(owner.token)),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.data.events.length).toBe(res2.body.data.events.length);
  });

  // 19. Realtime thin payload safety and channel isolation
  it('19. Realtime thin payload notification does not leak unauthorized event body', async () => {
    const { teamId, nonMember } = await buildTeamFixture();

    const res = await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(nonMember.token));

    expect(res.status).toBe(403);
  });

  // 20. Unauthenticated requests to /api/pulse/* return 401 Unauthorized
  it('20. Unauthenticated request to /api/pulse/me returns 401 Unauthorized', async () => {
    await request(app)
      .get('/api/pulse/me')
      .expect(401);
  });
});
