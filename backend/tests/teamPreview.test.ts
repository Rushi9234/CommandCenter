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

// ---------------------------------------------------------------------------
// Milestone 48 -- GET /teams/:teamId/preview, the missing piece of the
// "enter a Team ID to join" workflow: requestJoin (M5+) has never gated on
// team privacy (knowing the exact ID is the invitation), so this endpoint
// doesn't introduce new exposure -- it only lets a caller see the same
// few safe fields before firing a join request blind.
// ---------------------------------------------------------------------------

describe('Milestone 48 -- GET /teams/:teamId/preview', () => {
  it('returns safe team fields to an authenticated non-member', async () => {
    const owner = await registerAndLogin('m48_preview_owner');
    const stranger = await registerAndLogin('m48_preview_stranger');
    const teamId = await createTeam(owner.token, `M48_Preview_${Date.now()}`);

    const res = await request(app).get(`/api/teams/${teamId}/preview`).set(authHeader(stranger.token)).expect(200);
    expect(res.body.data.team_id).toBe(teamId);
    expect(res.body.data.member_count).toBe(1);
    expect(res.body.data.owner.username).toBe(owner.user.username);
    expect(res.body.data.max_team_size).toBeDefined();
  });

  it('never returns the member list, permissions, or other member-only fields', async () => {
    const owner = await registerAndLogin('m48_preview_shape_owner');
    const stranger = await registerAndLogin('m48_preview_shape_stranger');
    const teamId = await createTeam(owner.token, `M48_PreviewShape_${Date.now()}`);

    const res = await request(app).get(`/api/teams/${teamId}/preview`).set(authHeader(stranger.token)).expect(200);
    expect(res.body.data.members).toBeUndefined();
    expect(res.body.data.permissions).toBeUndefined();
    expect(res.body.data.parent_team_id).toBeUndefined();
  });

  it('works for a private, non-discoverable team -- same precondition requestJoin already accepts', async () => {
    const owner = await registerAndLogin('m48_preview_private_owner');
    const stranger = await registerAndLogin('m48_preview_private_stranger');
    const teamRes = await request(app)
      .post('/api/teams')
      .set(authHeader(owner.token))
      .send({ teamName: `M48_Private_${Date.now()}`, isPublic: false })
      .expect(201);
    const teamId = teamRes.body.data.team_id;

    const res = await request(app).get(`/api/teams/${teamId}/preview`).set(authHeader(stranger.token)).expect(200);
    expect(res.body.data.team_id).toBe(teamId);
    expect(res.body.data.is_public).toBe(false);

    // Confirms the precondition this endpoint relies on still holds --
    // a non-member really can join-request this exact team with zero
    // privacy gate, so the preview above added no new exposure.
    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(stranger.token)).expect(200);
  });

  it('reflects an accurate member_count after members are added', async () => {
    const owner = await registerAndLogin('m48_preview_count_owner');
    const member = await registerAndLogin('m48_preview_count_member');
    const stranger = await registerAndLogin('m48_preview_count_stranger');
    const teamId = await createTeam(owner.token, `M48_Count_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const res = await request(app).get(`/api/teams/${teamId}/preview`).set(authHeader(stranger.token)).expect(200);
    expect(res.body.data.member_count).toBe(2);
  });

  it('returns 404 for a nonexistent team', async () => {
    const stranger = await registerAndLogin('m48_preview_404');
    await request(app)
      .get('/api/teams/00000000-0000-0000-0000-000000000000/preview')
      .set(authHeader(stranger.token))
      .expect(404);
  });

  it('rejects an unauthenticated request', async () => {
    const owner = await registerAndLogin('m48_preview_unauth_owner');
    const teamId = await createTeam(owner.token, `M48_Unauth_${Date.now()}`);
    await request(app).get(`/api/teams/${teamId}/preview`).expect(401);
  });
});
