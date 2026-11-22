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
      VALUES ($1, 'Explainable Attention Team', $2)
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

describe('Target #5 — Explainable Attention & Work Signals Integration Suite', () => {
  // 1. Blocker Signal
  it('1. UNRESOLVED_BLOCKER signal is generated with structured evidence and actions', async () => {
    const { teamId, owner, member } = await buildTeamFixture();

    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(member.token))
      .send({ teamId, title: 'API Gateway Timeout Blocker', urgency: 'critical' })
      .expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.attention_status).toBe('AT_RISK');

    const blockerSig = res.body.data.signals.find((s: any) => s.signal_type === 'UNRESOLVED_BLOCKER');
    expect(blockerSig).toBeDefined();
    expect(blockerSig.signal_id).toBe(`UNRESOLVED_BLOCKER:blocker:${blockerId}`);
    expect(blockerSig.severity).toBe('critical');
    expect(blockerSig.supports_timeline).toBe(true);
    expect(blockerSig.supports_guidance).toBe(true);
    expect(blockerSig.evidence.some((e: any) => e.key === 'creator' && e.value === 'Test member')).toBe(true);
  });

  // 2. Stalled Task Signal
  it('2. STALLED_TASK signal is generated for tasks with no transition for > 5 days', async () => {
    const { teamId, owner, member } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Stalled Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Stalled Task Item', owner: member.userId })
        .expect(201)
    ).body.data.task_id;

    // Push task created_at and work_state_history created_at back 6 days
    await pgPool.query(`UPDATE tasks SET created_at = NOW() - INTERVAL '6 days' WHERE task_id = $1`, [taskId]);
    await pgPool.query(`UPDATE work_state_history SET created_at = NOW() - INTERVAL '6 days' WHERE artifact_id = $1`, [taskId]);

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(member.token))
      .expect(200);

    const stalledSig = res.body.data.signals.find((s: any) => s.signal_type === 'STALLED_TASK');
    expect(stalledSig).toBeDefined();
    expect(stalledSig.signal_id).toBe(`STALLED_TASK:task:${taskId}`);
    expect(stalledSig.supports_timeline).toBe(true);
    expect(stalledSig.supports_guidance).toBe(true);
    expect(stalledSig.evidence.some((e: any) => e.key === 'days_stalled')).toBe(true);
  });

  // 3. Overdue Task Signal
  it('3. OVERDUE_TASK signal is generated when project deadline is in the past', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const pastDeadline = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Overdue Project', teamId, deadline: pastDeadline })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Past Deadline Task' })
        .expect(201)
    ).body.data.task_id;

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const overdueSig = res.body.data.signals.find((s: any) => s.signal_type === 'OVERDUE_TASK');
    expect(overdueSig).toBeDefined();
    expect(overdueSig.signal_id).toBe(`OVERDUE_TASK:task:${taskId}`);
    expect(overdueSig.severity).toBe('high');
    expect(overdueSig.supports_timeline).toBe(true);
    expect(overdueSig.supports_guidance).toBe(true);
  });

  // 4. Reopened Work Signal
  it('4. REOPENED_WORK_FLAPPING signal is generated when task is reopened from done', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Flapping Project', teamId })
      .expect(201);
    const taskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Flapping Task' })
        .expect(201)
    ).body.data.task_id;

    await request(app).put(`/api/tasks/${taskId}`).set(authHeader(owner.token)).send({ status: 'done' }).expect(200);
    await request(app).put(`/api/tasks/${taskId}`).set(authHeader(owner.token)).send({ status: 'in_progress' }).expect(200);

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const reopenedSig = res.body.data.signals.find((s: any) => s.signal_type === 'REOPENED_WORK_FLAPPING');
    expect(reopenedSig).toBeDefined();
    expect(reopenedSig.signal_id).toBe(`REOPENED_WORK_FLAPPING:task:${taskId}`);
    expect(reopenedSig.supports_timeline).toBe(true);
  });

  // 5. Goal Progress Stalled Signal
  it('5. GOAL_PROGRESS_STALLED signal is generated for active goals with 0% progress', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const goalRes = await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({ title: 'Zero Progress Strategic Goal', teamId, goalType: 'project' })
      .expect(201);
    const goalId = goalRes.body.data.goal_id;

    // Set goal status = 'active'
    await pgPool.query(`UPDATE goals SET status = 'active', progress = 0 WHERE goal_id = $1`, [goalId]);

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const goalSig = res.body.data.signals.find((s: any) => s.signal_type === 'GOAL_PROGRESS_STALLED');
    expect(goalSig).toBeDefined();
    expect(goalSig.signal_id).toBe(`GOAL_PROGRESS_STALLED:goal:${goalId}`);
    expect(goalSig.supports_timeline).toBe(true);
    expect(goalSig.supports_guidance).toBe(true);
  });

  // 6. Missing Daily Submission Signal
  it('6. MISSING_DAILY_SUBMISSION signal is generated when team has active work but no submission today', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Active Work Project', teamId })
      .expect(201);
    await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Active Task' })
      .expect(201);

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const dailySig = res.body.data.signals.find((s: any) => s.signal_type === 'MISSING_DAILY_SUBMISSION');
    expect(dailySig).toBeDefined();
    expect(dailySig.signal_id).toBe(`MISSING_DAILY_SUBMISSION:daily_submission:${teamId}`);
    expect(dailySig.supports_timeline).toBe(false);
  });

  // 7. Pending Join Request Signal
  it('7. PENDING_JOIN_REQUEST signal is generated for unapproved membership requests', async () => {
    const { teamId, owner, nonMember } = await buildTeamFixture();

    const reqRes = await request(app)
      .post(`/api/teams/${teamId}/join`)
      .set(authHeader(nonMember.token))
      .expect(200);
    const requestId = reqRes.body.data.request_id;

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const joinSig = res.body.data.signals.find((s: any) => s.signal_type === 'PENDING_JOIN_REQUEST');
    expect(joinSig).toBeDefined();
    expect(joinSig.signal_id).toBe(`PENDING_JOIN_REQUEST:join_request:${requestId}`);
    expect(joinSig.severity).toBe('high');
  });

  // 8. Sub-Team At Risk Signal
  it('8. SUBTEAM_AT_RISK signal is generated in classroom scope for at-risk child teams', async () => {
    const parentUser = await createTestUser('parentAdmin');
    const childOwner = await createTestUser('childOwner');

    const parentTeamRes = await pgPool.query(
      `INSERT INTO teams (team_name, created_by) VALUES ('Parent Classroom', $1) RETURNING team_id`,
      [parentUser.userId]
    );
    const parentTeamId = parentTeamRes.rows[0].team_id;
    await pgPool.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`, [parentTeamId, parentUser.userId]);

    const childTeamRes = await pgPool.query(
      `INSERT INTO teams (team_name, created_by, parent_team_id) VALUES ('Child Team Risk', $1, $2) RETURNING team_id`,
      [childOwner.userId, parentTeamId]
    );
    const childTeamId = childTeamRes.rows[0].team_id;
    await pgPool.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`, [childTeamId, childOwner.userId]);

    // Create 2 open blockers in child team => AT_RISK
    await request(app).post('/api/blockers').set(authHeader(childOwner.token)).send({ teamId: childTeamId, title: 'Child Blocker 1', urgency: 'high' }).expect(201);
    await request(app).post('/api/blockers').set(authHeader(childOwner.token)).send({ teamId: childTeamId, title: 'Child Blocker 2', urgency: 'high' }).expect(201);

    const res = await request(app)
      .get(`/api/attention/classrooms/${parentTeamId}`)
      .set(authHeader(parentUser.token))
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.attention_status).toBe('AT_RISK');
    const subSig = res.body.data.signals.find((s: any) => s.signal_type === 'SUBTEAM_AT_RISK');
    expect(subSig).toBeDefined();
    expect(subSig.signal_id).toBe(`SUBTEAM_AT_RISK:team:${childTeamId}`);
    expect(subSig.severity).toBe('critical');
  });

  // 9. Exact evidence mapping
  it('9. Signals map exact DB attributes into evidence key-value arrays', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Database Outage Blocker', urgency: 'critical' })
      .expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const sig = res.body.data.signals.find((s: any) => s.signal_id === `UNRESOLVED_BLOCKER:blocker:${blockerId}`);
    expect(sig).toBeDefined();
    expect(sig.evidence).toBeInstanceOf(Array);
    const creatorEvidence = sig.evidence.find((e: any) => e.key === 'creator');
    expect(creatorEvidence.value).toBe('Test owner');
  });

  // 10. Multiple simultaneous signals & deterministic ordering
  it('10. Multiple signals combine and sort deterministically by severity then observed_at then signal_id', async () => {
    const { teamId, owner } = await buildTeamFixture();

    // Critical Blocker
    await request(app).post('/api/blockers').set(authHeader(owner.token)).send({ teamId, title: 'Critical Blocker A', urgency: 'critical' }).expect(201);
    // Goal progress stalled (low)
    const goalRes = await request(app).post('/api/goals').set(authHeader(owner.token)).send({ title: 'Low Goal A', teamId, goalType: 'project' }).expect(201);
    await pgPool.query(`UPDATE goals SET status = 'active', progress = 0 WHERE goal_id = $1`, [goalRes.body.data.goal_id]);

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const signals = res.body.data.signals;
    expect(signals.length).toBeGreaterThanOrEqual(2);
    // First signal must be critical blocker
    expect(signals[0].severity).toBe('critical');
    // Last signal must be low severity goal
    expect(signals[signals.length - 1].severity).toBe('low');
  });

  // 11. Signal disappearance after resolution
  it('11. Signal disappears immediately when underlying blocker is resolved', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Temporary Resolvable Blocker', urgency: 'high' })
      .expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    let res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(res.body.data.signals.some((s: any) => s.source_id === blockerId)).toBe(true);

    // Resolve blocker
    await request(app).put(`/api/blockers/${blockerId}`).set(authHeader(owner.token)).send({ status: 'resolved' }).expect(200);

    res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(res.body.data.signals.some((s: any) => s.source_id === blockerId)).toBe(false);
  });

  // 12. ON_TRACK evaluation
  it('12. ON_TRACK status returned when active work present with zero blockers or risks', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Smooth Project', teamId })
      .expect(201);
    await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Active Task' })
      .expect(201);

    // Submit daily work today directly into DB
    await pgPool.query(
      `INSERT INTO daily_work_submissions (submission_id, team_id, user_id, work_date, confirmed_summary)
       VALUES (gen_random_uuid(), $1, $2, CURRENT_DATE, 'Submitted today')`,
      [teamId, owner.userId]
    );

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(res.body.data.attention_status).toBe('ON_TRACK');
  });

  // 13. NO_ACTIVE_WORK evaluation
  it('13. NO_ACTIVE_WORK status returned when team has zero active tasks, goals, or blockers', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(res.body.data.attention_status).toBe('NO_ACTIVE_WORK');
    expect(res.body.data.signals.length).toBe(0);
  });

  // 14. Personal work privacy exclusion
  it('14. Personal work (team_id IS NULL) is excluded from team attention signals', async () => {
    const { teamId, owner, member } = await buildTeamFixture();

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(member.token))
      .send({ projectName: 'Personal Solo Project' }) // teamId omitted
      .expect(201);
    const personalTaskId = (
      await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(member.token))
        .send({ title: 'Personal Stalled Task' })
        .expect(201)
    ).body.data.task_id;

    await pgPool.query(`UPDATE tasks SET created_at = NOW() - INTERVAL '6 days' WHERE task_id = $1`, [personalTaskId]);
    await pgPool.query(`UPDATE work_state_history SET created_at = NOW() - INTERVAL '6 days' WHERE artifact_id = $1`, [personalTaskId]);

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(res.body.data.signals.some((s: any) => s.source_id === personalTaskId)).toBe(false);
  });

  // 15. Cross-team authorization (403 Forbidden)
  it('15. GET /api/attention/teams/:teamId returns 403 Forbidden for non-team member', async () => {
    const { teamId, nonMember } = await buildTeamFixture();

    await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(nonMember.token))
      .expect(403);
  });

  // 16. Cross-classroom authorization (403 Forbidden)
  it('16. GET /api/attention/classrooms/:teamId returns 403 Forbidden for non-coordinator', async () => {
    const { teamId, member } = await buildTeamFixture();

    await request(app)
      .get(`/api/attention/classrooms/${teamId}`)
      .set(authHeader(member.token))
      .expect(403);
  });

  // 17. Timeline Linkage Flag
  it('17. Task, Goal, and Blocker signals specify supports_timeline=true', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Linkage Blocker', urgency: 'high' })
      .expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const sig = res.body.data.signals.find((s: any) => s.source_id === blockerId);
    expect(sig.supports_timeline).toBe(true);
    expect(sig.supports_guidance).toBe(true);
  });

  // 18. Guidance Eligibility Flag
  it('18. Task and Goal signals specify supports_guidance=true', async () => {
    const { teamId, owner } = await buildTeamFixture();

    const goalRes = await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({ title: 'Eligible Guidance Goal', teamId, goalType: 'project' })
      .expect(201);
    const goalId = goalRes.body.data.goal_id;
    await pgPool.query(`UPDATE goals SET status = 'active', progress = 0 WHERE goal_id = $1`, [goalId]);

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const sig = res.body.data.signals.find((s: any) => s.source_id === goalId);
    expect(sig).toBeDefined();
    expect(sig.supports_guidance).toBe(true);
  });

  // 19. Individual Scope Attention (/api/attention/me)
  it('19. GET /api/attention/me surfaces individual work attention signals with deterministic signal_ids', async () => {
    const { teamId, member } = await buildTeamFixture();

    const blockerRes = await request(app)
      .post('/api/blockers')
      .set(authHeader(member.token))
      .send({ teamId, title: 'My Personal SOS Blocker', urgency: 'high' })
      .expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    const res = await request(app)
      .get('/api/attention/me')
      .set(authHeader(member.token))
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.scope).toBe('INDIVIDUAL');
    expect(res.body.data.signals).toBeInstanceOf(Array);
    const mySig = res.body.data.signals.find((s: any) => s.source_id === blockerId);
    expect(mySig).toBeDefined();
    expect(mySig.signal_id).toBe(`UNRESOLVED_BLOCKER:blocker:${blockerId}`);
  });

  // 20. Additive API response backwards compatibility
  it('20. API response retains legacy items, reasons, and summary alongside new signals array', async () => {
    const { teamId, owner } = await buildTeamFixture();

    await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Legacy Compatibility Blocker', urgency: 'high' })
      .expect(201);

    const res = await request(app)
      .get(`/api/attention/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    expect(res.body.data.attention_status).toBeDefined();
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.signals).toBeInstanceOf(Array);
  });
});
