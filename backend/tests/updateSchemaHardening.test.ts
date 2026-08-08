import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, registerAndLogin, buildTeamWithRoles } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

describe('Milestone 35 -- PUT /goals/:goalId hardened update schema', () => {
  const createGoal = (token: string, teamId?: string) =>
    request(app).post('/api/goals').set(authHeader(token)).send({ title: 'M35 Goal', teamId });

  const getGoalRow = async (goalId: string) => (await pgPool.query('SELECT * FROM goals WHERE goal_id = $1', [goalId])).rows[0];

  it('accepts a legitimate frontend-compatible status update', async () => {
    const { token } = await registerAndLogin('m35_goal_valid');
    const goalRes = await createGoal(token);
    const goalId = goalRes.body.data.goal_id;

    const res = await request(app).put(`/api/goals/${goalId}`).set(authHeader(token)).send({ status: 'active' }).expect(200);
    expect(res.body.data.status).toBe('active');
  });

  it('silently ignores an unknown field and still applies the rest of the update', async () => {
    const { token } = await registerAndLogin('m35_goal_unknown');
    const goalRes = await createGoal(token);
    const goalId = goalRes.body.data.goal_id;

    const res = await request(app)
      .put(`/api/goals/${goalId}`)
      .set(authHeader(token))
      .send({ status: 'active', totally_made_up_field: 'x' })
      .expect(200);
    expect(res.body.data.status).toBe('active');
    expect(res.body.data).not.toHaveProperty('totally_made_up_field');
  });

  it('rejects a wrong-typed field (progress as a string)', async () => {
    const { token } = await registerAndLogin('m35_goal_type');
    const goalRes = await createGoal(token);
    const goalId = goalRes.body.data.goal_id;

    const res = await request(app).put(`/api/goals/${goalId}`).set(authHeader(token)).send({ progress: 'not-a-number' });
    expect(res.status).toBe(400);

    const row = await getGoalRow(goalId);
    expect(row.progress).toBe(0);
  });

  it('rejects an invalid status enum value, and the row is left unchanged', async () => {
    const { token } = await registerAndLogin('m35_goal_enum');
    const goalRes = await createGoal(token);
    const goalId = goalRes.body.data.goal_id;

    const res = await request(app).put(`/api/goals/${goalId}`).set(authHeader(token)).send({ status: 'not_a_real_status' });
    expect(res.status).toBe(400);

    const row = await getGoalRow(goalId);
    expect(row.status).toBe('planning');
  });

  it('rejects an out-of-range progress value, and the row is left unchanged', async () => {
    const { token } = await registerAndLogin('m35_goal_range');
    const goalRes = await createGoal(token);
    const goalId = goalRes.body.data.goal_id;

    const res = await request(app).put(`/api/goals/${goalId}`).set(authHeader(token)).send({ progress: 500 });
    expect(res.status).toBe(400);

    const row = await getGoalRow(goalId);
    expect(row.progress).toBe(0);
  });

  it('cannot spoof completed_at directly -- it is always server-derived from status', async () => {
    const { token } = await registerAndLogin('m35_goal_completedat');
    const goalRes = await createGoal(token);
    const goalId = goalRes.body.data.goal_id;
    const spoofedDate = '2000-01-01T00:00:00.000Z';

    // completed_at isn't even a recognized field -- it's silently
    // ignored, not applied, regardless of status.
    const res = await request(app)
      .put(`/api/goals/${goalId}`)
      .set(authHeader(token))
      .send({ status: 'active', completed_at: spoofedDate })
      .expect(200);
    expect(res.status).not.toBe(400);

    const row = await getGoalRow(goalId);
    expect(row.completed_at).toBeNull();
  });

  it('sets completed_at when transitioning to completed, and clears it on reopen (no stale timestamp)', async () => {
    const { token } = await registerAndLogin('m35_goal_lifecycle');
    const goalRes = await createGoal(token);
    const goalId = goalRes.body.data.goal_id;

    await request(app).put(`/api/goals/${goalId}`).set(authHeader(token)).send({ status: 'completed' }).expect(200);
    const completedRow = await getGoalRow(goalId);
    expect(completedRow.completed_at).not.toBeNull();

    await request(app).put(`/api/goals/${goalId}`).set(authHeader(token)).send({ status: 'active' }).expect(200);
    const reopenedRow = await getGoalRow(goalId);
    expect(reopenedRow.completed_at).toBeNull();
  });

  it('rejects an unauthorized update (non-member), and the row is left unchanged', async () => {
    const { teamId, owner, nonMember } = await buildTeamWithRoles();
    const goalRes = await createGoal(owner.token, teamId);
    const goalId = goalRes.body.data.goal_id;

    const res = await request(app).put(`/api/goals/${goalId}`).set(authHeader(nonMember.token)).send({ status: 'active' });
    expect(res.status).toBe(403);

    const row = await getGoalRow(goalId);
    expect(row.status).toBe('planning');
  });
});

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

