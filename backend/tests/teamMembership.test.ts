import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, buildTeamWithRoles, createTeam, registerAndLogin } from './utils/fixtures';

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

    // Milestone 40: team_invites now carries a partial unique index on
    // (team_id, email) WHERE status = 'pending' -- two invites to the
    // same email can no longer BOTH be pending at once (a duplicate
    // second call now gets a clean 409, see databaseIntegrityHardening.test.ts).
    // This test's actual point -- accepting an invite while already a
    // member must not 500 -- still needs two invites to the SAME team+
    // email, just no longer both pending at the same time: the first is
    // accepted (which flips its own status away from 'pending') before
    // the second is ever created, so the second invite's own creation is
    // never blocked by the new constraint.
    const firstInvite = await invite(owner.token, teamId, invitee.user.email).expect(200);
    await acceptInvite(invitee.token, firstInvite.body.data.invite_id).expect(200);
    const secondInvite = await invite(owner.token, teamId, invitee.user.email).expect(200);

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

const addMemberReq = (token: string, teamId: string, userId: string, role?: string) =>
  request(app).post(`/api/teams/${teamId}/members`).set(authHeader(token)).send({ userId, role });

const memberRole = async (teamId: string, userId: string) => {
  const res = await pgPool.query('SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]);
  return res.rows[0]?.role;
};

describe('addMember -- Milestone 27: no role escalation via POST /teams/:teamId/members', () => {
  it('rejects role: "owner" at validation, from an admin or the owner', async () => {
    const { teamId, owner, admin } = await buildTeamWithRoles();
    const candidate = await registerAndLogin('m27_candidate_owner');

    await addMemberReq(admin.token, teamId, candidate.userId, 'owner').expect(400);
    await addMemberReq(owner.token, teamId, candidate.userId, 'owner').expect(400);

    expect(await memberRole(teamId, candidate.userId)).toBeUndefined();
  });

  it('does not let an admin change the existing owner\'s role, and does not modify it in the database', async () => {
    const { teamId, owner, admin } = await buildTeamWithRoles();

    await addMemberReq(admin.token, teamId, owner.userId, 'member').expect(403);

    expect(await memberRole(teamId, owner.userId)).toBe('owner');
  });

  it('does not let an admin change another existing admin\'s role, and does not modify it in the database', async () => {
    const { teamId, owner, admin } = await buildTeamWithRoles();
    const secondAdmin = await registerAndLogin('m27_second_admin');
    // Owner adds the second admin directly -- owner is exempt from the hierarchy rule.
    await addMemberReq(owner.token, teamId, secondAdmin.userId, 'admin').expect(200);

    await addMemberReq(admin.token, teamId, secondAdmin.userId, 'member').expect(403);

    expect(await memberRole(teamId, secondAdmin.userId)).toBe('admin');
  });

  it('lets the owner change an existing admin\'s role (legitimate hierarchy-permitted operation)', async () => {
    const { teamId, owner, admin } = await buildTeamWithRoles();

    await addMemberReq(owner.token, teamId, admin.userId, 'member').expect(200);

    expect(await memberRole(teamId, admin.userId)).toBe('member');
  });

  it('still lets an admin add a brand-new member with any permitted role (member/viewer/manager/admin)', async () => {
    const { teamId, admin } = await buildTeamWithRoles();

    for (const role of ['member', 'viewer', 'manager', 'admin']) {
      const candidate = await registerAndLogin(`m27_new_${role}`);
      await addMemberReq(admin.token, teamId, candidate.userId, role).expect(200);
      expect(await memberRole(teamId, candidate.userId)).toBe(role);
    }
  });

  it('preserves normal add-member behavior: omitting role defaults to member', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const candidate = await registerAndLogin('m27_default_role');

    await addMemberReq(owner.token, teamId, candidate.userId).expect(200);

    expect(await memberRole(teamId, candidate.userId)).toBe('member');
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
