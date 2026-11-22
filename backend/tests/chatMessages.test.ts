import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, addMember, registerAndLogin, buildTeamWithRoles } from './utils/fixtures';

// Chat V1 Task 3 -- message list/send only. Realtime, notifications,
// frontend, Sidebar, unread badge, and the read/mark-read endpoint are
// deliberately not implemented and not exercised here.

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const listMessages = (token: string, conversationId: string, qs = '') =>
  request(app).get(`/api/chat/conversations/${conversationId}/messages${qs}`).set(authHeader(token));

const sendMessage = (token: string, conversationId: string, body: unknown) =>
  request(app).post(`/api/chat/conversations/${conversationId}/messages`).set(authHeader(token)).send({ body });

const createTeamConvo = (token: string, teamId: string) =>
  request(app).post(`/api/chat/conversations/team/${teamId}`).set(authHeader(token));

const createDirect = (token: string, otherUserId: string) =>
  request(app).post('/api/chat/conversations/direct').set(authHeader(token)).send({ other_user_id: otherUserId });

describe('POST /api/chat/conversations/:conversationId/messages', () => {
  it('a participant can send a message', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convo.body.data.conversation_id;

    const res = await sendMessage(owner.token, conversationId, 'hello team').expect(201);
    expect(res.body.data.message.body).toBe('hello team');
    expect(res.body.data.message.conversation_id).toBe(conversationId);
    expect(res.body.data.message.sender_user_id).toBe(owner.userId);
    expect(res.body.data.message.seq).toBeDefined();
  });

  it('a non-participant cannot send (404)', async () => {
    const { teamId, owner, nonMember } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    await sendMessage(nonMember.token, convo.body.data.conversation_id, 'sneaky').expect(404);
  });

  it('a nonexistent conversation returns 404', async () => {
    const a = await registerAndLogin('send_none');
    await sendMessage(a.token, '11111111-1111-4111-8111-111111111111', 'hi').expect(404);
  });

  it('a foreign-team user cannot send into another team\'s conversation', async () => {
    const { teamId: teamAId, owner: ownerA } = await buildTeamWithRoles();
    const { owner: ownerB } = await buildTeamWithRoles();
    const convoA = await createTeamConvo(ownerA.token, teamAId).expect(200);
    await sendMessage(ownerB.token, convoA.body.data.conversation_id, 'intruding').expect(404);
  });

  it('removing a team member immediately blocks message sending', async () => {
    const { teamId, owner, member } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convo.body.data.conversation_id;

    await sendMessage(member.token, conversationId, 'before removal').expect(201);

    await request(app).delete(`/api/teams/${teamId}/members/${member.userId}`).set(authHeader(owner.token)).expect(200);

    await sendMessage(member.token, conversationId, 'after removal').expect(404);
  });

  it('a parent-team member cannot send into a child team\'s conversation', async () => {
    const parentOwner = await registerAndLogin('send_parent_owner');
    const parentMember = await registerAndLogin('send_parent_member');
    const parentTeamId = await createTeam(parentOwner.token, 'Send Parent Team');
    await addMember(parentOwner.token, parentTeamId, parentMember.userId, 'admin').expect(200);

    const childRes = await request(app)
      .post('/api/teams')
      .set(authHeader(parentOwner.token))
      .send({ teamName: 'Send Child Team', parentTeamId })
      .expect(201);
    const childTeamId = childRes.body.data.team_id;
    const convo = await createTeamConvo(parentOwner.token, childTeamId).expect(200);

    await sendMessage(parentMember.token, convo.body.data.conversation_id, 'parent intrusion').expect(404);
  });

  it('sender_user_id always comes from the authenticated caller, never request input', async () => {
    const { teamId, owner, admin } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convo.body.data.conversation_id;

    const res = await request(app)
      .post(`/api/chat/conversations/${conversationId}/messages`)
      .set(authHeader(owner.token))
      .send({ body: 'trying to spoof', sender_user_id: admin.userId, user_id: admin.userId, created_by: admin.userId })
      .expect(201);

    expect(res.body.data.message.sender_user_id).toBe(owner.userId);

    const row = await pgPool.query('SELECT sender_user_id FROM chat_messages WHERE message_id = $1', [
      res.body.data.message.message_id,
    ]);
    expect(row.rows[0].sender_user_id).toBe(owner.userId);
  });

  it('a client cannot smuggle a different conversation_id in the body', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const { teamId: otherTeamId, owner: otherOwner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const otherConvo = await createTeamConvo(otherOwner.token, otherTeamId).expect(200);

    const res = await request(app)
      .post(`/api/chat/conversations/${convo.body.data.conversation_id}/messages`)
      .set(authHeader(owner.token))
      .send({ body: 'hi', conversation_id: otherConvo.body.data.conversation_id })
      .expect(201);

    expect(res.body.data.message.conversation_id).toBe(convo.body.data.conversation_id);
  });

  it('rejects an empty body', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    await sendMessage(owner.token, convo.body.data.conversation_id, '').expect(400);
  });

  it('rejects a whitespace-only body', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    await sendMessage(owner.token, convo.body.data.conversation_id, '     ').expect(400);
  });

  it('rejects a body over 4000 characters', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    await sendMessage(owner.token, convo.body.data.conversation_id, 'a'.repeat(4001)).expect(400);
  });

  it('accepts exactly 1 character', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const res = await sendMessage(owner.token, convo.body.data.conversation_id, 'x').expect(201);
    expect(res.body.data.message.body).toBe('x');
  });

  it('accepts exactly 4000 characters', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const body = 'a'.repeat(4000);
    const res = await sendMessage(owner.token, convo.body.data.conversation_id, body).expect(201);
    expect(res.body.data.message.body).toBe(body);
  });

  it('trims surrounding whitespace before validating and storing', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const res = await sendMessage(owner.token, convo.body.data.conversation_id, '  hello  ').expect(201);
    expect(res.body.data.message.body).toBe('hello');
  });

  it('rejects a malformed conversationId', async () => {
    const a = await registerAndLogin('send_malformed');
    await sendMessage(a.token, 'not-a-uuid', 'hi').expect(400);
  });

  it('updates conversation last_message_at/last_message_preview atomically', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convo.body.data.conversation_id;

    await sendMessage(owner.token, conversationId, 'first message here').expect(201);

    const row = await pgPool.query('SELECT last_message_at, last_message_preview FROM conversations WHERE conversation_id = $1', [
      conversationId,
    ]);
    expect(row.rows[0].last_message_at).not.toBeNull();
    expect(row.rows[0].last_message_preview).toBe('first message here');
  });

  it('preview is truncated to 200 characters', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const longBody = 'x'.repeat(300);

    await sendMessage(owner.token, convo.body.data.conversation_id, longBody).expect(201);

    const row = await pgPool.query('SELECT last_message_preview FROM conversations WHERE conversation_id = $1', [
      convo.body.data.conversation_id,
    ]);
    expect(row.rows[0].last_message_preview).toHaveLength(200);
    expect(row.rows[0].last_message_preview).toBe('x'.repeat(200));
  });

  it('a rolled-back send leaves no partial message/metadata state (a rejected body never reaches the DB)', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convo.body.data.conversation_id;

    const before = await pgPool.query('SELECT last_message_at, last_message_preview FROM conversations WHERE conversation_id = $1', [
      conversationId,
    ]);

    await sendMessage(owner.token, conversationId, '').expect(400);

    const messageCount = await pgPool.query('SELECT COUNT(*)::int AS count FROM chat_messages WHERE conversation_id = $1', [
      conversationId,
    ]);
    expect(messageCount.rows[0].count).toBe(0);

    const after = await pgPool.query('SELECT last_message_at, last_message_preview FROM conversations WHERE conversation_id = $1', [
      conversationId,
    ]);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('the rate limiter is keyed per authenticated user, not merely IP -- two different users share no bucket', async () => {
    const { teamId, owner, admin } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convo.body.data.conversation_id;

    // 30/min is the configured ceiling for a single user. Exhausting it
    // for `owner` must not affect `admin`'s own independent budget in the
    // same conversation, on the same test-runner IP.
    await Promise.all(
      Array.from({ length: 30 }, (_, i) => sendMessage(owner.token, conversationId, `owner message ${i}`).expect(201))
    );
    await sendMessage(owner.token, conversationId, 'owner over limit').expect(429);

    await sendMessage(admin.token, conversationId, 'admin still has budget').expect(201);
  }, 60000);
});