describe('Milestone 35 -- PUT /tasks/:taskId hardened update schema', () => {
  const setupProjectWithTask = async () => {
    const team = await buildTeamWithRoles();
    const projectRes = await request(app)
      .post('/api/projects')
      .set(authHeader(team.owner.token))
      .send({ projectName: 'M35 Task Parent', teamId: team.teamId })
      .expect(201);
    const projectId = projectRes.body.data.project_id;

    const taskRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(team.owner.token))
      .send({ title: 'M35 Task' })
      .expect(201);

    return { ...team, projectId, taskId: taskRes.body.data.task_id };
  };

  const getTaskRow = async (taskId: string) => (await pgPool.query('SELECT * FROM tasks WHERE task_id = $1', [taskId])).rows[0];

  it('accepts a legitimate frontend-compatible status update', async () => {
    const { member, taskId } = await setupProjectWithTask();

    const res = await request(app).put(`/api/tasks/${taskId}`).set(authHeader(member.token)).send({ status: 'in_progress' }).expect(200);
    expect(res.body.data.status).toBe('in_progress');
  });

  it('rejects a malformed owner UUID, and the row is left unchanged', async () => {
    const { member, taskId } = await setupProjectWithTask();

    const res = await request(app).put(`/api/tasks/${taskId}`).set(authHeader(member.token)).send({ owner: 'not-a-uuid' });
    expect(res.status).toBe(400);

    const row = await getTaskRow(taskId);
    expect(row.owner).toBeNull();
  });

  it('rejects an invalid priority enum value', async () => {
    const { member, taskId } = await setupProjectWithTask();

    const res = await request(app).put(`/api/tasks/${taskId}`).set(authHeader(member.token)).send({ priority: 'urgent-ish' });
    expect(res.status).toBe(400);
  });

  it('cannot spoof completed_at directly -- it is always server-derived from status', async () => {
    const { member, taskId } = await setupProjectWithTask();

    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(member.token))
      .send({ status: 'in_progress', completed_at: '2000-01-01T00:00:00.000Z' })
      .expect(200);
    expect(res.status).not.toBe(400);

    const row = await getTaskRow(taskId);
    expect(row.completed_at).toBeNull();
  });

  it('sets completed_at when marked done, and clears it on reopen', async () => {
    const { member, taskId } = await setupProjectWithTask();

    await request(app).put(`/api/tasks/${taskId}`).set(authHeader(member.token)).send({ status: 'done' }).expect(200);
    expect((await getTaskRow(taskId)).completed_at).not.toBeNull();

    await request(app).put(`/api/tasks/${taskId}`).set(authHeader(member.token)).send({ status: 'todo' }).expect(200);
    expect((await getTaskRow(taskId)).completed_at).toBeNull();
  });

  it('rejects an unauthorized update (viewer), and the row is left unchanged', async () => {
    const { viewer, taskId } = await setupProjectWithTask();

    const res = await request(app).put(`/api/tasks/${taskId}`).set(authHeader(viewer.token)).send({ status: 'done' });
    expect(res.status).toBe(403);

    const row = await getTaskRow(taskId);
    expect(row.status).toBe('todo');
  });
});

// ---------------------------------------------------------------------------
// Blockers
// ---------------------------------------------------------------------------

