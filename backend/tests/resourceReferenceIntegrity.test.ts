import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, addMember, registerAndLogin, buildTeamWithRoles } from './utils/fixtures';
import { teamsRepository } from '../src/modules/teams/teams.repository';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

// ---------------------------------------------------------------------------
// Task reference integrity
// ---------------------------------------------------------------------------

describe('Milestone 39 -- task owner/reviewer/contributors must be members of the project\'s team', () => {
  const createProjectAndTask = async (ownerToken: string, teamId: string, taskBody: Record<string, any> = {}) => {
    const projectRes = await request(app)
      .post('/api/projects')
      .set(authHeader(ownerToken))
      .send({ projectName: 'M39 Project', teamId })
      .expect(201);
    const projectId = projectRes.body.data.project_id;

    const taskRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(ownerToken))
      .send({ title: 'M39 Task', ...taskBody });

    return { projectId, taskRes };
  };

  it('a valid same-team member as owner/reviewer/contributor succeeds', async () => {
    const { teamId, owner, admin, manager, member } = await buildTeamWithRoles();

    const { taskRes } = await createProjectAndTask(owner.token, teamId, {
      owner: admin.userId,
      reviewer: manager.userId,
      contributors: [member.userId],
    });

    expect(taskRes.status).toBe(201);
    expect(taskRes.body.data.owner).toBe(admin.userId);
    expect(taskRes.body.data.reviewer).toBe(manager.userId);
  });

  it('rejects a nonexistent user as owner, and no task is created', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const fakeUserId = '00000000-0000-0000-0000-000000000000';

    const { projectId, taskRes } = await createProjectAndTask(owner.token, teamId, { owner: fakeUserId });

    expect(taskRes.status).toBe(400);
    const tasks = await pgPool.query('SELECT * FROM tasks WHERE project_id = $1', [projectId]);
    expect(tasks.rows).toHaveLength(0);
  });

  it('rejects a real user who is not a member of the project\'s team as owner', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const outsider = await registerAndLogin('m39_task_outsider_owner');

    const { projectId, taskRes } = await createProjectAndTask(owner.token, teamId, { owner: outsider.userId });

    expect(taskRes.status).toBe(400);
    const tasks = await pgPool.query('SELECT * FROM tasks WHERE project_id = $1', [projectId]);
    expect(tasks.rows).toHaveLength(0);
  });

  it('rejects a non-team-member as reviewer', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const outsider = await registerAndLogin('m39_task_outsider_reviewer');

    const { taskRes } = await createProjectAndTask(owner.token, teamId, { reviewer: outsider.userId });
    expect(taskRes.status).toBe(400);
  });

  it('rejects a non-team-member inside the contributors array', async () => {
    const { teamId, owner, member } = await buildTeamWithRoles();
    const outsider = await registerAndLogin('m39_task_outsider_contributor');

    const { taskRes } = await createProjectAndTask(owner.token, teamId, { contributors: [member.userId, outsider.userId] });
    expect(taskRes.status).toBe(400);
  });

  it('an authorized update to owner/reviewer still works', async () => {
    const { teamId, owner, admin } = await buildTeamWithRoles();
    const { taskRes } = await createProjectAndTask(owner.token, teamId);
    const taskId = taskRes.body.data.task_id;

    const updateRes = await request(app).put(`/api/tasks/${taskId}`).set(authHeader(owner.token)).send({ owner: admin.userId }).expect(200);
    expect(updateRes.body.data.owner).toBe(admin.userId);
  });

  it('an unauthorized (viewer) update attempt is rejected before reference validation ever runs, and the row is unchanged', async () => {
    const { teamId, owner, viewer, admin } = await buildTeamWithRoles();
    const { taskRes } = await createProjectAndTask(owner.token, teamId);
    const taskId = taskRes.body.data.task_id;

    const res = await request(app).put(`/api/tasks/${taskId}`).set(authHeader(viewer.token)).send({ owner: admin.userId });
    expect(res.status).toBe(403);

    const row = await pgPool.query('SELECT owner FROM tasks WHERE task_id = $1', [taskId]);
    expect(row.rows[0].owner).toBeNull();
  });
});

