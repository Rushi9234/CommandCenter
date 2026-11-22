import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, registerAndLogin, createTeam, addMember } from './utils/fixtures';

beforeAll(async () => {
  jest.setTimeout(60000);
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('Analytics Security & ID-Tampering Isolation Tests (Requirements 1, 2, 3 & 10)', () => {
  it('enforces team-scoped member analytics and prevents cross-team work leakage', async () => {
    const ts = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    // Rush = Class Owner
    const rush = await registerAndLogin(`rush_owner_${ts}`);
    // Class A
    const classAId = await createTeam(rush.token, `Class A ${ts}`);
    await new Promise((r) => setTimeout(r, 100));
    // Class B
    const classBId = await createTeam(rush.token, `Class B ${ts}`);
    await new Promise((r) => setTimeout(r, 100));

    // Team A1 under Class A
    const teamA1Id = await createTeam(rush.token, `Team A1 ${ts.slice(0, 10)}`, classAId);

    // Team B2 under Class B
    const teamB2Id = await createTeam(rush.token, `Team B2 ${ts.slice(0, 10)}`, classBId);

    // Pooja = Member of both Team A1 and Team B2
    const pooja = await registerAndLogin(`pooja_member_${ts}`);
    await addMember(rush.token, teamA1Id, pooja.userId, 'member');
    await addMember(rush.token, teamB2Id, pooja.userId, 'member');
    await new Promise((r) => setTimeout(r, 400));

    // Create Projects & Tasks in Team A1
    const projA1Res = await request(app)
      .post('/api/projects')
      .set(authHeader(rush.token))
      .send({ projectName: `Project A1 ${ts.slice(0, 10)}`, description: 'A1 Project', teamId: teamA1Id, isPublic: true })
      .expect(201);
    const projA1Id = projA1Res.body.data.project_id;
    await new Promise((r) => setTimeout(r, 400));

    await request(app)
      .post(`/api/projects/${projA1Id}/tasks`)
      .set(authHeader(rush.token))
      .send({ title: 'Task A1 for Pooja', owner: pooja.userId, status: 'in_progress' })
      .expect(201);

    // Create Projects & Tasks in Team B2
    const projB2Res = await request(app)
      .post('/api/projects')
      .set(authHeader(rush.token))
      .send({ projectName: `Project B2 ${ts.slice(0, 10)}`, description: 'B2 Project', teamId: teamB2Id, isPublic: true })
      .expect(201);
    const projB2Id = projB2Res.body.data.project_id;
    await new Promise((r) => setTimeout(r, 400));

    await request(app)
      .post(`/api/projects/${projB2Id}/tasks`)
      .set(authHeader(rush.token))
      .send({ title: 'Task B2 for Pooja', owner: pooja.userId, status: 'review' })
      .expect(201);

    // Create Personal Project for Pooja
    const projPersonalRes = await request(app)
      .post('/api/projects')
      .set(authHeader(pooja.token))
      .send({ projectName: `Pooja Personal App ${ts.slice(0, 10)}`, description: 'Private', isPublic: false })
      .expect(201);
    const projPersonalId = projPersonalRes.body.data.project_id;
    await new Promise((r) => setTimeout(r, 100));

    await request(app)
      .post(`/api/projects/${projPersonalId}/tasks`)
      .set(authHeader(pooja.token))
      .send({ title: 'Personal Private Task', owner: pooja.userId, status: 'todo' })
      .expect(201);

    // WHEN Rush (Class A Owner) views Pooja's analytics in Team A1 context:
    const res = await request(app)
      .get(`/api/analytics/classes/${classAId}/teams/${teamA1Id}/members/${pooja.userId}`)
      .set(authHeader(rush.token))
      .expect(200);

    expect(res.body.data.context.is_team_scoped).toBe(true);
    expect(res.body.data.context.team_id).toBe(teamA1Id);

    const taskTitles = res.body.data.tasks.map((t: any) => t.title);
    expect(taskTitles).toContain('Task A1 for Pooja');
    expect(taskTitles).not.toContain('Task B2 for Pooja');
    expect(taskTitles).not.toContain('Personal Private Task');
    expect(res.body.data.progress.assigned).toBe(1);
  }, 60000);

  describe('ID-Tampering & Security Boundary Checks (Requirement 3)', () => {
    it('valid classId + wrong teamId (teamId not in class) returns 403 Forbidden', async () => {
      const ts = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      const rush = await registerAndLogin(`rush_id_tamper_${ts}`);
      const classA = await createTeam(rush.token, `ClassA_${ts}`);
      const unparentedTeam = await createTeam(rush.token, `Unparented_${ts}`);
      const member = await registerAndLogin(`member_tamper_${ts}`);
      await addMember(rush.token, unparentedTeam, member.userId, 'member');

      await request(app)
        .get(`/api/analytics/classes/${classA}/teams/${unparentedTeam}/members/${member.userId}`)
        .set(authHeader(rush.token))
        .expect(403);
    });

    it('valid teamId + member from another team returns 403 Forbidden', async () => {
      const ts = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      const owner = await registerAndLogin(`team_owner_tamper_${ts}`);
      const teamA1 = await createTeam(owner.token, `TeamA1_${ts}`);
      const outsider = await registerAndLogin(`outsider_user_${ts}`);

      await request(app)
        .get(`/api/analytics/teams/${teamA1}/members/${outsider.userId}`)
        .set(authHeader(owner.token))
        .expect(403);
    });

    it('unauthorized member cannot view another member\'s analytics (returns 403)', async () => {
      const ts = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      const owner = await registerAndLogin(`owner_user_${ts}`);
      const teamId = await createTeam(owner.token, `Team_${ts}`);
      const member1 = await registerAndLogin(`member_1_${ts}`);
      const member2 = await registerAndLogin(`member_2_${ts}`);

      await addMember(owner.token, teamId, member1.userId, 'member');
      await addMember(owner.token, teamId, member2.userId, 'member');
      await new Promise((r) => setTimeout(r, 100));

      // member1 trying to view member2 analytics in team context
      await request(app)
        .get(`/api/analytics/teams/${teamId}/members/${member2.userId}`)
        .set(authHeader(member1.token))
        .expect(403);
    });

    it('team admin cannot promote another member to admin unless authorized by owner (returns 403)', async () => {
      const ts = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      const owner = await registerAndLogin(`owner_role_test_${ts}`);
      const teamId = await createTeam(owner.token, `TeamRole_${ts}`);
      const admin = await registerAndLogin(`admin_user_${ts}`);
      const member = await registerAndLogin(`plain_member_${ts}`);

      await addMember(owner.token, teamId, admin.userId, 'admin');
      await addMember(owner.token, teamId, member.userId, 'member');

      // Admin trying to promote member to admin
      await request(app)
        .put(`/api/teams/${teamId}/members/${member.userId}/role`)
        .set(authHeader(admin.token))
        .send({ role: 'admin' })
        .expect(403);
    });

    it('team owner CAN promote member to admin (returns 200)', async () => {
      const ts = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      const owner = await registerAndLogin(`owner_promote_test_${ts}`);
      const teamId = await createTeam(owner.token, `TeamOwnerPromote_${ts}`);
      const member = await registerAndLogin(`promoted_member_${ts}`);

      await addMember(owner.token, teamId, member.userId, 'member');

      await request(app)
        .put(`/api/teams/${teamId}/members/${member.userId}/role`)
        .set(authHeader(owner.token))
        .send({ role: 'admin' })
        .expect(200);
    });
  });
});
