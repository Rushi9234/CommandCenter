import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, addMember, registerAndLogin, buildTeamWithRoles } from './utils/fixtures';

// Chat V1 Task 2 -- conversation management only (GET /api/chat/conversations,
// POST /api/chat/conversations/direct, POST /api/chat/conversations/team/:teamId).
// No message send/list/read endpoints exist yet (Task 3).

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const listConversations = (token: string) => request(app).get('/api/chat/conversations').set(authHeader(token));

const createDirect = (token: string, otherUserId: string) =>
  request(app).post('/api/chat/conversations/direct').set(authHeader(token)).send({ other_user_id: otherUserId });

const createTeamConvo = (token: string, teamId: string) =>
  request(app).post(`/api/chat/conversations/team/${teamId}`).set(authHeader(token));

describe('POST /api/chat/conversations/team/:teamId', () => {
  it('a current member can get/create the team conversation', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const res = await createTeamConvo(owner.token, teamId).expect(200);
    expect(res.body.data.type).toBe('team');
    expect(res.body.data.team_id).toBe(teamId);
  });

  it('a non-member is rejected', async () => {
    const { teamId, nonMember } = await buildTeamWithRoles();
    await createTeamConvo(nonMember.token, teamId).expect(403);
  });

  it('repeated calls return the same conversation (idempotent)', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const res1 = await createTeamConvo(owner.token, teamId).expect(200);
    const res2 = await createTeamConvo(owner.token, teamId).expect(200);
    expect(res2.body.data.conversation_id).toBe(res1.body.data.conversation_id);

    const count = await pgPool.query('SELECT COUNT(*)::int AS count FROM conversations WHERE team_id = $1', [teamId]);
    expect(count.rows[0].count).toBe(1);
  });

  it('a parent-team member cannot access (create/get) a child team\'s conversation', async () => {
    const parentOwner = await registerAndLogin('parent_owner');
    const parentMember = await registerAndLogin('parent_member');
    const parentTeamId = await createTeam(parentOwner.token, 'Parent Team');
    await addMember(parentOwner.token, parentTeamId, parentMember.userId, 'admin').expect(200);

    const childRes = await request(app)
      .post('/api/teams')
      .set(authHeader(parentOwner.token))
      .send({ teamName: 'Child Team', parentTeamId })
      .expect(201);
    const childTeamId = childRes.body.data.team_id;

    // parentMember has never been added to the CHILD team's team_members --
    // only to the parent's. Parent-team membership must not grant child
    // team chat access.
    await createTeamConvo(parentMember.token, childTeamId).expect(403);
  });

  it('does NOT populate conversation_participants with every current team member', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const res = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = res.body.data.conversation_id;

    // buildTeamWithRoles adds 5 team_members rows (owner/admin/manager/
    // member/viewer); only the requesting user (owner) should have a
    // conversation_participants row, and only as a read-cursor cache.
    const rows = await pgPool.query('SELECT user_id FROM conversation_participants WHERE conversation_id = $1', [
      conversationId,
    ]);
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].user_id).toBe(owner.userId);
  });

  it('concurrent requests cannot create duplicate team conversations', async () => {
    const { teamId, owner, admin, manager } = await buildTeamWithRoles();
    const [res1, res2, res3] = await Promise.all([
      createTeamConvo(owner.token, teamId),
      createTeamConvo(admin.token, teamId),
      createTeamConvo(manager.token, teamId),
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);
    const ids = new Set([res1.body.data.conversation_id, res2.body.data.conversation_id, res3.body.data.conversation_id]);
    expect(ids.size).toBe(1);

    const count = await pgPool.query('SELECT COUNT(*)::int AS count FROM conversations WHERE team_id = $1', [teamId]);
    expect(count.rows[0].count).toBe(1);
  });

  // Deterministic proof, not a timing hope: holds a real Postgres row lock
  // open via an uncommitted transaction on the exact unique-index value the
  // atomic get-or-create targets, then issues the real call while that lock
  // is held. Postgres guarantees the real call's INSERT physically cannot
  // proceed until the lock is released -- mirrors
  // teamMembershipConcurrency.test.ts's established pattern for this
  // codebase.
  it('team conversation get-or-create is race-safe: a concurrent request blocks on the unique index until the first commits, then returns the same row', async () => {
    const { teamId, owner } = await buildTeamWithRoles();

    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO conversations (type, team_id, created_by) VALUES ('team', $1, $2) RETURNING conversation_id`,
        [teamId, owner.userId]
      );
      const heldConversationId = inserted.rows[0].conversation_id;

      const secondCallPromise = createTeamConvo(owner.token, teamId);
      await new Promise((resolve) => setTimeout(resolve, 150));

      await client.query('COMMIT');

      const res = await secondCallPromise;
      expect(res.status).toBe(200);
      expect(res.body.data.conversation_id).toBe(heldConversationId);
    } finally {
      client.release();
    }

    const count = await pgPool.query('SELECT COUNT(*)::int AS count FROM conversations WHERE team_id = $1', [teamId]);
    expect(count.rows[0].count).toBe(1);
  });
});

describe('POST /api/chat/conversations/direct', () => {
  it('a valid shared-team pair succeeds', async () => {
    const a = await registerAndLogin('direct_a');
    const b = await registerAndLogin('direct_b');
    const teamId = await createTeam(a.token, 'Direct Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);

    const res = await createDirect(a.token, b.userId).expect(200);
    expect(res.body.data.type).toBe('direct');
  });

  it('cannot DM self', async () => {
    const a = await registerAndLogin('direct_self');
    await createDirect(a.token, a.userId).expect(400);
  });

  it('rejects an invalid UUID', async () => {
    const a = await registerAndLogin('direct_invalid');
    await createDirect(a.token, 'not-a-uuid').expect(400);
  });

  it('rejects users with no shared team', async () => {
    const a = await registerAndLogin('direct_noshare_a');
    const b = await registerAndLogin('direct_noshare_b');
    await createDirect(a.token, b.userId).expect(403);
  });

  it('rejects a well-formed but nonexistent other_user_id the same way as no-shared-team (no existence oracle)', async () => {
    const a = await registerAndLogin('direct_nouser');
    const fakeUserId = '11111111-1111-4111-8111-111111111111';
    await createDirect(a.token, fakeUserId).expect(403);
  });

  it('returns the existing direct conversation on a repeat call (idempotent, from either side)', async () => {
    const a = await registerAndLogin('direct_idem_a');
    const b = await registerAndLogin('direct_idem_b');
    const teamId = await createTeam(a.token, 'Idem Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);

    const res1 = await createDirect(a.token, b.userId).expect(200);
    const res2 = await createDirect(a.token, b.userId).expect(200);
    const res3 = await createDirect(b.token, a.userId).expect(200);

    expect(res2.body.data.conversation_id).toBe(res1.body.data.conversation_id);
    expect(res3.body.data.conversation_id).toBe(res1.body.data.conversation_id);

    const count = await pgPool.query('SELECT COUNT(*)::int AS count FROM conversations WHERE direct_pair_key = $1', [
      [a.userId, b.userId].sort().join(':'),
    ]);
    expect(count.rows[0].count).toBe(1);
  });

  it('a third user cannot become a participant of an existing direct conversation', async () => {
    const a = await registerAndLogin('direct_third_a');
    const b = await registerAndLogin('direct_third_b');
    const c = await registerAndLogin('direct_third_c');
    const teamId = await createTeam(a.token, 'Third Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);
    await addMember(a.token, teamId, c.userId, 'member').expect(200);

    const abRes = await createDirect(a.token, b.userId).expect(200);
    const conversationId = abRes.body.data.conversation_id;

    // c creating their own direct conversation with a must not touch the
    // existing a-b conversation at all.
    await createDirect(c.token, a.userId).expect(200);

    const participants = await pgPool.query('SELECT user_id FROM conversation_participants WHERE conversation_id = $1', [
      conversationId,
    ]);
    const participantIds = participants.rows.map((r: any) => r.user_id).sort();
    expect(participantIds).toEqual([a.userId, b.userId].sort());
    expect(participantIds).not.toContain(c.userId);
  });

  it('concurrent get-or-create calls for the same pair cannot create duplicates', async () => {
    const a = await registerAndLogin('direct_concurrent_a');
    const b = await registerAndLogin('direct_concurrent_b');
    const teamId = await createTeam(a.token, 'Concurrent Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);

    const [res1, res2, res3] = await Promise.all([
      createDirect(a.token, b.userId),
      createDirect(a.token, b.userId),
      createDirect(b.token, a.userId),
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);
    const ids = new Set([res1.body.data.conversation_id, res2.body.data.conversation_id, res3.body.data.conversation_id]);
    expect(ids.size).toBe(1);

    const pairKey = [a.userId, b.userId].sort().join(':');
    const count = await pgPool.query('SELECT COUNT(*)::int AS count FROM conversations WHERE direct_pair_key = $1', [
      pairKey,
    ]);
    expect(count.rows[0].count).toBe(1);

    const participants = await pgPool.query(
      'SELECT user_id FROM conversation_participants WHERE conversation_id = (SELECT conversation_id FROM conversations WHERE direct_pair_key = $1)',
      [pairKey]
    );
    expect(participants.rows.length).toBe(2);
  });

  // Deterministic proof, same pattern as the team-conversation race test
  // above -- a real held Postgres lock, not a timing hope.
  it('direct conversation get-or-create is race-safe: a concurrent request blocks on the unique index until the first commits, then returns the same row', async () => {
    const a = await registerAndLogin('direct_race_a');
    const b = await registerAndLogin('direct_race_b');
    const teamId = await createTeam(a.token, 'Race Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);

    const pairKey = [a.userId, b.userId].sort().join(':');

    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO conversations (type, created_by, direct_pair_key) VALUES ('direct', $1, $2) RETURNING conversation_id`,
        [a.userId, pairKey]
      );
      const heldConversationId = inserted.rows[0].conversation_id;

      const secondCallPromise = createDirect(a.token, b.userId);
      await new Promise((resolve) => setTimeout(resolve, 150));

      await client.query('COMMIT');

      const res = await secondCallPromise;
      expect(res.status).toBe(200);
      expect(res.body.data.conversation_id).toBe(heldConversationId);
    } finally {
      client.release();
    }

    const count = await pgPool.query('SELECT COUNT(*)::int AS count FROM conversations WHERE direct_pair_key = $1', [
      pairKey,
    ]);
    expect(count.rows[0].count).toBe(1);
  });
});