describe('GET /api/chat/conversations/:conversationId/messages', () => {
  it('a participant can list messages', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convo.body.data.conversation_id;
    await sendMessage(owner.token, conversationId, 'hello').expect(201);

    const res = await listMessages(owner.token, conversationId).expect(200);
    expect(res.body.data.messages).toHaveLength(1);
    expect(res.body.data.messages[0].body).toBe('hello');
    expect(res.body.data.next_cursor).toBeNull();
  });

  it('a non-participant cannot list (404)', async () => {
    const { teamId, owner, nonMember } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    await listMessages(nonMember.token, convo.body.data.conversation_id).expect(404);
  });

  it('a foreign-team user cannot list another team\'s messages', async () => {
    const { teamId: teamAId, owner: ownerA } = await buildTeamWithRoles();
    const { owner: ownerB } = await buildTeamWithRoles();
    const convoA = await createTeamConvo(ownerA.token, teamAId).expect(200);
    await listMessages(ownerB.token, convoA.body.data.conversation_id).expect(404);
  });

  it('a direct conversation\'s messages are visible only to its two participants', async () => {
    const a = await registerAndLogin('list_msg_direct_a');
    const b = await registerAndLogin('list_msg_direct_b');
    const c = await registerAndLogin('list_msg_direct_c');
    const teamId = await createTeam(a.token, 'List Msg Direct Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);
    await addMember(a.token, teamId, c.userId, 'member').expect(200);

    const convo = await createDirect(a.token, b.userId).expect(200);
    const conversationId = convo.body.data.conversation_id;
    await sendMessage(a.token, conversationId, 'private').expect(201);

    await listMessages(a.token, conversationId).expect(200);
    await listMessages(b.token, conversationId).expect(200);
    await listMessages(c.token, conversationId).expect(404);
  });

  it('rejects a malformed conversationId', async () => {
    const a = await registerAndLogin('list_malformed');
    await listMessages(a.token, 'not-a-uuid').expect(400);
  });

  it('rejects a non-numeric cursor', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    await listMessages(owner.token, convo.body.data.conversation_id, '?cursor=abc').expect(400);
  });

  it('rejects a non-numeric limit', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    await listMessages(owner.token, convo.body.data.conversation_id, '?limit=abc').expect(400);
  });

  it('rejects limit=0 as invalid', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    await listMessages(owner.token, convo.body.data.conversation_id, '?limit=0').expect(400);
  });

  it('the 100-message cap cannot be bypassed by requesting a larger limit', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convo.body.data.conversation_id;

    const insertValues: string[] = [];
    const params: any[] = [conversationId, owner.userId];
    for (let i = 0; i < 120; i++) {
      params.push(`msg ${i}`);
      insertValues.push(`($1, $2, $${params.length})`);
    }
    await pgPool.query(`INSERT INTO chat_messages (conversation_id, sender_user_id, body) VALUES ${insertValues.join(', ')}`, params);

    const res = await listMessages(owner.token, conversationId, '?limit=500').expect(200);
    expect(res.body.data.messages).toHaveLength(100);
    expect(res.body.data.next_cursor).not.toBeNull();
  });

  it('returns an empty page with a null cursor for a conversation with no messages', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const res = await listMessages(owner.token, convo.body.data.conversation_id).expect(200);
    expect(res.body.data.messages).toEqual([]);
    expect(res.body.data.next_cursor).toBeNull();
  });

  describe('pagination across multiple pages', () => {
    it('walks a 25-message conversation in pages of 10 with no duplicates and no gaps, ending in a null cursor', async () => {
      const { teamId, owner } = await buildTeamWithRoles();
      const convo = await createTeamConvo(owner.token, teamId).expect(200);
      const conversationId = convo.body.data.conversation_id;

      const bodies: string[] = [];
      for (let i = 0; i < 25; i++) {
        bodies.push(`message ${i}`);
      }
      for (const body of bodies) {
        await sendMessage(owner.token, conversationId, body).expect(201);
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const qs = cursor ? `?limit=10&cursor=${cursor}` : '?limit=10';
        const res: request.Response = await listMessages(owner.token, conversationId, qs).expect(200);
        for (const m of res.body.data.messages) {
          seen.push(m.body);
        }
        cursor = res.body.data.next_cursor;
        pages += 1;
        expect(pages).toBeLessThan(10); // guard against an infinite loop on a bug
      } while (cursor !== null);

      // Newest-first pages, concatenated, should read newest-to-oldest --
      // reverse to compare against send order.
      expect(seen.reverse()).toEqual(bodies);
      expect(new Set(seen).size).toBe(25);
      expect(pages).toBe(3); // 10 + 10 + 5
    }, 120000);

    it('a cursor older than every message returns an empty page with a null cursor', async () => {
      const { teamId, owner } = await buildTeamWithRoles();
      const convo = await createTeamConvo(owner.token, teamId).expect(200);
      const conversationId = convo.body.data.conversation_id;
      await sendMessage(owner.token, conversationId, 'only message').expect(201);

      const res = await listMessages(owner.token, conversationId, '?cursor=1').expect(200);
      expect(res.body.data.messages).toEqual([]);
      expect(res.body.data.next_cursor).toBeNull();
    });
  });

  it('orders messages newest-first', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convo.body.data.conversation_id;

    await sendMessage(owner.token, conversationId, 'first').expect(201);
    await sendMessage(owner.token, conversationId, 'second').expect(201);
    await sendMessage(owner.token, conversationId, 'third').expect(201);

    const res = await listMessages(owner.token, conversationId).expect(200);
    expect(res.body.data.messages.map((m: any) => m.body)).toEqual(['third', 'second', 'first']);
  });

  it('returns only the minimal message fields, no unrelated user/database fields', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    await sendMessage(owner.token, convo.body.data.conversation_id, 'hi').expect(201);

    const res = await listMessages(owner.token, convo.body.data.conversation_id).expect(200);
    const message = res.body.data.messages[0];
    expect(Object.keys(message).sort()).toEqual(
      ['body', 'conversation_id', 'created_at', 'message_id', 'seq', 'sender_user_id'].sort()
    );
  });
});

