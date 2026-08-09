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
// GET /users -- Milestone 41: team-scoped, not org-wide
// ---------------------------------------------------------------------------

describe('Milestone 41 -- GET /users is scoped to the caller\'s own team(s), not the entire org', () => {
  it('returns co-workers who share a team with the caller', async () => {
    const owner = await registerAndLogin('m41_users_owner');
    const member = await registerAndLogin('m41_users_member');
    const teamId = await createTeam(owner.token, `M41_Users_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const res = await request(app).get('/api/users').set(authHeader(owner.token)).expect(200);
    const ids = res.body.data.map((u: any) => u.user_id);
    expect(ids).toContain(owner.userId);
    expect(ids).toContain(member.userId);
  });

  it('does NOT return a user from a completely unrelated team', async () => {
    const ownerA = await registerAndLogin('m41_users_owner_a');
    const outsider = await registerAndLogin('m41_users_outsider');
    await createTeam(ownerA.token, `M41_UsersA_${Date.now()}`);
    // outsider belongs to no team shared with ownerA
    await createTeam(outsider.token, `M41_UsersOutsider_${Date.now()}`);

    const res = await request(app).get('/api/users').set(authHeader(ownerA.token)).expect(200);
    const ids = res.body.data.map((u: any) => u.user_id);
    expect(ids).not.toContain(outsider.userId);
  });

  it('a user with no team at all sees only themselves (or nobody), never the full org', async () => {
    const lonely = await registerAndLogin('m41_users_lonely');
    const somebodyElse = await registerAndLogin('m41_users_elsewhere');
    await createTeam(somebodyElse.token, `M41_UsersElsewhere_${Date.now()}`);

    const res = await request(app).get('/api/users').set(authHeader(lonely.token)).expect(200);
    const ids = res.body.data.map((u: any) => u.user_id);
    expect(ids).not.toContain(somebodyElse.userId);
    expect(ids.length).toBe(0);
  });

  it('never returns password_hash, verification_token, or password_reset_token_hash', async () => {
    const owner = await registerAndLogin('m41_users_safe_fields');
    await createTeam(owner.token, `M41_UsersSafe_${Date.now()}`);

    const res = await request(app).get('/api/users').set(authHeader(owner.token)).expect(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/password_hash|verification_token|password_reset_token_hash|refresh_token/i);
  });

  it('an unauthenticated request is rejected', async () => {
    await request(app).get('/api/users').expect(401);
  });

  it('being added to a second, unrelated team makes that team\'s members visible too (regression -- the scope is real membership, not a static snapshot)', async () => {
    const owner = await registerAndLogin('m41_users_second_team_owner');
    const caller = await registerAndLogin('m41_users_second_team_caller');
    const target = await registerAndLogin('m41_users_second_team_target');
    const teamId = await createTeam(owner.token, `M41_SecondTeam_${Date.now()}`);
    await addMember(owner.token, teamId, caller.userId, 'member').expect(200);
    await addMember(owner.token, teamId, target.userId, 'member').expect(200);

    const res = await request(app).get('/api/users').set(authHeader(caller.token)).expect(200);
    const ids = res.body.data.map((u: any) => u.user_id);
    expect(ids).toContain(target.userId);
  });
});

// ---------------------------------------------------------------------------
// GET /leaderboard -- data minimization (M32's visibility filtering already
// has dedicated coverage in privacyEnforcement.test.ts / leaderboard.test.ts;
// this file adds only what those don't already cover)
// ---------------------------------------------------------------------------

describe('Milestone 41 -- GET /leaderboard never leaks credential/token fields', () => {
  it('never returns password_hash, verification_token, or refresh_token', async () => {
    const { token } = await registerAndLogin('m41_leaderboard_safe_fields');

    const res = await request(app).get('/api/leaderboard').set(authHeader(token)).expect(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/password_hash|verification_token|password_reset_token_hash|refresh_token/i);
  });

  it('an unauthenticated request is rejected', async () => {
    await request(app).get('/api/leaderboard').expect(401);
  });
});

// ---------------------------------------------------------------------------
// GET /logs/my -- Milestone 41: ?limit= is now validated and bounded
// ---------------------------------------------------------------------------

describe('Milestone 41 -- GET /logs/my ?limit= is validated and bounded', () => {
  it('a negative limit is rejected with a clean 400, not a raw Postgres error', async () => {
    const { token } = await registerAndLogin('m41_logs_negative_limit');
    const res = await request(app).get('/api/logs/my?limit=-1').set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it('a non-numeric limit is rejected with a clean 400', async () => {
    const { token } = await registerAndLogin('m41_logs_nan_limit');
    const res = await request(app).get('/api/logs/my?limit=abc').set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it('a limit above the maximum is rejected with a clean 400', async () => {
    const { token } = await registerAndLogin('m41_logs_oversized_limit');
    const res = await request(app).get('/api/logs/my?limit=99999').set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it('no limit at all still defaults to 30 (regression -- unchanged behavior)', async () => {
    const { token } = await registerAndLogin('m41_logs_default_limit');
    await request(app).get('/api/logs/my').set(authHeader(token)).expect(200);
  });

  it('a valid, in-range limit is accepted', async () => {
    const { token } = await registerAndLogin('m41_logs_valid_limit');
    await request(app).get('/api/logs/my?limit=5').set(authHeader(token)).expect(200);
  });
});

// ---------------------------------------------------------------------------
// Read authorization regression -- guessed UUID cannot expose another
// team's resource (spot-check across resource types not already covered
// by resourceReferenceIntegrity.test.ts / subTeamsAuthorization.test.ts)
// ---------------------------------------------------------------------------

describe('Milestone 41 -- read authorization regression across resource types', () => {
  it('a cross-team caller cannot read another team\'s blockers via a guessed teamId', async () => {
    const ownerA = await registerAndLogin('m41_read_blockers_owner_a');
    const outsider = await registerAndLogin('m41_read_blockers_outsider');
    const teamAId = await createTeam(ownerA.token, `M41_ReadBlockersA_${Date.now()}`);

    const res = await request(app).get(`/api/teams/${teamAId}/blockers`).set(authHeader(outsider.token));
    expect(res.status).toBe(403);
  });

  it('a cross-team caller cannot read another team\'s projects via a guessed teamId', async () => {
    const ownerA = await registerAndLogin('m41_read_projects_owner_a');
    const outsider = await registerAndLogin('m41_read_projects_outsider');
    const teamAId = await createTeam(ownerA.token, `M41_ReadProjectsA_${Date.now()}`);

    const res = await request(app).get(`/api/teams/${teamAId}/projects`).set(authHeader(outsider.token));
    expect(res.status).toBe(403);
  });

  it('sub-team read authorization (M37) remains intact: a non-member cannot list another team\'s sub-teams', async () => {
    const ownerA = await registerAndLogin('m41_subteams_owner_a');
    const outsider = await registerAndLogin('m41_subteams_outsider');
    const teamAId = await createTeam(ownerA.token, `M41_SubTeamsA_${Date.now()}`);

    const res = await request(app).get(`/api/teams/${teamAId}/sub-teams`).set(authHeader(outsider.token));
    expect(res.status).toBe(403);
  });
});