describe('Milestone 39 -- task dependencies must reference existing tasks in the same project', () => {
  const createProject = async (ownerToken: string, teamId: string) => {
    const res = await request(app).post('/api/projects').set(authHeader(ownerToken)).send({ projectName: 'M39 Dep Project', teamId }).expect(201);
    return res.body.data.project_id;
  };
  const createTask = (ownerToken: string, projectId: string, body: Record<string, any> = {}) =>
    request(app).post(`/api/projects/${projectId}/tasks`).set(authHeader(ownerToken)).send({ title: 'M39 Dep Task', ...body });

  it('a dependency on a real task in the same project succeeds', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const projectId = await createProject(owner.token, teamId);
    const taskA = await createTask(owner.token, projectId).expect(201);

    const taskB = await createTask(owner.token, projectId, { dependencies: [taskA.body.data.task_id] }).expect(201);
    expect(taskB.body.data.dependencies).toEqual([taskA.body.data.task_id]);
  });

  it('rejects a dependency on a nonexistent task', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const projectId = await createProject(owner.token, teamId);

    const res = await createTask(owner.token, projectId, { dependencies: ['00000000-0000-0000-0000-000000000000'] });
    expect(res.status).toBe(400);
  });

  it('rejects a dependency on a real task from a DIFFERENT project', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const projectAId = await createProject(owner.token, teamId);
    const projectBId = await createProject(owner.token, teamId);
    const taskInB = await createTask(owner.token, projectBId).expect(201);

    const res = await createTask(owner.token, projectAId, { dependencies: [taskInB.body.data.task_id] });
    expect(res.status).toBe(400);
  });

  it('rejects a dependency on a real task from a DIFFERENT team entirely', async () => {
    // Milestone 39: the two buildTeamWithRoles() calls build fully
    // independent teams with no shared state, so running them concurrently
    // (rather than sequentially) is a legitimate reduction in this test's
    // own wall-clock cost, not a change to any timeout.
    const [teamA, teamB] = await Promise.all([buildTeamWithRoles(), buildTeamWithRoles()]);
    const projectAId = await createProject(teamA.owner.token, teamA.teamId);
    const projectBId = await createProject(teamB.owner.token, teamB.teamId);
    const taskInB = await createTask(teamB.owner.token, projectBId).expect(201);

    const res = await createTask(teamA.owner.token, projectAId, { dependencies: [taskInB.body.data.task_id] });
    expect(res.status).toBe(400);
  });

  it('rejects a task depending on itself (only checkable on update)', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const projectId = await createProject(owner.token, teamId);
    const task = await createTask(owner.token, projectId).expect(201);
    const taskId = task.body.data.task_id;

    const res = await request(app).put(`/api/tasks/${taskId}`).set(authHeader(owner.token)).send({ dependencies: [taskId] });
    expect(res.status).toBe(400);

    const row = await pgPool.query('SELECT dependencies FROM tasks WHERE task_id = $1', [taskId]);
    expect(row.rows[0].dependencies).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Privileged invite/join-request negative authorization
// ---------------------------------------------------------------------------

describe('Milestone 39 -- invite/join-request privileged actions have complete negative authorization coverage', () => {
  const invite = (token: string, teamId: string, email: string) =>
    request(app).post(`/api/teams/${teamId}/invite`).set(authHeader(token)).send({ email });
  const requestJoin = (token: string, teamId: string) => request(app).post(`/api/teams/${teamId}/join`).set(authHeader(token));
  const approve = (token: string, requestId: string) => request(app).post(`/api/join-requests/${requestId}/approve`).set(authHeader(token));
  const reject = (token: string, requestId: string) => request(app).post(`/api/join-requests/${requestId}/reject`).set(authHeader(token));

  it('viewer, member, and manager are rejected from inviting; owner and admin succeed', async () => {
    const { teamId, owner, admin, manager, member, viewer, nonMember } = await buildTeamWithRoles();

    for (const persona of [viewer, member, manager, nonMember]) {
      const res = await invite(persona.token, teamId, `m39_invite_rejected_${Date.now()}@test.local`);
      expect(res.status).toBe(403);
    }

    await invite(admin.token, teamId, `m39_invite_admin_${Date.now()}@test.local`).expect(200);
    await invite(owner.token, teamId, `m39_invite_owner_${Date.now()}@test.local`).expect(200);
  });

  it('viewer, member, and manager are rejected from approving/rejecting a join request; owner and admin succeed', async () => {
    const { teamId, owner, admin, manager, member, viewer } = await buildTeamWithRoles();
    const joiner1 = await registerAndLogin('m39_joiner_1');
    const joiner2 = await registerAndLogin('m39_joiner_2');
    const joiner3 = await registerAndLogin('m39_joiner_3');

    const req1 = await requestJoin(joiner1.token, teamId).expect(200);
    const req2 = await requestJoin(joiner2.token, teamId).expect(200);
    const req3 = await requestJoin(joiner3.token, teamId).expect(200);

    for (const persona of [viewer, member, manager]) {
      const res = await approve(persona.token, req1.body.data.request_id);
      expect(res.status).toBe(403);
    }
    const rejRes = await reject(member.token, req1.body.data.request_id);
    expect(rejRes.status).toBe(403);

    await approve(admin.token, req2.body.data.request_id).expect(200);
    await approve(owner.token, req3.body.data.request_id).expect(200);

    const members = await request(app).get(`/api/teams/${teamId}/members`).set(authHeader(owner.token)).expect(200);
    expect(members.body.data.some((m: any) => m.user_id === joiner2.userId)).toBe(true);
    expect(members.body.data.some((m: any) => m.user_id === joiner3.userId)).toBe(true);
    // req1's requester was never approved (only 403'd attempts) -- not a member.
    expect(members.body.data.some((m: any) => m.user_id === joiner1.userId)).toBe(false);
  });

  it('a non-member cannot invite or approve a join request for a team they have no relationship to', async () => {
    const { teamId } = await buildTeamWithRoles();
    const outsider = await registerAndLogin('m39_invite_outsider');
    const joiner = await registerAndLogin('m39_wrongteam_joiner');
    const joinRes = await requestJoin(joiner.token, teamId).expect(200);

    await invite(outsider.token, teamId, 'nobody@test.local').expect(403);
    await approve(outsider.token, joinRes.body.data.request_id).expect(403);
  });

  it('an admin of a DIFFERENT team cannot approve a join request belonging to this team', async () => {
    // Milestone 39: same concurrency rationale as the cross-team dependency
    // test above -- two independent teams, no shared state between them.
    const [teamA, teamB] = await Promise.all([buildTeamWithRoles(), buildTeamWithRoles()]);
    const joiner = await registerAndLogin('m39_crossteam_joiner');
    const joinRes = await requestJoin(joiner.token, teamA.teamId).expect(200);

    // teamB's admin has no relationship to teamA at all.
    const res = await approve(teamB.admin.token, joinRes.body.data.request_id);
    expect(res.status).toBe(403);

    const members = await request(app).get(`/api/teams/${teamA.teamId}/members`).set(authHeader(teamA.owner.token)).expect(200);
    expect(members.body.data.some((m: any) => m.user_id === joiner.userId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stale invite security
// ---------------------------------------------------------------------------

describe('Milestone 39 -- stale invite cannot silently restore removed membership', () => {
  it('a pending invite is revoked when the invited user is removed, and can no longer be accepted', async () => {
    const owner = await registerAndLogin('m39_stale_owner');
    const invitee = await registerAndLogin('m39_stale_invitee');
    const teamId = await createTeam(owner.token, `M39_StaleTeam_${Date.now()}`);

    // Owner sends a SECOND, still-unused invite while the invitee is
    // added to the team through a different path (a first invite).
    const firstInvite = await request(app)
      .post(`/api/teams/${teamId}/invite`)
      .set(authHeader(owner.token))
      .send({ email: invitee.user.email })
      .expect(200);
    await request(app).post(`/api/invites/${firstInvite.body.data.invite_id}/accept`).set(authHeader(invitee.token)).expect(200);

    const staleInvite = await request(app)
      .post(`/api/teams/${teamId}/invite`)
      .set(authHeader(owner.token))
      .send({ email: invitee.user.email })
      .expect(200);

    // Owner removes the invitee.
    await request(app).delete(`/api/teams/${teamId}/members/${invitee.userId}`).set(authHeader(owner.token)).expect(200);

    // The still-pending SECOND invite must no longer be usable to
    // silently walk back in. assertInviteBelongsToCaller's own
    // getUserInvites lookup (status='pending' only) is what actually
    // catches this first, since the invite is already revoked by the
    // time this request runs -- 403 "not sent to you" reads oddly for an
    // invite that WAS genuinely sent to them, but the security property
    // (stale invite unusable, membership not restored) holds either way.
    const res = await request(app).post(`/api/invites/${staleInvite.body.data.invite_id}/accept`).set(authHeader(invitee.token));
    expect(res.status).toBe(403);

    const row = await pgPool.query('SELECT status FROM team_invites WHERE invite_id = $1', [staleInvite.body.data.invite_id]);
    expect(row.rows[0].status).toBe('revoked');

    const members = await request(app).get(`/api/teams/${teamId}/members`).set(authHeader(owner.token)).expect(200);
    expect(members.body.data.some((m: any) => m.user_id === invitee.userId)).toBe(false);
  });

  it('leaving a team also revokes the leaver\'s own still-pending invites for that team', async () => {
    const owner = await registerAndLogin('m39_leave_owner');
    const member = await registerAndLogin('m39_leave_member');
    const teamId = await createTeam(owner.token, `M39_LeaveTeam_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const staleInvite = await request(app)
      .post(`/api/teams/${teamId}/invite`)
      .set(authHeader(owner.token))
      .send({ email: member.user.email })
      .expect(200);

    await request(app).post(`/api/teams/${teamId}/leave`).set(authHeader(member.token)).expect(200);

    const res = await request(app).post(`/api/invites/${staleInvite.body.data.invite_id}/accept`).set(authHeader(member.token));
    expect(res.status).toBe(403);

    const row = await pgPool.query('SELECT status FROM team_invites WHERE invite_id = $1', [staleInvite.body.data.invite_id]);
    expect(row.rows[0].status).toBe('revoked');
  });
});

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

describe('Milestone 39 -- concurrency invariants around invite acceptance and membership', () => {
  it('DETERMINISTIC: an invite revoked mid-flight by a concurrent removal cannot be accepted, even if the accept attempt is already in progress', async () => {
    const owner = await registerAndLogin('m39_det_owner');
    const invitee = await registerAndLogin('m39_det_invitee');
    const teamId = await createTeam(owner.token, `M39_DetTeam_${Date.now()}`);
    await addMember(owner.token, teamId, invitee.userId, 'member').expect(200);

    const inviteRes = await request(app)
      .post(`/api/teams/${teamId}/invite`)
      .set(authHeader(owner.token))
      .send({ email: invitee.user.email })
      .expect(200);
    const inviteId = inviteRes.body.data.invite_id;

    // Hold a lock on the invite row via an uncommitted transaction that
    // revokes it, then attempt the accept while that lock is held --
    // Postgres physically blocks acceptInvite's own conditional UPDATE
    // until the lock is released, so this proves the atomic check sees
    // the POST-revocation state, not a stale pre-revocation one.
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE team_invites SET status = 'revoked' WHERE invite_id = $1", [inviteId]);

      const acceptPromise = teamsRepository.acceptInvite(inviteId, invitee.userId);
      await new Promise((resolve) => setTimeout(resolve, 150));

      await client.query('COMMIT');

      const acceptResult = await acceptPromise;
      expect(acceptResult).toBeNull();
    } finally {
      client.release();
    }
  });

  it('concurrent duplicate addMember calls for the same user preserve exactly one membership row', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const target = await registerAndLogin('m39_dup_member_target');

    await Promise.all([
      addMember(owner.token, teamId, target.userId, 'member'),
      addMember(owner.token, teamId, target.userId, 'member'),
      addMember(owner.token, teamId, target.userId, 'member'),
    ]);

    const rows = await pgPool.query('SELECT COUNT(*) AS count FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, target.userId]);
    expect(Number(rows.rows[0].count)).toBe(1);
  });
});
