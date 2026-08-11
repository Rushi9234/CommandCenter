import request from 'supertest';
import jwt from 'jsonwebtoken';
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
// Milestone 46 -- N+1 batch-loading regressions (functional correctness,
// not a performance benchmark -- the fix is about round-trip COUNT, which
// isn't directly observable from an HTTP test, so these prove the output
// is still correct after the rewrite).
// ---------------------------------------------------------------------------

describe('Milestone 46 -- GET /teams/search batch-loading regression', () => {
  it('still returns the correct owner and member_count for multiple matched teams', async () => {
    const owner = await registerAndLogin('m46_search_owner');
    const member = await registerAndLogin('m46_search_member');
    const uniqueWord = `Zephyr${Date.now()}`;
    const teamId = await createTeam(owner.token, `${uniqueWord}_Team`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const res = await request(app).get(`/api/teams/search?q=${uniqueWord}`).set(authHeader(owner.token)).expect(200);
    const match = res.body.data.find((t: any) => t.team_id === teamId);
    expect(match).toBeDefined();
    expect(match.owner.username).toBe(owner.user.username);
    expect(match.member_count).toBe(2);
  });

  it('returns an empty array cleanly when nothing matches (regression -- no crash on zero results)', async () => {
    const { token } = await registerAndLogin('m46_search_empty');
    const res = await request(app).get(`/api/teams/search?q=NoTeamMatchesThisAtAll${Date.now()}`).set(authHeader(token)).expect(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('Milestone 46 -- GET /logs/standup batch-loading regression', () => {
  it('still returns only members who logged today, with the correct log content', async () => {
    const owner = await registerAndLogin('m46_standup_owner');
    const memberA = await registerAndLogin('m46_standup_member_a');
    const memberB = await registerAndLogin('m46_standup_member_b');
    const teamId = await createTeam(owner.token, `M46_Standup_${Date.now()}`);
    await addMember(owner.token, teamId, memberA.userId, 'member').expect(200);
    await addMember(owner.token, teamId, memberB.userId, 'member').expect(200);

    await request(app)
      .post('/api/logs')
      .set(authHeader(memberA.token))
      .send({ entryText: 'Made great progress on the standup batching fix today.' })
      .expect(201);
    // memberB and owner submit no log today.

    const res = await request(app).get(`/api/logs/standup?teamId=${teamId}`).set(authHeader(owner.token)).expect(200);
    expect(res.body.data.logs.length).toBe(1);
    expect(res.body.data.logs[0].entry_text).toMatch(/standup batching fix/);
  });

  it('returns an empty logs array cleanly when no member logged today (regression -- no crash on zero results)', async () => {
    const owner = await registerAndLogin('m46_standup_empty_owner');
    const teamId = await createTeam(owner.token, `M46_StandupEmpty_${Date.now()}`);

    const res = await request(app).get(`/api/logs/standup?teamId=${teamId}`).set(authHeader(owner.token)).expect(200);
    expect(res.body.data.logs).toEqual([]);
  });
});

describe('Milestone 46 -- blockers N+1 batch-loading regression', () => {
  const createBlocker = (token: string, teamId: string) =>
    request(app).post('/api/blockers').set(authHeader(token)).send({ teamId, title: 'M46 Blocker' });

  it('GET /teams/:teamId/blockers still returns the correct creator and message_count for multiple blockers', async () => {
    const owner = await registerAndLogin('m46_blockers_owner');
    const teamId = await createTeam(owner.token, `M46_Blockers_${Date.now()}`);
    const blockerARes = await createBlocker(owner.token, teamId).expect(201);
    const blockerBRes = await createBlocker(owner.token, teamId).expect(201);

    await request(app)
      .post(`/api/blockers/${blockerARes.body.data.blocker_id}/messages`)
      .set(authHeader(owner.token))
      .send({ messageText: 'First message' })
      .expect(201);
    await request(app)
      .post(`/api/blockers/${blockerARes.body.data.blocker_id}/messages`)
      .set(authHeader(owner.token))
      .send({ messageText: 'Second message' })
      .expect(201);

    const res = await request(app).get(`/api/teams/${teamId}/blockers`).set(authHeader(owner.token)).expect(200);
    const blockerA = res.body.data.find((b: any) => b.blocker_id === blockerARes.body.data.blocker_id);
    const blockerB = res.body.data.find((b: any) => b.blocker_id === blockerBRes.body.data.blocker_id);

    expect(blockerA.creator.username).toBe(owner.user.username);
    expect(blockerA.message_count).toBe(2);
    expect(blockerB.message_count).toBe(0);
  });

  it('GET /blockers/:blockerId/messages still returns the correct author for each message', async () => {
    const owner = await registerAndLogin('m46_messages_owner');
    const member = await registerAndLogin('m46_messages_member');
    const teamId = await createTeam(owner.token, `M46_Messages_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const blockerRes = await createBlocker(owner.token, teamId).expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    await request(app)
      .post(`/api/blockers/${blockerId}/messages`)
      .set(authHeader(owner.token))
      .send({ messageText: 'From the owner' })
      .expect(201);
    await request(app)
      .post(`/api/blockers/${blockerId}/messages`)
      .set(authHeader(member.token))
      .send({ messageText: 'From the member' })
      .expect(201);

    const res = await request(app).get(`/api/blockers/${blockerId}/messages`).set(authHeader(owner.token)).expect(200);
    expect(res.body.data.length).toBe(2);
    const ownerMsg = res.body.data.find((m: any) => m.message_text === 'From the owner');
    const memberMsg = res.body.data.find((m: any) => m.message_text === 'From the member');
    expect(ownerMsg.user.username).toBe(owner.user.username);
    expect(memberMsg.user.username).toBe(member.user.username);
  });
});

describe('Milestone 46 -- invites/join-requests N+1 batch-loading regression', () => {
  it('GET /invites/my still returns the correct team and inviter for multiple invites', async () => {
    const ownerA = await registerAndLogin('m46_invites_owner_a');
    const ownerB = await registerAndLogin('m46_invites_owner_b');
    const invitee = await registerAndLogin('m46_invites_invitee');
    const teamAId = await createTeam(ownerA.token, `M46_InvitesA_${Date.now()}`);
    const teamBId = await createTeam(ownerB.token, `M46_InvitesB_${Date.now()}`);

    await request(app).post(`/api/teams/${teamAId}/invite`).set(authHeader(ownerA.token)).send({ email: invitee.user.email }).expect(200);
    await request(app).post(`/api/teams/${teamBId}/invite`).set(authHeader(ownerB.token)).send({ email: invitee.user.email }).expect(200);

    const res = await request(app).get('/api/invites/my').set(authHeader(invitee.token)).expect(200);
    expect(res.body.data.length).toBe(2);
    const inviteFromA = res.body.data.find((i: any) => i.team.team_id === teamAId);
    const inviteFromB = res.body.data.find((i: any) => i.team.team_id === teamBId);
    expect(inviteFromA.inviter.username).toBe(ownerA.user.username);
    expect(inviteFromB.inviter.username).toBe(ownerB.user.username);
  });

  it('GET /teams/:teamId/join-requests still returns the correct requesting user for multiple requests', async () => {
    const owner = await registerAndLogin('m46_joinreq_owner');
    const joinerA = await registerAndLogin('m46_joinreq_joiner_a');
    const joinerB = await registerAndLogin('m46_joinreq_joiner_b');
    const teamId = await createTeam(owner.token, `M46_JoinReq_${Date.now()}`);

    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(joinerA.token)).expect(200);
    await request(app).post(`/api/teams/${teamId}/join`).set(authHeader(joinerB.token)).expect(200);

    const res = await request(app).get(`/api/teams/${teamId}/join-requests`).set(authHeader(owner.token)).expect(200);
    expect(res.body.data.length).toBe(2);
    const requestFromA = res.body.data.find((r: any) => r.user.user_id === joinerA.userId);
    const requestFromB = res.body.data.find((r: any) => r.user.user_id === joinerB.userId);
    expect(requestFromA.user.username).toBe(joinerA.user.username);
    expect(requestFromB.user.username).toBe(joinerB.user.username);
  });
});

describe('Milestone 46 -- goal hierarchy tree-building regression (O(n) rewrite)', () => {
  it('still builds the correct nested tree shape for a multi-level hierarchy', async () => {
    const owner = await registerAndLogin('m46_tree_owner');
    const teamId = await createTeam(owner.token, `M46_Tree_${Date.now()}`);

    const root = (await request(app).post('/api/goals').set(authHeader(owner.token)).send({ title: 'Root', teamId }).expect(201)).body
      .data;
    const child = (
      await request(app)
        .post('/api/goals')
        .set(authHeader(owner.token))
        .send({ title: 'Child', teamId, parentGoalId: root.goal_id })
        .expect(201)
    ).body.data;
    await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({ title: 'Grandchild', teamId, parentGoalId: child.goal_id })
      .expect(201);

    const res = await request(app).get(`/api/goals/hierarchy?teamId=${teamId}`).set(authHeader(owner.token)).expect(200);
    const rootNode = res.body.data.find((g: any) => g.goal_id === root.goal_id);
    expect(rootNode.children.length).toBe(1);
    expect(rootNode.children[0].title).toBe('Child');
    expect(rootNode.children[0].children.length).toBe(1);
    expect(rootNode.children[0].children[0].title).toBe('Grandchild');
  });
});

// ---------------------------------------------------------------------------
// Milestone 46 -- explicit JWT algorithm allowlist (defensive hardening)
// ---------------------------------------------------------------------------

describe('Milestone 46 -- JWT verification rejects an unsigned (alg: none) token', () => {
  it('a token crafted with alg: none is rejected, not treated as valid', async () => {
    const forgedToken = jwt.sign({ userId: 'attacker', role: 'admin' }, '', {
      algorithm: 'none' as any,
      expiresIn: '7d',
    });

    const res = await request(app).get('/api/logs/my').set('Authorization', `Bearer ${forgedToken}`);
    expect(res.status).toBe(401);
  });

  it('a legitimate, correctly-signed token still authenticates normally (regression)', async () => {
    const { token } = await registerAndLogin('m46_jwt_regression');
    await request(app).get('/api/logs/my').set(authHeader(token)).expect(200);
  });
});
