import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, buildTeamWithRoles, registerAndLogin } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('Teams -- membership and management authorization', () => {
  it('lets owner and admin add a member; rejects manager/member/viewer/non-member', async () => {
    const { teamId, owner, admin, manager, member, viewer, nonMember } = await buildTeamWithRoles();
    const candidate = await registerAndLogin('candidate');

    await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set(authHeader(owner.token))
      .send({ userId: candidate.userId, role: 'member' })
      .expect(200);

    const other = await registerAndLogin('candidate2');
    await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set(authHeader(admin.token))
      .send({ userId: other.userId, role: 'member' })
      .expect(200);

    for (const persona of [manager, member, viewer, nonMember]) {
      const target = await registerAndLogin('rejected_candidate');
      await request(app)
        .post(`/api/teams/${teamId}/members`)
        .set(authHeader(persona.token))
        .send({ userId: target.userId, role: 'member' })
        .expect(403);
    }
  });

  it('lets any team member view the roster; rejects a non-member', async () => {
    const { teamId, viewer, nonMember } = await buildTeamWithRoles();

    await request(app).get(`/api/teams/${teamId}/members`).set(authHeader(viewer.token)).expect(200);
    await request(app).get(`/api/teams/${teamId}/members`).set(authHeader(nonMember.token)).expect(403);
  });

  it('rejects requests with no token and with an invalid token', async () => {
    const { teamId } = await buildTeamWithRoles();

    await request(app).get(`/api/teams/${teamId}/members`).expect(401);
    await request(app).get(`/api/teams/${teamId}/members`).set('Authorization', 'Bearer not-a-real-token').expect(401);
  });
});

describe('Projects -- write access excludes viewer, read access includes viewer', () => {
  const createProject = (token: string, teamId: string) =>
    request(app).post('/api/projects').set(authHeader(token)).send({ projectName: 'RBAC Test Project', teamId });

  it('allows owner/admin/manager/member to create a project; rejects viewer and non-member', async () => {
    const { teamId, owner, admin, manager, member, viewer, nonMember } = await buildTeamWithRoles();

    for (const persona of [owner, admin, manager, member]) {
      await createProject(persona.token, teamId).expect(201);
    }
    await createProject(viewer.token, teamId).expect(403);
    await createProject(nonMember.token, teamId).expect(403);
  });

  it('allows a writer to update a project; rejects viewer; rejects a non-member entirely', async () => {
    const { teamId, owner, member, viewer, nonMember } = await buildTeamWithRoles();
    const createRes = await createProject(owner.token, teamId).expect(201);
    const projectId = createRes.body.data.project_id;

    await request(app).put(`/api/projects/${projectId}`).set(authHeader(member.token)).send({ status: 'active' }).expect(200);
    await request(app).put(`/api/projects/${projectId}`).set(authHeader(viewer.token)).send({ status: 'active' }).expect(403);
    await request(app).put(`/api/projects/${projectId}`).set(authHeader(nonMember.token)).send({ status: 'active' }).expect(403);
  });

  it('restricts delete to the project creator -- even another writer (admin) is rejected (invalid ownership)', async () => {
    const { teamId, owner, admin } = await buildTeamWithRoles();
    const createRes = await createProject(owner.token, teamId).expect(201);
    const projectId = createRes.body.data.project_id;

    // admin has write access to the project but did not create it --
    // delete is creator-only, a narrower rule than the other write routes.
    await request(app).delete(`/api/projects/${projectId}`).set(authHeader(admin.token)).expect(403);
    await request(app).delete(`/api/projects/${projectId}`).set(authHeader(owner.token)).expect(200);
  });

  it('allows viewer to read project tasks; rejects a non-member', async () => {
    const { teamId, owner, viewer, nonMember } = await buildTeamWithRoles();
    const createRes = await createProject(owner.token, teamId).expect(201);
    const projectId = createRes.body.data.project_id;

    await request(app).get(`/api/projects/${projectId}/tasks`).set(authHeader(viewer.token)).expect(200);
    await request(app).get(`/api/projects/${projectId}/tasks`).set(authHeader(nonMember.token)).expect(403);
  });

  it('rejects unauthenticated and invalidly-authenticated requests', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const createRes = await createProject(owner.token, teamId).expect(201);
    const projectId = createRes.body.data.project_id;

    await request(app).get(`/api/projects/${projectId}/tasks`).expect(401);
    await request(app).get(`/api/projects/${projectId}/tasks`).set('Authorization', 'Bearer garbage').expect(401);
  });
});

describe('Tasks -- inherit project write/read authorization', () => {
  const setupProjectWithTask = async () => {
    const team = await buildTeamWithRoles();
    const projectRes = await request(app)
      .post('/api/projects')
      .set(authHeader(team.owner.token))
      .send({ projectName: 'Task Parent Project', teamId: team.teamId })
      .expect(201);
    const projectId = projectRes.body.data.project_id;

    const taskRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(team.owner.token))
      .send({ title: 'RBAC Test Task' })
      .expect(201);
    const taskId = taskRes.body.data.task_id;

    return { ...team, projectId, taskId };
  };

  it('allows a writer to update/delete a task; rejects viewer', async () => {
    const { member, viewer, taskId } = await setupProjectWithTask();

    await request(app).put(`/api/tasks/${taskId}`).set(authHeader(member.token)).send({ status: 'in_progress' }).expect(200);
    await request(app).put(`/api/tasks/${taskId}`).set(authHeader(viewer.token)).send({ status: 'in_progress' }).expect(403);
    await request(app).delete(`/api/tasks/${taskId}`).set(authHeader(viewer.token)).expect(403);
  });

  it('rejects task creation by viewer and non-member', async () => {
    const { projectId, viewer, nonMember } = await setupProjectWithTask();

    await request(app).post(`/api/projects/${projectId}/tasks`).set(authHeader(viewer.token)).send({ title: 'Viewer task' }).expect(403);
    await request(app).post(`/api/projects/${projectId}/tasks`).set(authHeader(nonMember.token)).send({ title: 'Nonmember task' }).expect(403);
  });
});

