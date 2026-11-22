import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, addMember, registerAndLogin } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const createProject = (token: string, teamId: string) =>
  request(app).post('/api/projects').set(authHeader(token)).send({ projectName: 'M29 Test Project', teamId });

const updateProject = (token: string, projectId: string, body: Record<string, any>) =>
  request(app).put(`/api/projects/${projectId}`).set(authHeader(token)).send(body);

const getProjectTeamId = async (projectId: string) => {
  const res = await pgPool.query('SELECT team_id FROM projects WHERE project_id = $1', [projectId]);
  return res.rows[0]?.team_id;
};

describe('PUT /projects/:projectId -- Milestone 29: no cross-team transfer without membership', () => {
  it('rejects a team_id reassignment to a team the caller does not belong to, and does not change the DB row', async () => {
    const owner = await registerAndLogin('m29_owner_a');
    const teamA = await createTeam(owner.token, `M29_TeamA_${Date.now()}`);
    const teamB = await createTeam((await registerAndLogin('m29_other_owner')).token, `M29_TeamB_${Date.now()}`);

    const createRes = await createProject(owner.token, teamA).expect(201);
    const projectId = createRes.body.data.project_id;

    await updateProject(owner.token, projectId, { team_id: teamB }).expect(403);

    expect(await getProjectTeamId(projectId)).toBe(teamA);
  });

  it('allows a team_id reassignment when the caller has write access in both the current and destination team', async () => {
    const owner = await registerAndLogin('m29_owner_b');
    const teamA = await createTeam(owner.token, `M29_TeamA2_${Date.now()}`);
    const teamB = await createTeam(owner.token, `M29_TeamB2_${Date.now()}`);

    const createRes = await createProject(owner.token, teamA).expect(201);
    const projectId = createRes.body.data.project_id;

    // Owner created both teams, so they hold a sufficient role in the
    // destination team too -- a legitimate transfer.
    await updateProject(owner.token, projectId, { team_id: teamB }).expect(200);

    expect(await getProjectTeamId(projectId)).toBe(teamB);
  });

  it('leaves normal updates that do not touch team_id unaffected', async () => {
    const owner = await registerAndLogin('m29_owner_c');
    const teamA = await createTeam(owner.token, `M29_TeamA3_${Date.now()}`);

    const createRes = await createProject(owner.token, teamA).expect(201);
    const projectId = createRes.body.data.project_id;

    const res = await updateProject(owner.token, projectId, { status: 'active' }).expect(200);
    expect(res.body.data.status).toBe('active');
    expect(await getProjectTeamId(projectId)).toBe(teamA);
  });

  it('applies the same rule to the project creator -- being the creator does not bypass the destination-team check', async () => {
    const creator = await registerAndLogin('m29_creator');
    const teamOwner = await registerAndLogin('m29_teamB_owner');
    const teamA = await createTeam(creator.token, `M29_TeamA4_${Date.now()}`);
    const teamB = await createTeam(teamOwner.token, `M29_TeamB4_${Date.now()}`);

    const createRes = await createProject(creator.token, teamA).expect(201);
    const projectId = createRes.body.data.project_id;

    // Creator has no membership in teamB at all.
    await updateProject(creator.token, projectId, { team_id: teamB }).expect(403);
    expect(await getProjectTeamId(projectId)).toBe(teamA);

    // Once actually added to teamB with a writer role, the same creator can transfer.
    await addMember(teamOwner.token, teamB, creator.userId, 'member').expect(200);
    await updateProject(creator.token, projectId, { team_id: teamB }).expect(200);
    expect(await getProjectTeamId(projectId)).toBe(teamB);
  });
});
