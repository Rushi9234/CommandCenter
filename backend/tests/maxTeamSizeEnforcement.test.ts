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
// Milestone 47 -- max_team_size enforcement.
//
// M44/M46 both confirmed max_team_size as decorative metadata, on the
// evidence that it was "never displayed in the frontend." A fresh check
// during M47 found that evidence was wrong: Teams.tsx's create-team form
// has a REQUIRED "Team Size Limit *" field with helper text "Maximum
// number of team members" -- the product visibly promises an enforced
// capacity limit. This file proves every membership-creation path now
// respects it atomically, including under concurrency.
// ---------------------------------------------------------------------------

const createTeamWithSize = async (ownerToken: string, teamName: string, maxTeamSize: number): Promise<string> => {
  const res = await request(app)
    .post('/api/teams')
    .set(authHeader(ownerToken))
    .send({ teamName, maxTeamSize })
    .expect(201);
  return res.body.data.team_id;
};

const getMemberCount = async (ownerToken: string, teamId: string): Promise<number> => {
  const res = await request(app).get(`/api/teams/${teamId}/members`).set(authHeader(ownerToken)).expect(200);
  return res.body.data.length;
};

describe('Milestone 47 -- direct add respects max_team_size', () => {
  it('rejects addMember once the team is at capacity, and does not grow membership', async () => {
    const owner = await registerAndLogin('m47_add_owner');
    const memberA = await registerAndLogin('m47_add_a');
    const memberB = await registerAndLogin('m47_add_b');
    // maxTeamSize 2: owner already fills 1 slot, leaving exactly 1 more.
    const teamId = await createTeamWithSize(owner.token, `M47_Add_${Date.now()}`, 2);

    await addMember(owner.token, teamId, memberA.userId, 'member').expect(200);
    expect(await getMemberCount(owner.token, teamId)).toBe(2);

    const res = await addMember(owner.token, teamId, memberB.userId, 'member');
    expect(res.status).toBe(409);
    expect(await getMemberCount(owner.token, teamId)).toBe(2);
  });

  it('still allows a role change on an EXISTING member when the team is at capacity (capacity gate must not block non-growing writes)', async () => {
    const owner = await registerAndLogin('m47_rolechange_owner');
    const memberA = await registerAndLogin('m47_rolechange_a');
    const teamId = await createTeamWithSize(owner.token, `M47_RoleChange_${Date.now()}`, 2);
    await addMember(owner.token, teamId, memberA.userId, 'member').expect(200);
    expect(await getMemberCount(owner.token, teamId)).toBe(2);

    // Team is now full (2/2). Re-adding the SAME existing member with a
    // different role must still succeed -- it doesn't grow headcount.
    await addMember(owner.token, teamId, memberA.userId, 'admin').expect(200);

    const res = await request(app).get(`/api/teams/${teamId}/members`).set(authHeader(owner.token)).expect(200);
    const updated = res.body.data.find((m: any) => m.user_id === memberA.userId);
    expect(updated.role).toBe('admin');
    expect(res.body.data.length).toBe(2);
  });
});

describe('Milestone 47 -- invite acceptance respects max_team_size', () => {
  it('rejects acceptInvite once the team is at capacity, leaving the invite pending for a later retry', async () => {
    const owner = await registerAndLogin('m47_invite_owner');
    const invitee = await registerAndLogin('m47_invite_invitee');
    // maxTeamSize 1: the owner alone already fills the team.
    const teamId = await createTeamWithSize(owner.token, `M47_Invite_${Date.now()}`, 1);

    await request(app)
      .post(`/api/teams/${teamId}/invite`)
      .set(authHeader(owner.token))
      .send({ email: invitee.user.email })
      .expect(200);

    const invitesRes = await request(app).get('/api/invites/my').set(authHeader(invitee.token)).expect(200);
    const invite = invitesRes.body.data.find((i: any) => i.team_id === teamId);
    expect(invite).toBeDefined();

    const acceptRes = await request(app).post(`/api/invites/${invite.invite_id}/accept`).set(authHeader(invitee.token));
    expect(acceptRes.status).toBe(409);
    expect(await getMemberCount(owner.token, teamId)).toBe(1);

    // The invite must still be pending (not silently consumed/rejected by
    // the failed accept) -- raising the cap and retrying must succeed.
    await request(app)
      .put(`/api/teams/${teamId}/settings`)
      .set(authHeader(owner.token))
      .send({ max_team_size: 5 })
      .expect(200);
    await request(app).post(`/api/invites/${invite.invite_id}/accept`).set(authHeader(invitee.token)).expect(200);
    expect(await getMemberCount(owner.token, teamId)).toBe(2);
  });
});

describe('Milestone 47 -- join-request approval respects max_team_size', () => {
  it('rejects approveJoinRequest once the team is at capacity, leaving the request pending for a later retry', async () => {
    const owner = await registerAndLogin('m47_joinreq_owner');
    const joiner = await registerAndLogin('m47_joinreq_joiner');
    const teamId = await createTeamWithSize(owner.token, `M47_JoinReq_${Date.now()}`, 1);

    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(joiner.token)).expect(200);
    const requestsRes = await request(app).get(`/api/teams/${teamId}/join-requests`).set(authHeader(owner.token)).expect(200);
    const joinRequest = requestsRes.body.data.find((r: any) => r.user.user_id === joiner.userId);
    expect(joinRequest).toBeDefined();

    const approveRes = await request(app)
      .post(`/api/join-requests/${joinRequest.request_id}/approve`)
      .set(authHeader(owner.token));
    expect(approveRes.status).toBe(409);
    expect(await getMemberCount(owner.token, teamId)).toBe(1);

    await request(app)
      .put(`/api/teams/${teamId}/settings`)
      .set(authHeader(owner.token))
      .send({ max_team_size: 5 })
      .expect(200);
    await request(app)
      .post(`/api/join-requests/${joinRequest.request_id}/approve`)
      .set(authHeader(owner.token))
      .expect(200);
    expect(await getMemberCount(owner.token, teamId)).toBe(2);
  });
});

describe('Milestone 47 -- concurrent membership creation cannot exceed max_team_size', () => {
  it('never lets concurrent addMember calls push a team past its cap', async () => {
    const owner = await registerAndLogin('m47_race_owner');
    // maxTeamSize 3: owner + exactly 2 open slots.
    const teamId = await createTeamWithSize(owner.token, `M47_Race_${Date.now()}`, 3);

    const candidates = await Promise.all(
      Array.from({ length: 5 }, (_, i) => registerAndLogin(`m47_race_candidate_${i}`))
    );

    const results = await Promise.all(candidates.map((c) => addMember(owner.token, teamId, c.userId, 'member')));

    const successCount = results.filter((r) => r.status === 200).length;
    const conflictCount = results.filter((r) => r.status === 409).length;

    expect(successCount).toBe(2);
    expect(conflictCount).toBe(3);
    expect(await getMemberCount(owner.token, teamId)).toBe(3);
  });
});