describe('Milestone 35 -- PUT /blockers/:blockerId hardened update schema', () => {
  const createBlocker = (token: string, teamId: string) =>
    request(app).post('/api/blockers').set(authHeader(token)).send({ teamId, title: 'M35 Blocker', description: 'Blocked.' });

  const getBlockerRow = async (blockerId: string) => (await pgPool.query('SELECT * FROM blockers WHERE blocker_id = $1', [blockerId])).rows[0];

  it('accepts the legitimate frontend-compatible resolve action', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const blockerRes = await createBlocker(owner.token, teamId);
    const blockerId = blockerRes.body.data.blocker_id;

    const res = await request(app).put(`/api/blockers/${blockerId}`).set(authHeader(owner.token)).send({ status: 'resolved' }).expect(200);
    expect(res.body.data.status).toBe('resolved');
  });

  it('rejects an invalid blocker_type enum value', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const blockerRes = await createBlocker(owner.token, teamId);
    const blockerId = blockerRes.body.data.blocker_id;

    const res = await request(app)
      .put(`/api/blockers/${blockerId}`)
      .set(authHeader(owner.token))
      .send({ blocker_type: 'not_a_real_type' });
    expect(res.status).toBe(400);
  });

  it('cannot spoof resolved_by to an arbitrary user when status is not being set to resolved', async () => {
    const { teamId, owner, member } = await buildTeamWithRoles();
    const blockerRes = await createBlocker(owner.token, teamId);
    const blockerId = blockerRes.body.data.blocker_id;

    const res = await request(app)
      .put(`/api/blockers/${blockerId}`)
      .set(authHeader(owner.token))
      .send({ description: 'Updated description', resolved_by: member.userId })
      .expect(200);
    expect(res.status).not.toBe(400);

    const row = await getBlockerRow(blockerId);
    expect(row.resolved_by).toBeNull();
    expect(row.description).toBe('Updated description');
  });

  it('sets resolved_by/resolved_at to the actual caller when resolving, and clears both on reopen', async () => {
    const { teamId, owner, member } = await buildTeamWithRoles();
    const blockerRes = await createBlocker(owner.token, teamId);
    const blockerId = blockerRes.body.data.blocker_id;

    // member attempts to resolve while also naming a DIFFERENT user as
    // resolved_by -- the server must use the actual caller, not the
    // client-supplied value.
    await request(app)
      .put(`/api/blockers/${blockerId}`)
      .set(authHeader(member.token))
      .send({ status: 'resolved', resolved_by: owner.userId })
      .expect(200);

    const resolvedRow = await getBlockerRow(blockerId);
    expect(resolvedRow.resolved_by).toBe(member.userId);
    expect(resolvedRow.resolved_at).not.toBeNull();

    await request(app).put(`/api/blockers/${blockerId}`).set(authHeader(owner.token)).send({ status: 'open' }).expect(200);
    const reopenedRow = await getBlockerRow(blockerId);
    expect(reopenedRow.resolved_by).toBeNull();
    expect(reopenedRow.resolved_at).toBeNull();
  });

  it('rejects an unauthorized update (non-member), and the row is left unchanged', async () => {
    const { teamId, owner, nonMember } = await buildTeamWithRoles();
    const blockerRes = await createBlocker(owner.token, teamId);
    const blockerId = blockerRes.body.data.blocker_id;

    const res = await request(app).put(`/api/blockers/${blockerId}`).set(authHeader(nonMember.token)).send({ status: 'resolved' });
    expect(res.status).toBe(403);

    const row = await getBlockerRow(blockerId);
    expect(row.status).toBe('open');
  });
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

describe('Milestone 35 -- PUT /projects/:projectId hardened update schema', () => {
  const createProject = (token: string, teamId: string) =>
    request(app).post('/api/projects').set(authHeader(token)).send({ projectName: 'M35 Project', teamId });

  const getProjectRow = async (projectId: string) => (await pgPool.query('SELECT * FROM projects WHERE project_id = $1', [projectId])).rows[0];

  it('accepts a legitimate frontend-compatible status update', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const projectRes = await createProject(owner.token, teamId);
    const projectId = projectRes.body.data.project_id;

    const res = await request(app).put(`/api/projects/${projectId}`).set(authHeader(owner.token)).send({ status: 'active' }).expect(200);
    expect(res.body.data.status).toBe('active');
  });

  it('rejects an invalid status enum value, and the row is left unchanged', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const projectRes = await createProject(owner.token, teamId);
    const projectId = projectRes.body.data.project_id;

    const res = await request(app).put(`/api/projects/${projectId}`).set(authHeader(owner.token)).send({ status: 'not_a_real_status' });
    expect(res.status).toBe(400);

    const row = await getProjectRow(projectId);
    expect(row.status).toBe('planning');
  });

  it('rejects a malformed team_id, and still enforces the Milestone 29 destination-team check for a well-formed one', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const otherOwner = await registerAndLogin('m35_project_otherowner');
    const otherTeamId = await createTeam(otherOwner.token, `M35_OtherTeam_${Date.now()}`);
    const projectRes = await createProject(owner.token, teamId);
    const projectId = projectRes.body.data.project_id;

    const malformed = await request(app).put(`/api/projects/${projectId}`).set(authHeader(owner.token)).send({ team_id: 'not-a-uuid' });
    expect(malformed.status).toBe(400);

    // Well-formed but unauthorized destination -- Milestone 29's guard,
    // still intact behind the new schema.
    const unauthorized = await request(app).put(`/api/projects/${projectId}`).set(authHeader(owner.token)).send({ team_id: otherTeamId });
    expect(unauthorized.status).toBe(403);

    const row = await getProjectRow(projectId);
    expect(row.team_id).toBe(teamId);
  });

  it('rejects an unauthorized update (non-member), and the row is left unchanged', async () => {
    const { teamId, owner, nonMember } = await buildTeamWithRoles();
    const projectRes = await createProject(owner.token, teamId);
    const projectId = projectRes.body.data.project_id;

    const res = await request(app).put(`/api/projects/${projectId}`).set(authHeader(nonMember.token)).send({ status: 'active' });
    expect(res.status).toBe(403);

    const row = await getProjectRow(projectId);
    expect(row.status).toBe('planning');
  });
});

