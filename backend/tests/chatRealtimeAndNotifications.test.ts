import request from 'supertest';
import { Pool } from 'pg';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, addMember, registerAndLogin, buildTeamWithRoles } from './utils/fixtures';
import { realtimeProvider } from '../src/realtime/inMemoryRealtimeProvider';
import { RealtimeEvent } from '../src/realtime/realtime.types';

// Chat V1 Task 4 -- realtime (`chat.message_created`) + notification
// (`chat_message` preference group) integration only. No frontend, no
// Sidebar, no mark-read endpoint, no Redis/multi-instance infrastructure.

beforeEach(async () => {
  await resetDatabase();
  // The provider is a module-level singleton shared by the whole app
  // (including the real SSE route) -- reset between tests so a
  // subscription left over from a previous test can never receive this
  // test's events.
  realtimeProvider.reset();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const createTeamConvo = (token: string, teamId: string) =>
  request(app).post(`/api/chat/conversations/team/${teamId}`).set(authHeader(token));

const createDirect = (token: string, otherUserId: string) =>
  request(app).post('/api/chat/conversations/direct').set(authHeader(token)).send({ other_user_id: otherUserId });

const sendMessage = (token: string, conversationId: string, body: string) =>
  request(app).post(`/api/chat/conversations/${conversationId}/messages`).set(authHeader(token)).send({ body });

const getMyNotifications = (token: string) => request(app).get('/api/notifications').set(authHeader(token));

const setPreference = (token: string, updates: Record<string, boolean>) =>
  request(app).put('/api/notifications/preferences').set(authHeader(token)).send(updates);

jest.setTimeout(60000);

describe('chat.message_created realtime -- team conversations', () => {
  it('a team member receives chat.message_created for a message sent in their team conversation', async () => {
    const { teamId, owner, member } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convo.body.data.conversation_id;

    const received: RealtimeEvent[] = [];
    const unsubscribe = realtimeProvider.subscribe(member.userId, [teamId], (event) => {
      if (event.type === 'chat.message_created') received.push(event);
    });

    await sendMessage(owner.token, conversationId, 'hello team').expect(201);
    unsubscribe();

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('chat.message_created');
    expect(received[0].teamId).toBe(teamId);
    expect(received[0].conversationId).toBe(conversationId);
  });

  it('a non-member does not receive the event', async () => {
    const { teamId, owner, nonMember } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);

    const received: RealtimeEvent[] = [];
    const unsubscribe = realtimeProvider.subscribe(nonMember.userId, [], (event) => received.push(event));

    await sendMessage(owner.token, convo.body.data.conversation_id, 'hello').expect(201);
    unsubscribe();

    expect(received).toHaveLength(0);
  });

  it('a member removed from the team no longer receives the event on a fresh subscription, while a current member still does', async () => {
    const { teamId, owner, member, admin } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convo.body.data.conversation_id;

    await request(app).delete(`/api/teams/${teamId}/members/${member.userId}`).set(authHeader(owner.token)).expect(200);

    // A fresh subscription for the removed member has no teams matching
    // this one -- exactly what a real reconnect (realtime.controller.ts's
    // own teamsRepository.getUserTeams lookup) would compute for them now.
    const removedMemberEvents: RealtimeEvent[] = [];
    const unsub1 = realtimeProvider.subscribe(member.userId, [], (event) => {
      if (event.type === 'chat.message_created') removedMemberEvents.push(event);
    });

    const stillMemberEvents: RealtimeEvent[] = [];
    const unsub2 = realtimeProvider.subscribe(admin.userId, [teamId], (event) => {
      if (event.type === 'chat.message_created') stillMemberEvents.push(event);
    });

    await sendMessage(owner.token, conversationId, 'after removal').expect(201);

    unsub1();
    unsub2();

    expect(removedMemberEvents).toHaveLength(0);
    expect(stillMemberEvents).toHaveLength(1);
  });

  it('a parent-team member does not receive the child team\'s event', async () => {
    const parentOwner = await registerAndLogin('rt_parent_owner');
    const parentMember = await registerAndLogin('rt_parent_member');
    const parentTeamId = await createTeam(parentOwner.token, 'RT Parent Team');
    await addMember(parentOwner.token, parentTeamId, parentMember.userId, 'admin').expect(200);

    const childRes = await request(app)
      .post('/api/teams')
      .set(authHeader(parentOwner.token))
      .send({ teamName: 'RT Child Team', parentTeamId })
      .expect(201);
    const childTeamId = childRes.body.data.team_id;
    const convo = await createTeamConvo(parentOwner.token, childTeamId).expect(200);

    // parentMember's real, current team list is [parentTeamId] only.
    const received: RealtimeEvent[] = [];
    const unsubscribe = realtimeProvider.subscribe(parentMember.userId, [parentTeamId], (event) => received.push(event));

    await sendMessage(parentOwner.token, convo.body.data.conversation_id, 'child team message').expect(201);
    unsubscribe();

    expect(received).toHaveLength(0);
  });

  it('the event contains no message body or unrelated fields', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);

    const received: RealtimeEvent[] = [];
    const unsubscribe = realtimeProvider.subscribe(owner.userId, [teamId], (event) => received.push(event));

    await sendMessage(owner.token, convo.body.data.conversation_id, 'this body must never leak into the event').expect(201);
    unsubscribe();

    expect(received).toHaveLength(1);
    expect(Object.keys(received[0]).sort()).toEqual(['conversationId', 'id', 'occurredAt', 'teamId', 'type'].sort());
    expect(JSON.stringify(received[0])).not.toContain('this body must never leak');
  });
});