describe('concurrency', () => {
  it('20 concurrent sends into the same conversation are all persisted with unique sequence numbers, and conversation metadata stays valid', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convo.body.data.conversation_id;

    const sendPromises = Array.from({ length: 20 }, (_, i) => sendMessage(owner.token, conversationId, `concurrent ${i}`));
    const results = await Promise.all(sendPromises);

    for (const res of results) {
      expect(res.status).toBe(201);
    }

    const rows = await pgPool.query('SELECT seq, body FROM chat_messages WHERE conversation_id = $1 ORDER BY seq', [
      conversationId,
    ]);
    expect(rows.rows).toHaveLength(20);
    const seqs = rows.rows.map((r: any) => r.seq);
    expect(new Set(seqs).size).toBe(20); // no two messages share a sequence number

    const bodiesSent = results.map((r) => r.body.data.message.body).sort();
    const bodiesStored = rows.rows.map((r: any) => r.body).sort();
    expect(bodiesStored).toEqual(bodiesSent); // no message was lost

    // last_message_at/preview must correspond to whichever message
    // actually holds the highest seq, regardless of the order the 20
    // concurrent transactions happened to commit in.
    const highestSeqMessage = rows.rows[rows.rows.length - 1];
    const conversationRow = await pgPool.query(
      'SELECT last_message_at, last_message_preview FROM conversations WHERE conversation_id = $1',
      [conversationId]
    );
    expect(conversationRow.rows[0].last_message_preview).toBe(highestSeqMessage.body);
  });

  it('concurrent sends across two different conversations do not interfere with each other\'s metadata', async () => {
    const { teamId: teamAId, owner: ownerA } = await buildTeamWithRoles();
    const { teamId: teamBId, owner: ownerB } = await buildTeamWithRoles();
    const convoA = await createTeamConvo(ownerA.token, teamAId).expect(200);
    const convoB = await createTeamConvo(ownerB.token, teamBId).expect(200);

    await Promise.all([
      sendMessage(ownerA.token, convoA.body.data.conversation_id, 'A message'),
      sendMessage(ownerB.token, convoB.body.data.conversation_id, 'B message'),
    ]);

    const rowA = await pgPool.query('SELECT last_message_preview FROM conversations WHERE conversation_id = $1', [
      convoA.body.data.conversation_id,
    ]);
    const rowB = await pgPool.query('SELECT last_message_preview FROM conversations WHERE conversation_id = $1', [
      convoB.body.data.conversation_id,
    ]);
    expect(rowA.rows[0].last_message_preview).toBe('A message');
    expect(rowB.rows[0].last_message_preview).toBe('B message');
  });
});