// ---------------------------------------------------------------------------
// Teams (settings)
// ---------------------------------------------------------------------------

describe('Milestone 35 -- PUT /teams/:teamId/settings hardened update schema', () => {
  const getTeamRow = async (teamId: string) => (await pgPool.query('SELECT * FROM teams WHERE team_id = $1', [teamId])).rows[0];

  it('accepts a legitimate frontend-compatible settings update', async () => {
    const owner = await registerAndLogin('m35_team_valid');
    const teamId = await createTeam(owner.token, `M35_Team_${Date.now()}`);

    const res = await request(app)
      .put(`/api/teams/${teamId}/settings`)
      .set(authHeader(owner.token))
      .send({ team_name: 'Renamed Team', description: 'Updated', is_public: false })
      .expect(200);
    expect(res.body.data.team_name).toBe('Renamed Team');
    expect(res.body.data.is_public).toBe(false);
  });

  it('rejects a wrong-typed field (max_team_size as a string) and an out-of-range value', async () => {
    const owner = await registerAndLogin('m35_team_type');
    const teamId = await createTeam(owner.token, `M35_TeamB_${Date.now()}`);

    const wrongType = await request(app)
      .put(`/api/teams/${teamId}/settings`)
      .set(authHeader(owner.token))
      .send({ max_team_size: 'a lot' });
    expect(wrongType.status).toBe(400);

    const outOfRange = await request(app).put(`/api/teams/${teamId}/settings`).set(authHeader(owner.token)).send({ max_team_size: 0 });
    expect(outOfRange.status).toBe(400);

    const row = await getTeamRow(teamId);
    expect(row.max_team_size).toBe(10);
  });

  it('rejects re-parenting under a team the caller has no access to (new destination-team check), and the row is left unchanged', async () => {
    const owner = await registerAndLogin('m35_team_reparent_a');
    const otherOwner = await registerAndLogin('m35_team_reparent_b');
    const teamId = await createTeam(owner.token, `M35_TeamC_${Date.now()}`);
    const otherTeamId = await createTeam(otherOwner.token, `M35_TeamD_${Date.now()}`);

    const res = await request(app)
      .put(`/api/teams/${teamId}/settings`)
      .set(authHeader(owner.token))
      .send({ parent_team_id: otherTeamId });
    expect(res.status).toBe(403);

    const row = await getTeamRow(teamId);
    expect(row.parent_team_id).toBeNull();
  });

  it('allows re-parenting under a team the caller has owner/admin access to', async () => {
    const owner = await registerAndLogin('m35_team_reparent_ok');
    const teamId = await createTeam(owner.token, `M35_TeamE_${Date.now()}`);
    const parentTeamId = await createTeam(owner.token, `M35_TeamF_${Date.now()}`);

    const res = await request(app)
      .put(`/api/teams/${teamId}/settings`)
      .set(authHeader(owner.token))
      .send({ parent_team_id: parentTeamId })
      .expect(200);
    expect(res.body.data.parent_team_id).toBe(parentTeamId);
  });

  it('rejects an unauthorized update (non-owner/admin), and the row is left unchanged', async () => {
    const { teamId, member } = await buildTeamWithRoles();

    const res = await request(app).put(`/api/teams/${teamId}/settings`).set(authHeader(member.token)).send({ team_name: 'Hijacked' });
    expect(res.status).toBe(403);

    const row = await getTeamRow(teamId);
    expect(row.team_name).not.toBe('Hijacked');
  });
});