describe('chat.message_created realtime -- direct conversations', () => {
  it('the sender receives the event too (multi-tab/session sync)', async () => {
    const a = await registerAndLogin('rt_direct_sender');
    const b = await registerAndLogin('rt_direct_recipient');
    const teamId = await createTeam(a.token, 'RT Direct Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);
    const convo = await createDirect(a.token, b.userId).expect(200);

    const senderEvents: RealtimeEvent[] = [];
    const unsubscribe = realtimeProvider.subscribe(a.userId, [], (event) => senderEvents.push(event));

    await sendMessage(a.token, convo.body.data.conversation_id, 'hi').expect(201);
    unsubscribe();

    expect(senderEvents).toHaveLength(1);
    expect(senderEvents[0].recipientUserId).toBe(a.userId);
  });

  it('the recipient receives the event', async () => {
    const a = await registerAndLogin('rt_direct_sender2');
    const b = await registerAndLogin('rt_direct_recipient2');
    const teamId = await createTeam(a.token, 'RT Direct Team 2');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);
    const convo = await createDirect(a.token, b.userId).expect(200);

    const recipientEvents: RealtimeEvent[] = [];
    const unsubscribe = realtimeProvider.subscribe(b.userId, [], (event) => {
      if (event.type === 'chat.message_created') recipientEvents.push(event);
    });

    await sendMessage(a.token, convo.body.data.conversation_id, 'hi').expect(201);
    unsubscribe();

    expect(recipientEvents).toHaveLength(1);
    expect(recipientEvents[0].conversationId).toBe(convo.body.data.conversation_id);
  });

  it('a third, unrelated user receives nothing, proving delivery targets only the two authoritative participants', async () => {
    const a = await registerAndLogin('rt_direct_sender3');
    const b = await registerAndLogin('rt_direct_recipient3');
    const c = await registerAndLogin('rt_direct_third3');
    const teamId = await createTeam(a.token, 'RT Direct Team 3');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);
    await addMember(a.token, teamId, c.userId, 'member').expect(200);
    const convo = await createDirect(a.token, b.userId).expect(200);

    const aEvents: RealtimeEvent[] = [];
    const bEvents: RealtimeEvent[] = [];
    const cEvents: RealtimeEvent[] = [];
    const collectChatOnly = (bucket: RealtimeEvent[]) => (e: RealtimeEvent) => {
      if (e.type === 'chat.message_created') bucket.push(e);
    };
    const unsubA = realtimeProvider.subscribe(a.userId, [], collectChatOnly(aEvents));
    const unsubB = realtimeProvider.subscribe(b.userId, [], collectChatOnly(bEvents));
    const unsubC = realtimeProvider.subscribe(c.userId, [], collectChatOnly(cEvents));

    await sendMessage(a.token, convo.body.data.conversation_id, 'hi').expect(201);

    unsubA();
    unsubB();
    unsubC();

    expect(aEvents).toHaveLength(1);
    expect(bEvents).toHaveLength(1);
    expect(cEvents).toHaveLength(0);
  });

  it('two separate subscriptions for the same user (two browser tabs) both receive the event independently', async () => {
    const a = await registerAndLogin('rt_direct_sender4');
    const b = await registerAndLogin('rt_direct_recipient4');
    const teamId = await createTeam(a.token, 'RT Direct Team 4');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);
    const convo = await createDirect(a.token, b.userId).expect(200);

    const tab1Events: RealtimeEvent[] = [];
    const tab2Events: RealtimeEvent[] = [];
    const unsubTab1 = realtimeProvider.subscribe(b.userId, [], (e) => {
      if (e.type === 'chat.message_created') tab1Events.push(e);
    });
    const unsubTab2 = realtimeProvider.subscribe(b.userId, [], (e) => {
      if (e.type === 'chat.message_created') tab2Events.push(e);
    });

    await sendMessage(a.token, convo.body.data.conversation_id, 'hi').expect(201);

    unsubTab1();
    unsubTab2();

    expect(tab1Events).toHaveLength(1);
    expect(tab2Events).toHaveLength(1);
  });
});