describe('GET /api/chat/conversations', () => {
  it('an authenticated user receives only conversations they can access', async () => {
    const { teamId: teamAId, owner: ownerA } = await buildTeamWithRoles();
    const { teamId: teamBId, owner: ownerB } = await buildTeamWithRoles();

    await createTeamConvo(ownerA.token, teamAId).expect(200);
    await createTeamConvo(ownerB.token, teamBId).expect(200);

    const res = await listConversations(ownerA.token).expect(200);
    const teamIds = res.body.data.map((c: any) => c.team_id);
    expect(teamIds).toContain(teamAId);
    expect(teamIds).not.toContain(teamBId);
  });

  it('a team conversation is visible to a current member of any role', async () => {
    const { teamId, owner, viewer } = await buildTeamWithRoles();
    await createTeamConvo(owner.token, teamId).expect(200);

    const res = await listConversations(viewer.token).expect(200);
    expect(res.body.data.some((c: any) => c.team_id === teamId)).toBe(true);
  });

  it('a removed team member no longer sees the team conversation', async () => {
    const { teamId, owner, member } = await buildTeamWithRoles();
    await createTeamConvo(owner.token, teamId).expect(200);

    let res = await listConversations(member.token).expect(200);
    expect(res.body.data.some((c: any) => c.team_id === teamId)).toBe(true);

    await request(app).delete(`/api/teams/${teamId}/members/${member.userId}`).set(authHeader(owner.token)).expect(200);

    res = await listConversations(member.token).expect(200);
    expect(res.body.data.some((c: any) => c.team_id === teamId)).toBe(false);
  });

  it('a direct conversation is visible only to its two participants', async () => {
    const a = await registerAndLogin('list_direct_a');
    const b = await registerAndLogin('list_direct_b');
    const c = await registerAndLogin('list_direct_c');
    const teamId = await createTeam(a.token, 'List Direct Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);
    await addMember(a.token, teamId, c.userId, 'member').expect(200);

    const convoRes = await createDirect(a.token, b.userId).expect(200);
    const conversationId = convoRes.body.data.conversation_id;

    const aList = await listConversations(a.token).expect(200);
    const bList = await listConversations(b.token).expect(200);
    const cList = await listConversations(c.token).expect(200);

    expect(aList.body.data.some((conv: any) => conv.conversation_id === conversationId)).toBe(true);
    expect(bList.body.data.some((conv: any) => conv.conversation_id === conversationId)).toBe(true);
    expect(cList.body.data.some((conv: any) => conv.conversation_id === conversationId)).toBe(false);
  });

  it('a direct conversation exposes only minimal other_user information', async () => {
    const a = await registerAndLogin('list_privacy_a');
    const b = await registerAndLogin('list_privacy_b');
    const teamId = await createTeam(a.token, 'Privacy Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);
    await createDirect(a.token, b.userId).expect(200);

    const res = await listConversations(a.token).expect(200);
    const convo = res.body.data.find((c: any) => c.type === 'direct');
    expect(convo.other_user).toEqual({
      user_id: b.userId,
      full_name: b.user.fullName,
      username: b.user.username,
      avatar_url: null,
      avatar_key: null,
    });
    expect(convo.other_user.email).toBeUndefined();
    expect(convo.other_user.password_hash).toBeUndefined();
  });

  it('a conversation with no messages appears with a null preview/timestamp and zero unread', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    await createTeamConvo(owner.token, teamId).expect(200);

    const res = await listConversations(owner.token).expect(200);
    const convo = res.body.data.find((c: any) => c.team_id === teamId);
    expect(convo.last_message_preview).toBeNull();
    expect(convo.last_message_at).toBeNull();
    expect(convo.unread_count).toBe(0);
  });

  it('unread_count counts messages from others past last_read_seq (NULL treated as 0), never the caller\'s own', async () => {
    const { teamId, owner, admin } = await buildTeamWithRoles();
    const convoRes = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convoRes.body.data.conversation_id;

    // Task 3 hasn't built the send endpoint yet -- inserting directly
    // against the Task-1 schema is the only way to exercise this query's
    // unread-counting logic ahead of that endpoint existing.
    await pgPool.query(`INSERT INTO chat_messages (conversation_id, sender_user_id, body) VALUES ($1, $2, 'from admin')`, [
      conversationId,
      admin.userId,
    ]);
    await pgPool.query(`INSERT INTO chat_messages (conversation_id, sender_user_id, body) VALUES ($1, $2, 'from owner')`, [
      conversationId,
      owner.userId,
    ]);

    const res = await listConversations(owner.token).expect(200);
    const convo = res.body.data.find((c: any) => c.conversation_id === conversationId);
    // owner has never read (no last_read_seq yet) -- 1 unread from admin;
    // owner's own message is never counted as unread for owner.
    expect(convo.unread_count).toBe(1);
  });

  it('orders conversations newest last_message_at first, with no-message conversations still appearing', async () => {
    const a = await registerAndLogin('order_a');
    const teamId1 = await createTeam(a.token, 'Order Team 1');
    const teamId2 = await createTeam(a.token, 'Order Team 2');
    await createTeamConvo(a.token, teamId1).expect(200);
    const convo2 = await createTeamConvo(a.token, teamId2).expect(200);

    await pgPool.query(`UPDATE conversations SET last_message_at = NOW() WHERE conversation_id = $1`, [
      convo2.body.data.conversation_id,
    ]);

    const res = await listConversations(a.token).expect(200);
    const ids = res.body.data.map((c: any) => c.conversation_id);
    expect(ids[0]).toBe(convo2.body.data.conversation_id);
    expect(ids).toHaveLength(2);
  });
});

describe('security: no client-controlled identity fields', () => {
  it('created_by on a direct conversation is always the caller, never client-supplied', async () => {
    const a = await registerAndLogin('sec_direct_a');
    const b = await registerAndLogin('sec_direct_b');
    const teamId = await createTeam(a.token, 'Sec Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);

    // Attempting to smuggle a created_by/team_id field is simply ignored --
    // the DTO only recognizes other_user_id.
    const res = await request(app)
      .post('/api/chat/conversations/direct')
      .set(authHeader(a.token))
      .send({ other_user_id: b.userId, created_by: b.userId, team_id: teamId })
      .expect(200);

    const row = await pgPool.query('SELECT created_by FROM conversations WHERE conversation_id = $1', [
      res.body.data.conversation_id,
    ]);
    expect(row.rows[0].created_by).toBe(a.userId);
  });

  it('a client cannot inject a third participant via the request body', async () => {
    const a = await registerAndLogin('sec_inject_a');
    const b = await registerAndLogin('sec_inject_b');
    const c = await registerAndLogin('sec_inject_c');
    const teamId = await createTeam(a.token, 'Sec Inject Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);

    const res = await request(app)
      .post('/api/chat/conversations/direct')
      .set(authHeader(a.token))
      .send({ other_user_id: b.userId, participants: [a.userId, b.userId, c.userId] })
      .expect(200);

    const participants = await pgPool.query('SELECT user_id FROM conversation_participants WHERE conversation_id = $1', [
      res.body.data.conversation_id,
    ]);
    expect(participants.rows.length).toBe(2);
    expect(participants.rows.map((r: any) => r.user_id)).not.toContain(c.userId);
  });
});
