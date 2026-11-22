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

const setParentTeam = (token: string, teamId: string, parentTeamId: string) =>
  request(app).put(`/api/teams/${teamId}/settings`).set(authHeader(token)).send({ parent_team_id: parentTeamId });

const getSubTeams = (token: string, teamId: string) => request(app).get(`/api/teams/${teamId}/sub-teams`).set(authHeader(token));

const getParentTeamIdFromDb = async (teamId: string) => {
  const res = await pgPool.query('SELECT parent_team_id FROM teams WHERE team_id = $1', [teamId]);
  return res.rows[0]?.parent_team_id ?? null;
};

describe('Milestone 37 -- GET /teams/:teamId/sub-teams requires parent-team membership', () => {
  it('a member of the parent team (any role, including viewer) can retrieve its sub-teams', async () => {
    const { teamId, owner, viewer } = await buildTeamWithRoles();
    const childTeamId = await createTeam(owner.token, `M37_Child_${Date.now()}`);
    await setParentTeam(owner.token, childTeamId, teamId).expect(200);

    const asOwner = await getSubTeams(owner.token, teamId).expect(200);
    expect(asOwner.body.data.map((t: any) => t.team_id)).toContain(childTeamId);

    const asViewer = await getSubTeams(viewer.token, teamId).expect(200);
    expect(asViewer.body.data.map((t: any) => t.team_id)).toContain(childTeamId);
  });

  it('an authenticated non-member cannot retrieve a team\'s sub-teams -- rejected, and the response leaks no sub-team data', async () => {
    const owner = await registerAndLogin('m37_owner_private');
    const outsider = await registerAndLogin('m37_outsider');
    const teamId = await createTeam(owner.token, `M37_Private_${Date.now()}`);
    const childTeamId = await createTeam(owner.token, `M37_PrivateChild_${Date.now()}`);
    await setParentTeam(owner.token, childTeamId, teamId).expect(200);

    const res = await getSubTeams(outsider.token, teamId);

    expect(res.status).toBe(403);
    // No sub-team data anywhere in the rejected response -- not partially
    // leaked, not present under a different key.
    expect(JSON.stringify(res.body)).not.toContain(childTeamId);
    expect(res.body.data).toBeUndefined();
  });

  it('rejects an anonymous (unauthenticated) request', async () => {
    const owner = await registerAndLogin('m37_owner_anon');
    const teamId = await createTeam(owner.token, `M37_Anon_${Date.now()}`);

    const res = await request(app).get(`/api/teams/${teamId}/sub-teams`);
    expect(res.status).toBe(401);
  });

  it('does not leak child-team metadata through an unauthorized parent hierarchy request', async () => {
    const owner = await registerAndLogin('m37_owner_leak');
    const outsider = await registerAndLogin('m37_outsider_leak');
    const teamId = await createTeam(owner.token, `M37_LeakParent_${Date.now()}`);
    const childTeamId = await createTeam(owner.token, `M37_LeakChild_Secret_${Date.now()}`);
    await setParentTeam(owner.token, childTeamId, teamId).expect(200);

    const res = await getSubTeams(outsider.token, teamId);
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('data');
  });

  it('a rejected sub-teams request does not mutate the underlying parent/child relationship', async () => {
    const owner = await registerAndLogin('m37_owner_nomut');
    const outsider = await registerAndLogin('m37_outsider_nomut');
    const teamId = await createTeam(owner.token, `M37_NoMutParent_${Date.now()}`);
    const childTeamId = await createTeam(owner.token, `M37_NoMutChild_${Date.now()}`);
    await setParentTeam(owner.token, childTeamId, teamId).expect(200);

    await getSubTeams(outsider.token, teamId).expect(403);

    expect(await getParentTeamIdFromDb(childTeamId)).toBe(teamId);
  });

  it('a parent/child relationship created via the Milestone 35-protected settings update is visible only to parent-team members', async () => {
    const owner = await registerAndLogin('m37_owner_m35path');
    const outsider = await registerAndLogin('m37_outsider_m35path');
    const teamId = await createTeam(owner.token, `M37_M35Parent_${Date.now()}`);
    const childTeamId = await createTeam(owner.token, `M37_M35Child_${Date.now()}`);

    // The legitimate, Milestone-35-authorized path: owner has access to
    // both teams, so the destination-team check passes.
    await setParentTeam(owner.token, childTeamId, teamId).expect(200);

    const ownerView = await getSubTeams(owner.token, teamId).expect(200);
    expect(ownerView.body.data.map((t: any) => t.team_id)).toContain(childTeamId);

    const outsiderView = await getSubTeams(outsider.token, teamId);
    expect(outsiderView.status).toBe(403);
  });

  it('Milestone 35\'s destination-team authorization on parent_team_id remains intact (regression)', async () => {
    const owner = await registerAndLogin('m37_owner_m35reg');
    const otherOwner = await registerAndLogin('m37_other_m35reg');
    const teamId = await createTeam(owner.token, `M37_M35RegA_${Date.now()}`);
    const otherTeamId = await createTeam(otherOwner.token, `M37_M35RegB_${Date.now()}`);

    const res = await setParentTeam(owner.token, teamId, otherTeamId);
    expect(res.status).toBe(403);
    expect(await getParentTeamIdFromDb(teamId)).toBeNull();
  });
});

describe('Milestone 37 -- existing public/discoverable team discovery is unchanged (regression)', () => {
  it('GET /teams and GET /teams/search still return public+discoverable teams regardless of membership', async () => {
    const owner = await registerAndLogin('m37_discovery_owner');
    const outsider = await registerAndLogin('m37_discovery_outsider');
    const teamName = `M37_DiscoverableTeam_${Date.now()}`;

    await request(app)
      .post('/api/teams')
      .set(authHeader(owner.token))
      .send({ teamName, isPublic: true })
      .expect(201);

    const allTeams = await request(app).get('/api/teams').set(authHeader(outsider.token)).expect(200);
    expect(allTeams.body.data.some((t: any) => t.team_name === teamName)).toBe(true);

    const searchRes = await request(app)
      .get('/api/teams/search')
      .set(authHeader(outsider.token))
      .query({ q: teamName })
      .expect(200);
    expect(searchRes.body.data.some((t: any) => t.team_name === teamName)).toBe(true);
  });
});