describe('transaction/publish ordering', () => {
  it('a fresh, independent connection can already see the message by the time the realtime event fires (commit-before-publish)', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convo.body.data.conversation_id;

    let capturedEvent: RealtimeEvent | null = null;
    const unsubscribe = realtimeProvider.subscribe(owner.userId, [teamId], (event) => {
      capturedEvent = event;
    });

    const res = await sendMessage(owner.token, conversationId, 'ordering check').expect(201);
    unsubscribe();

    expect(capturedEvent).not.toBeNull();

    // A completely separate pool/connection -- if IT can see the row after
    // the response (which only returns after the event already fired
    // synchronously inside publish()), the write was genuinely committed,
    // not merely visible within its own transaction.
    const freshPool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const row = await freshPool.query('SELECT 1 FROM chat_messages WHERE message_id = $1', [
        res.body.data.message.message_id,
      ]);
      expect(row.rows).toHaveLength(1);
    } finally {
      await freshPool.end();
    }
  });

  it('a simulated realtime publish failure does not roll back the message and does not fail the request', async () => {
    const { teamId, owner } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convo.body.data.conversation_id;

    const publishSpy = jest.spyOn(realtimeProvider, 'publish').mockImplementationOnce(() => {
      throw new Error('simulated realtime failure');
    });

    let res;
    try {
      res = await sendMessage(owner.token, conversationId, 'resilient message').expect(201);
    } finally {
      publishSpy.mockRestore();
    }

    const row = await pgPool.query('SELECT body FROM chat_messages WHERE message_id = $1', [res.body.data.message.message_id]);
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].body).toBe('resilient message');
  });
});

