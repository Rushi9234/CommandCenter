import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, registerAndLogin } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const invite = (ownerToken: string, teamId: string, email: string) =>
  request(app).post(`/api/teams/${teamId}/invite`).set(authHeader(ownerToken)).send({ email });

const acceptInvite = (token: string, inviteId: string) => request(app).post(`/api/invites/${inviteId}/accept`).set(authHeader(token));

const requestJoin = (token: string, teamId: string) => request(app).post(`/api/teams/${teamId}/join`).set(authHeader(token));

const approveJoinRequest = (ownerToken: string, requestId: string) =>
  request(app).post(`/api/join-requests/${requestId}/approve`).set(authHeader(ownerToken));

describe('acceptInvite -- Milestone 25: no 500 when already a member', () => {
  it('accepts a normal invite and adds the user to the team (unchanged behavior)', async () => {
    const owner = await registerAndLogin('m25_owner_a');
    const invitee = await registerAndLogin('m25_invitee_a');
    const teamId = await createTeam(owner.token, 'M25 Team A');

    const inviteRes = await invite(owner.token, teamId, invitee.user.email).expect(200);
    const inviteId = inviteRes.body.data.invite_id;

    await acceptInvite(invitee.token, inviteId).expect(200);

    const members = await request(app).get(`/api/teams/${teamId}/members`).set(authHeader(owner.token)).expect(200);
    expect(members.body.data.some((m: any) => m.user_id === invitee.userId)).toBe(true);
  });

  it('does not return 500 when accepting a second invite to a team already joined', async () => {
    const owner = await registerAndLogin('m25_owner_b');
    const invitee = await registerAndLogin('m25_invitee_b');
    const teamId = await createTeam(owner.token, 'M25 Team B');

    // Two separate invites for the same email -- inviteMember has no
    // dedup check, so this is already possible today without any race.
    const firstInvite = await invite(owner.token, teamId, invitee.user.email).expect(200);
    const secondInvite = await invite(owner.token, teamId, invitee.user.email).expect(200);

    await acceptInvite(invitee.token, firstInvite.body.data.invite_id).expect(200);

    // Before Milestone 25, this second acceptance crashed with a raw
    // unique-violation 500 (team_members(team_id, user_id) already
    // exists). It must now succeed as a no-op instead.
    const secondAccept = await acceptInvite(invitee.token, secondInvite.body.data.invite_id);
    expect(secondAccept.status).toBe(200);

    // Still exactly one membership row, not two, and not an error.
    const countRes = await pgPool.query('SELECT COUNT(*) AS count FROM team_members WHERE team_id = $1 AND user_id = $2', [
      teamId,
      invitee.userId,
    ]);
    expect(Number(countRes.rows[0].count)).toBe(1);
  });
});

describe('approveJoinRequest -- Milestone 25: no 500 when already a member', () => {
  it('approves a normal join request and adds the user to the team (unchanged behavior)', async () => {
    const owner = await registerAndLogin('m25_owner_c');
    const joiner = await registerAndLogin('m25_joiner_c');
    const teamId = await createTeam(owner.token, 'M25 Team C');

    const joinRes = await requestJoin(joiner.token, teamId).expect(200);
    const requestId = joinRes.body.data.request_id;

    await approveJoinRequest(owner.token, requestId).expect(200);

    const members = await request(app).get(`/api/teams/${teamId}/members`).set(authHeader(owner.token)).expect(200);
    expect(members.body.data.some((m: any) => m.user_id === joiner.userId)).toBe(true);
  });

  it('does not return 500 when approving a join request for someone already a member', async () => {
    const owner = await registerAndLogin('m25_owner_d');
    const joiner = await registerAndLogin('m25_joiner_d');
    const teamId = await createTeam(owner.token, 'M25 Team D');

    const joinRes = await requestJoin(joiner.token, teamId).expect(200);
    const requestId = joinRes.body.data.request_id;

    // The user becomes a member through a separate path (an invite
    // accepted in the meantime) while their join request is still
    // pending -- a realistic sequence, not a contrived race.
    const inviteRes = await invite(owner.token, teamId, joiner.user.email).expect(200);
    await acceptInvite(joiner.token, inviteRes.body.data.invite_id).expect(200);

    // Before Milestone 25, approving the now-redundant join request
    // crashed with a raw unique-violation 500. It must now succeed as a
    // no-op instead.
    const approveRes = await approveJoinRequest(owner.token, requestId);
    expect(approveRes.status).toBe(200);

    const countRes = await pgPool.query('SELECT COUNT(*) AS count FROM team_members WHERE team_id = $1 AND user_id = $2', [
      teamId,
      joiner.userId,
    ]);
    expect(Number(countRes.rows[0].count)).toBe(1);
  });
});