describe('Goals -- write access excludes viewer, read access includes viewer', () => {
  const createGoal = (token: string, teamId: string) => request(app).post('/api/goals').set(authHeader(token)).send({ title: 'RBAC Test Goal', teamId });

  it('allows owner/admin/manager/member to create; rejects viewer and non-member', async () => {
    const { teamId, owner, admin, manager, member, viewer, nonMember } = await buildTeamWithRoles();

    for (const persona of [owner, admin, manager, member]) {
      await createGoal(persona.token, teamId).expect(201);
    }
    await createGoal(viewer.token, teamId).expect(403);
    await createGoal(nonMember.token, teamId).expect(403);
  });

  it('allows a writer to update/delete; rejects viewer; allows viewer to read', async () => {
    const { teamId, owner, member, viewer, nonMember } = await buildTeamWithRoles();
    const createRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = createRes.body.data.goal_id;

    await request(app).put(`/api/goals/${goalId}`).set(authHeader(member.token)).send({ status: 'active' }).expect(200);
    await request(app).put(`/api/goals/${goalId}`).set(authHeader(viewer.token)).send({ status: 'active' }).expect(403);

    await request(app).get(`/api/goals/${goalId}/progress`).set(authHeader(viewer.token)).expect(200);
    await request(app).get(`/api/goals/${goalId}/progress`).set(authHeader(nonMember.token)).expect(403);

    await request(app).delete(`/api/goals/${goalId}`).set(authHeader(viewer.token)).expect(403);
  });
});

describe('Blockers -- write access excludes viewer, read access includes viewer', () => {
  const createBlocker = (token: string, teamId: string) =>
    request(app).post('/api/blockers').set(authHeader(token)).send({ title: 'RBAC Test Blocker', teamId });

  it('allows owner/admin/manager/member to create; rejects viewer and non-member', async () => {
    const { teamId, owner, admin, manager, member, viewer, nonMember } = await buildTeamWithRoles();

    for (const persona of [owner, admin, manager, member]) {
      await createBlocker(persona.token, teamId).expect(201);
    }
    await createBlocker(viewer.token, teamId).expect(403);
    await createBlocker(nonMember.token, teamId).expect(403);
  });

  it('allows a writer to update and post messages; rejects viewer from writing but allows it to read', async () => {
    const { teamId, owner, member, viewer, nonMember } = await buildTeamWithRoles();
    const createRes = await createBlocker(owner.token, teamId).expect(201);
    const blockerId = createRes.body.data.blocker_id;

    await request(app).put(`/api/blockers/${blockerId}`).set(authHeader(member.token)).send({ status: 'resolved' }).expect(200);
    await request(app).put(`/api/blockers/${blockerId}`).set(authHeader(viewer.token)).send({ status: 'resolved' }).expect(403);

    await request(app).post(`/api/blockers/${blockerId}/messages`).set(authHeader(member.token)).send({ messageText: 'hello' }).expect(201);
    await request(app).post(`/api/blockers/${blockerId}/messages`).set(authHeader(viewer.token)).send({ messageText: 'hello' }).expect(403);

    await request(app).get(`/api/blockers/${blockerId}/messages`).set(authHeader(viewer.token)).expect(200);
    await request(app).get(`/api/blockers/${blockerId}/messages`).set(authHeader(nonMember.token)).expect(403);
  });
});

describe('Logs -- ownership-based authorization, independent of team role', () => {
  it('allows the owner to update their own log; rejects a different user, even a teammate', async () => {
    const { member, admin } = await buildTeamWithRoles();

    const logRes = await request(app)
      .post('/api/logs')
      .set(authHeader(member.token))
      .send({ entryText: 'Worked on the RBAC regression suite today.' })
      .expect(201);
    const logId = logRes.body.data.log.log_id;

    await request(app).put(`/api/logs/${logId}`).set(authHeader(member.token)).send({ entryText: 'Updated my own log entry text.' }).expect(200);

    // admin has no ownership over member's personal log -- team role is
    // irrelevant here, this is a pure ownership check.
    await request(app).put(`/api/logs/${logId}`).set(authHeader(admin.token)).send({ entryText: 'Trying to edit someone else' + "'" + 's log.' }).expect(403);
  });

  it('rejects unauthenticated and invalid-token requests', async () => {
    const { member } = await buildTeamWithRoles();
    const logRes = await request(app)
      .post('/api/logs')
      .set(authHeader(member.token))
      .send({ entryText: 'Another entry for the auth-failure test.' })
      .expect(201);
    const logId = logRes.body.data.log.log_id;

    await request(app).put(`/api/logs/${logId}`).send({ entryText: 'No auth at all.' }).expect(401);
    await request(app).put(`/api/logs/${logId}`).set('Authorization', 'Bearer garbage').send({ entryText: 'Bad token.' }).expect(401);
  });
});