describe('chat notifications', () => {
  it('the direct recipient gets a notification, and the sender does not get one for their own message', async () => {
    const a = await registerAndLogin('notif_direct_sender');
    const b = await registerAndLogin('notif_direct_recipient');
    const teamId = await createTeam(a.token, 'Notif Direct Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);
    const convo = await createDirect(a.token, b.userId).expect(200);

    await sendMessage(a.token, convo.body.data.conversation_id, 'hello there').expect(201);

    const recipientNotifs = await getMyNotifications(b.token).expect(200);
    const chatNotif = recipientNotifs.body.data.notifications.find((n: any) => n.category === 'chat.message_created');
    expect(chatNotif).toBeDefined();
    expect(chatNotif.title).toBe('New message');
    expect(chatNotif.message).not.toContain('hello there');

    const senderNotifs = await getMyNotifications(a.token).expect(200);
    expect(senderNotifs.body.data.notifications.find((n: any) => n.category === 'chat.message_created')).toBeUndefined();
  });

  it('team members receive a team notification, excluding the sender', async () => {
    const { teamId, owner, admin, member } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);

    await sendMessage(owner.token, convo.body.data.conversation_id, 'team update').expect(201);

    const adminNotifs = await getMyNotifications(admin.token).expect(200);
    expect(adminNotifs.body.data.notifications.some((n: any) => n.category === 'chat.message_created')).toBe(true);

    const memberNotifs = await getMyNotifications(member.token).expect(200);
    expect(memberNotifs.body.data.notifications.some((n: any) => n.category === 'chat.message_created')).toBe(true);

    const ownerNotifs = await getMyNotifications(owner.token).expect(200);
    expect(ownerNotifs.body.data.notifications.some((n: any) => n.category === 'chat.message_created')).toBe(false);
  });

  it('a member removed from the team before the message is sent is not notified', async () => {
    const { teamId, owner, member } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);

    await request(app).delete(`/api/teams/${teamId}/members/${member.userId}`).set(authHeader(owner.token)).expect(200);

    await sendMessage(owner.token, convo.body.data.conversation_id, 'after removal').expect(201);

    const memberNotifs = await getMyNotifications(member.token).expect(200);
    expect(memberNotifs.body.data.notifications.some((n: any) => n.category === 'chat.message_created')).toBe(false);
  });

  it('disabling the chat_message preference suppresses the notification row entirely', async () => {
    const a = await registerAndLogin('notif_pref_sender');
    const b = await registerAndLogin('notif_pref_recipient');
    const teamId = await createTeam(a.token, 'Notif Pref Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);
    const convo = await createDirect(a.token, b.userId).expect(200);

    await setPreference(b.token, { chat_message: false }).expect(200);

    await sendMessage(a.token, convo.body.data.conversation_id, 'should be suppressed').expect(201);

    const recipientNotifs = await getMyNotifications(b.token).expect(200);
    expect(recipientNotifs.body.data.notifications.some((n: any) => n.category === 'chat.message_created')).toBe(false);
  });

  it('disabling the chat_message preference also suppresses the notification.created realtime event', async () => {
    const a = await registerAndLogin('notif_pref_rt_sender');
    const b = await registerAndLogin('notif_pref_rt_recipient');
    const teamId = await createTeam(a.token, 'Notif Pref RT Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);
    const convo = await createDirect(a.token, b.userId).expect(200);

    await setPreference(b.token, { chat_message: false }).expect(200);

    const notificationEvents: RealtimeEvent[] = [];
    const unsubscribe = realtimeProvider.subscribe(b.userId, [], (event) => {
      if (event.type === 'notification.created') notificationEvents.push(event);
    });

    await sendMessage(a.token, convo.body.data.conversation_id, 'should be suppressed').expect(201);
    unsubscribe();

    expect(notificationEvents).toHaveLength(0);
  });

  it('the notification never contains the full message body', async () => {
    const { teamId, owner, member } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const secretBody = 'this exact sentence must never appear in a notification';

    await sendMessage(owner.token, convo.body.data.conversation_id, secretBody).expect(201);

    const memberNotifs = await getMyNotifications(member.token).expect(200);
    const chatNotif = memberNotifs.body.data.notifications.find((n: any) => n.category === 'chat.message_created');
    expect(chatNotif).toBeDefined();
    expect(chatNotif.title).not.toContain(secretBody);
    expect(chatNotif.message).not.toContain(secretBody);
  });

  it('a team chat notification preserves the team_id as the current, schema-compatible conversation reference', async () => {
    const { teamId, owner, member } = await buildTeamWithRoles();
    const convo = await createTeamConvo(owner.token, teamId).expect(200);

    await sendMessage(owner.token, convo.body.data.conversation_id, 'ref check').expect(201);

    const memberNotifs = await getMyNotifications(member.token).expect(200);
    const chatNotif = memberNotifs.body.data.notifications.find((n: any) => n.category === 'chat.message_created');
    expect(chatNotif.team_id).toBe(teamId);
  });

  // Documents a known, deliberately-not-worked-around gap (see the Task 4
  // final report): notifications has no column that identifies "the other
  // user in a direct conversation" or a conversation directly, and this
  // task does not add one (no schema change was made). A direct-chat
  // notification therefore carries no entity-ref field yet -- precise
  // conversation deep-linking for DIRECT chat notifications is deferred,
  // not silently faked via an unrelated column.
  it('a direct chat notification carries the conversation_id', async () => {
    const a = await registerAndLogin('notif_ref_sender');
    const b = await registerAndLogin('notif_ref_recipient');
    const teamId = await createTeam(a.token, 'Notif Ref Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);
    const convo = await createDirect(a.token, b.userId).expect(200);

    await sendMessage(a.token, convo.body.data.conversation_id, 'ref check').expect(201);

    const recipientNotifs = await getMyNotifications(b.token).expect(200);
    const chatNotif = recipientNotifs.body.data.notifications.find((n: any) => n.category === 'chat.message_created');
    expect(chatNotif).toBeDefined();
    expect(chatNotif.conversation_id).toBe(convo.body.data.conversation_id);
  });
});

describe('POST /api/chat/conversations/:conversationId/read', () => {
  const markRead = (token: string, conversationId: string) =>
    request(app).post(`/api/chat/conversations/${conversationId}/read`).set(authHeader(token));

  const listConversations = (token: string) =>
    request(app).get('/api/chat/conversations').set(authHeader(token));

  it('marks conversation read, clears unread_count, and advances read cursor', async () => {
    const owner = await registerAndLogin('read_owner1');
    const member = await registerAndLogin('read_member1');
    const teamId = await createTeam(owner.token, `Read_Team_1_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const convoRes = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convoRes.body.data.conversation_id;

    await sendMessage(owner.token, conversationId, 'hello team').expect(201);

    // member has 1 unread message
    let listRes = await listConversations(member.token).expect(200);
    let convo = listRes.body.data.find((c: any) => c.conversation_id === conversationId);
    expect(convo.unread_count).toBe(1);

    // member calls mark-read
    await markRead(member.token, conversationId).expect(200);

    // unread_count becomes 0
    listRes = await listConversations(member.token).expect(200);
    convo = listRes.body.data.find((c: any) => c.conversation_id === conversationId);
    expect(convo.unread_count).toBe(0);
  });

  it('is idempotent and read cursor never moves backwards', async () => {
    const owner = await registerAndLogin('read_owner2');
    const member = await registerAndLogin('read_member2');
    const teamId = await createTeam(owner.token, `Read_Team_2_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const convoRes = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convoRes.body.data.conversation_id;

    await sendMessage(owner.token, conversationId, 'msg 1').expect(201);
    await sendMessage(owner.token, conversationId, 'msg 2').expect(201);

    await markRead(member.token, conversationId).expect(200);
    await markRead(member.token, conversationId).expect(200);

    const listRes = await listConversations(member.token).expect(200);
    const convo = listRes.body.data.find((c: any) => c.conversation_id === conversationId);
    expect(convo.unread_count).toBe(0);
  });

  it('new message after read increments unread count correctly', async () => {
    const owner = await registerAndLogin('read_owner3');
    const member = await registerAndLogin('read_member3');
    const teamId = await createTeam(owner.token, `Read_Team_3_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const convoRes = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convoRes.body.data.conversation_id;

    await sendMessage(owner.token, conversationId, 'msg 1').expect(201);
    await markRead(member.token, conversationId).expect(200);

    let listRes = await listConversations(member.token).expect(200);
    let convo = listRes.body.data.find((c: any) => c.conversation_id === conversationId);
    expect(convo.unread_count).toBe(0);

    await sendMessage(owner.token, conversationId, 'msg 2').expect(201);

    listRes = await listConversations(member.token).expect(200);
    convo = listRes.body.data.find((c: any) => c.conversation_id === conversationId);
    expect(convo.unread_count).toBe(1);
  });

  it('user-specific read isolation in team chat: B reading does not clear C unread count', async () => {
    const owner = await registerAndLogin('read_owner4');
    const admin = await registerAndLogin('read_admin4');
    const member = await registerAndLogin('read_member4');
    const teamId = await createTeam(owner.token, `Read_Team_4_${Date.now()}`);
    await addMember(owner.token, teamId, admin.userId, 'admin').expect(200);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const convoRes = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convoRes.body.data.conversation_id;

    await sendMessage(owner.token, conversationId, 'team msg').expect(201);

    // admin marks read
    await markRead(admin.token, conversationId).expect(200);

    const adminList = await listConversations(admin.token).expect(200);
    const adminConvo = adminList.body.data.find((c: any) => c.conversation_id === conversationId);
    expect(adminConvo.unread_count).toBe(0);

    // member has NOT read it yet
    const memberList = await listConversations(member.token).expect(200);
    const memberConvo = memberList.body.data.find((c: any) => c.conversation_id === conversationId);
    expect(memberConvo.unread_count).toBe(1);
  });

  it('unauthorized mark-read is rejected with 404', async () => {
    const owner = await registerAndLogin('read_owner5');
    const nonMember = await registerAndLogin('read_non5');
    const teamId = await createTeam(owner.token, `Read_Team_5_${Date.now()}`);
    const convoRes = await createTeamConvo(owner.token, teamId).expect(200);
    const conversationId = convoRes.body.data.conversation_id;

    await markRead(nonMember.token, conversationId).expect(404);
  });
});
