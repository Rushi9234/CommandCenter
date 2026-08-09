import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { withTransaction } from '../src/db/client';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, addMember, registerAndLogin, buildUser, register, login } from './utils/fixtures';
import { authService } from '../src/modules/auth/auth.service';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const createGoal = (token: string, teamId?: string, parentGoalId?: string) =>
  request(app).post('/api/goals').set(authHeader(token)).send({ title: 'M40 Test Goal', teamId, parentGoalId });

const createProject = async (token: string, teamId: string) => {
  const res = await request(app).post('/api/projects').set(authHeader(token)).send({ projectName: 'M40 Project', teamId }).expect(201);
  return res.body.data.project_id;
};

const createTask = (token: string, projectId: string, body: Record<string, any> = {}) =>
  request(app)
    .post(`/api/projects/${projectId}/tasks`)
    .set(authHeader(token))
    .send({ title: 'M40 Task', ...body });

// ---------------------------------------------------------------------------
// 1. Postgres error translation -- no raw DB error reaches the client
// ---------------------------------------------------------------------------

describe('Milestone 40 -- Postgres error translation (no raw DB error reaches the client)', () => {
  it('registering a duplicate USERNAME (distinct email) is rejected cleanly, not a 500', async () => {
    const user = buildUser('m40_dupe_username');
    await register(user).expect(201);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'm40_different_email@test.local', username: user.username, fullName: 'Someone Else', password: 'Passw0rd!123' })
      .expect(400);
    expect(res.body.error).toMatch(/already exists/i);

    const rows = await pgPool.query('SELECT COUNT(*) FROM users WHERE username = $1', [user.username]);
    expect(Number(rows.rows[0].count)).toBe(1);
  });

  it('a malformed UUID route param is rejected with a clean 400, not a raw Postgres 22P02 500', async () => {
    const { token } = await registerAndLogin('m40_malformed_uuid');
    const res = await request(app).get('/api/projects/not-a-real-uuid/details').set(authHeader(token));
    expect(res.status).toBe(400);
    expect(res.body.error).not.toMatch(/22P02|syntax|postgres|invalid input/i);
  });

  it('a well-formed but nonexistent UUID gets a clean 404, not a 500', async () => {
    const { token } = await registerAndLogin('m40_nonexistent_uuid');
    const res = await request(app).get('/api/projects/00000000-0000-0000-0000-000000000000/details').set(authHeader(token));
    expect(res.status).toBe(404);
  });

  it('deleting a goal that still has children is rejected with a clean 409, and neither goal is mutated', async () => {
    const owner = await registerAndLogin('m40_goal_fk_owner');
    const teamId = await createTeam(owner.token, `M40_GoalFK_${Date.now()}`);
    const parentRes = await createGoal(owner.token, teamId).expect(201);
    const parentId = parentRes.body.data.goal_id;
    const childRes = await createGoal(owner.token, teamId, parentId).expect(201);
    const childId = childRes.body.data.goal_id;

    const res = await request(app).delete(`/api/goals/${parentId}`).set(authHeader(owner.token));
    expect(res.status).toBe(409);
    // Never leak the constraint/table name.
    expect(JSON.stringify(res.body)).not.toMatch(/goals_parent_goal_id_fkey|foreign key|constraint|relation/i);

    const parentRow = await pgPool.query('SELECT goal_id FROM goals WHERE goal_id = $1', [parentId]);
    const childRow = await pgPool.query('SELECT parent_goal_id FROM goals WHERE goal_id = $1', [childId]);
    expect(parentRow.rows.length).toBe(1);
    expect(childRow.rows[0].parent_goal_id).toBe(parentId);
  });

  it('deleting a goal with no children still succeeds normally (regression -- the FK fix does not block legitimate deletes)', async () => {
    const owner = await registerAndLogin('m40_goal_fk_leaf');
    const teamId = await createTeam(owner.token, `M40_GoalFKLeaf_${Date.now()}`);
    const leafRes = await createGoal(owner.token, teamId).expect(201);
    const leafId = leafRes.body.data.goal_id;

    await request(app).delete(`/api/goals/${leafId}`).set(authHeader(owner.token)).expect(200);

    const row = await pgPool.query('SELECT goal_id FROM goals WHERE goal_id = $1', [leafId]);
    expect(row.rows.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. createTeam atomicity
// ---------------------------------------------------------------------------

describe('Milestone 40 -- createTeam atomicity', () => {
  it('a normal team creation always produces exactly one owner-membership row (regression)', async () => {
    const owner = await registerAndLogin('m40_create_team_normal');
    const teamId = await createTeam(owner.token, `M40_Normal_${Date.now()}`);

    const members = await pgPool.query('SELECT role FROM team_members WHERE team_id = $1', [teamId]);
    expect(members.rows.length).toBe(1);
    expect(members.rows[0].role).toBe('owner');
  });

  it('a failure between the team insert and the owner-membership insert rolls back the team creation entirely (no orphaned team)', async () => {
    const owner = await registerAndLogin('m40_create_team_atomicity');
    const teamName = `M40_Atomicity_${Date.now()}`;

    await expect(
      withTransaction(async (client) => {
        await client.query('INSERT INTO teams (team_name, created_by) VALUES ($1, $2) RETURNING *', [teamName, owner.userId]);
        throw new Error('Simulated failure between team insert and owner-membership insert');
      })
    ).rejects.toThrow('Simulated failure');

    const teamRow = await pgPool.query('SELECT team_id FROM teams WHERE team_name = $1', [teamName]);
    expect(teamRow.rows.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Duplicate invite / join-request atomicity
// ---------------------------------------------------------------------------

describe('Milestone 40 -- duplicate invite/join-request atomicity', () => {
  it('inviting the same email to the same team twice is rejected the second time with a clean 409, and exactly one pending row exists', async () => {
    const owner = await registerAndLogin('m40_dupe_invite_owner');
    const teamId = await createTeam(owner.token, `M40_DupeInvite_${Date.now()}`);
    const email = 'm40_invitee@test.local';

    await request(app).post(`/api/teams/${teamId}/invite`).set(authHeader(owner.token)).send({ email }).expect(200);
    const second = await request(app).post(`/api/teams/${teamId}/invite`).set(authHeader(owner.token)).send({ email });
    expect(second.status).toBe(409);

    const rows = await pgPool.query("SELECT COUNT(*) FROM team_invites WHERE team_id = $1 AND email = $2 AND status = 'pending'", [
      teamId,
      email,
    ]);
    expect(Number(rows.rows[0].count)).toBe(1);
  });

  it('concurrent duplicate invites for the same team+email resolve to exactly one pending row, regardless of which request "won"', async () => {
    const owner = await registerAndLogin('m40_concurrent_invite_owner');
    const teamId = await createTeam(owner.token, `M40_ConcurrentInvite_${Date.now()}`);
    const email = 'm40_concurrent_invitee@test.local';

    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post(`/api/teams/${teamId}/invite`).set(authHeader(owner.token)).send({ email }))
    );
    const successes = results.filter((r) => r.status === 200);
    const conflicts = results.filter((r) => r.status === 409);
    expect(successes.length).toBe(1);
    expect(conflicts.length).toBe(4);

    const rows = await pgPool.query("SELECT COUNT(*) FROM team_invites WHERE team_id = $1 AND email = $2 AND status = 'pending'", [
      teamId,
      email,
    ]);
    expect(Number(rows.rows[0].count)).toBe(1);
  });

  it('a second, later invite to the same email succeeds once the first is no longer pending (regression -- the constraint is pending-only, not permanent)', async () => {
    const owner = await registerAndLogin('m40_reinvite_owner');
    const teamId = await createTeam(owner.token, `M40_Reinvite_${Date.now()}`);
    const email = 'm40_reinvitee@test.local';

    const first = await request(app).post(`/api/teams/${teamId}/invite`).set(authHeader(owner.token)).send({ email }).expect(200);
    await pgPool.query("UPDATE team_invites SET status = 'rejected' WHERE invite_id = $1", [first.body.data.invite_id]);

    await request(app).post(`/api/teams/${teamId}/invite`).set(authHeader(owner.token)).send({ email }).expect(200);
  });

  it('requesting to join the same team twice is rejected the second time with a clean 409, and exactly one pending row exists', async () => {
    const owner = await registerAndLogin('m40_dupe_join_owner');
    const joiner = await registerAndLogin('m40_dupe_join_joiner');
    const teamId = await createTeam(owner.token, `M40_DupeJoin_${Date.now()}`);

    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(joiner.token)).expect(200);
    const second = await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(joiner.token));
    expect(second.status).toBe(409);

    const rows = await pgPool.query("SELECT COUNT(*) FROM join_requests WHERE team_id = $1 AND user_id = $2 AND status = 'pending'", [
      teamId,
      joiner.userId,
    ]);
    expect(Number(rows.rows[0].count)).toBe(1);
  });

  it('concurrent duplicate addMember calls for the same user still preserve exactly one membership row (regression, pre-existing M24/M25 constraint)', async () => {
    const owner = await registerAndLogin('m40_concurrent_member_owner');
    const target = await registerAndLogin('m40_concurrent_member_target');
    const teamId = await createTeam(owner.token, `M40_ConcurrentMember_${Date.now()}`);

    await Promise.all(Array.from({ length: 5 }, () => addMember(owner.token, teamId, target.userId, 'member')));

    const rows = await pgPool.query('SELECT COUNT(*) FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, target.userId]);
    expect(Number(rows.rows[0].count)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. authController error redaction (verifyEmail/refresh/resetPassword no
//    longer echo an unexpected error's raw .message)
// ---------------------------------------------------------------------------

describe('Milestone 40 -- authController redacts unexpected errors instead of echoing error.message', () => {
  it('refresh: an unexpected (non-AppError) failure returns the generic message, never the raw error text', async () => {
    const spy = jest.spyOn(authService, 'refresh').mockRejectedValueOnce(new Error('SENSITIVE_INTERNAL_DETAIL_should_never_leak'));

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'irrelevant-value' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Failed to refresh token');
    expect(JSON.stringify(res.body)).not.toMatch(/SENSITIVE_INTERNAL_DETAIL/);

    spy.mockRestore();
  });

  it('resetPassword: an unexpected (non-AppError) failure returns the generic message, never the raw error text', async () => {
    const spy = jest.spyOn(authService, 'resetPassword').mockRejectedValueOnce(new Error('SENSITIVE_INTERNAL_DETAIL_should_never_leak'));

    const res = await request(app).post('/api/auth/reset-password').send({ token: 'irrelevant-value', newPassword: 'Passw0rd!123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Failed to reset password');
    expect(JSON.stringify(res.body)).not.toMatch(/SENSITIVE_INTERNAL_DETAIL/);

    spy.mockRestore();
  });

  it('verifyEmail: an unexpected (non-AppError) failure returns the generic message, never the raw error text', async () => {
    const spy = jest.spyOn(authService, 'verifyEmail').mockRejectedValueOnce(new Error('SENSITIVE_INTERNAL_DETAIL_should_never_leak'));

    const res = await request(app).post('/api/auth/verify-email').send({ token: 'irrelevant-value' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Verification failed');
    expect(JSON.stringify(res.body)).not.toMatch(/SENSITIVE_INTERNAL_DETAIL/);

    spy.mockRestore();
  });

  it('a KNOWN AppError from verifyEmail (regression) still returns its own real, safe message', async () => {
    const res = await request(app).post('/api/auth/verify-email').send({ token: 'not-a-real-token' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });
});

// ---------------------------------------------------------------------------
// 5. Input boundary hardening
// ---------------------------------------------------------------------------

describe('Milestone 40 -- input boundary hardening (array length / text length caps)', () => {
  it('creating a task with an oversized contributors array is rejected, and no task is created', async () => {
    const owner = await registerAndLogin('m40_oversized_owner');
    const teamId = await createTeam(owner.token, `M40_Oversized_${Date.now()}`);
    const projectId = await createProject(owner.token, teamId);

    const tooManyIds = Array.from({ length: 51 }, () => '11111111-1111-1111-1111-111111111111');
    const res = await createTask(owner.token, projectId, { contributors: tooManyIds });
    expect(res.status).toBe(400);

    const rows = await pgPool.query('SELECT COUNT(*) FROM tasks WHERE project_id = $1', [projectId]);
    expect(Number(rows.rows[0].count)).toBe(0);
  });

  it('a normal-sized contributors array is still accepted (regression -- the cap does not block legitimate use)', async () => {
    const owner = await registerAndLogin('m40_normal_size_owner');
    const teamId = await createTeam(owner.token, `M40_NormalSize_${Date.now()}`);
    const projectId = await createProject(owner.token, teamId);

    const res = await createTask(owner.token, projectId, { contributors: [owner.userId] });
    expect(res.status).toBe(201);
  });

  it('an oversized AI chat message is rejected with a clean 400', async () => {
    const { token } = await registerAndLogin('m40_oversized_chat');
    const res = await request(app)
      .post('/api/ai/chat')
      .set(authHeader(token))
      .send({ message: 'x'.repeat(5001) });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 6. Deferred z.any() field cannot mutate protected state
// ---------------------------------------------------------------------------

describe('Milestone 40 -- updateMemberPermissions (z.any(), deliberately deferred) cannot be used to change role', () => {
  it('sending a role-shaped key inside permissions never changes the actual role column', async () => {
    const owner = await registerAndLogin('m40_permissions_owner');
    const target = await registerAndLogin('m40_permissions_target');
    const teamId = await createTeam(owner.token, `M40_Permissions_${Date.now()}`);
    await addMember(owner.token, teamId, target.userId, 'member').expect(200);

    await request(app)
      .put(`/api/teams/${teamId}/members/${target.userId}/permissions`)
      .set(authHeader(owner.token))
      .send({ permissions: { role: 'owner', can_manage_settings: true } })
      .expect(200);

    const row = await pgPool.query('SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, target.userId]);
    expect(row.rows[0].role).toBe('member');
  });
});
