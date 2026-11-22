import request from 'supertest';
import { app } from '../src/app';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, addMember, registerAndLogin, buildTeamWithRoles } from './utils/fixtures';

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

const listConversations = (token: string) =>
  request(app).get('/api/chat/conversations').set(authHeader(token));

const createDirect = (token: string, otherUserId: string) =>
  request(app).post('/api/chat/conversations/direct').set(authHeader(token)).send({ other_user_id: otherUserId });

describe('Task #4: Team Chat Historical Membership Privacy & Security Attack Matrix', () => {
  it('Scenario 1: User A is current member before M1/M2 -> A can read M1/M2', async () => {
    const userA = await registerAndLogin('privacy_s1_userA');
    const teamId = await createTeam(userA.token, 'Privacy Team S1');
    const convoRes = await createTeamConvo(userA.token, teamId).expect(200);
    const convoId = convoRes.body.data.conversation_id;

    await sendMessage(userA.token, convoId, 'M1').expect(201);
    await sendMessage(userA.token, convoId, 'M2').expect(201);

    const listRes = await listMessages(userA.token, convoId).expect(200);
    expect(listRes.body.data.messages.map((m: any) => m.body)).toEqual(['M2', 'M1']);
  });

  it('Scenario 2: User B joins after M1/M2 -> B CANNOT read M1/M2', async () => {
    const userA = await registerAndLogin('privacy_s2_userA');
    const userB = await registerAndLogin('privacy_s2_userB');
    const teamId = await createTeam(userA.token, 'Privacy Team S2');
    const convoRes = await createTeamConvo(userA.token, teamId).expect(200);
    const convoId = convoRes.body.data.conversation_id;

    await sendMessage(userA.token, convoId, 'M1').expect(201);
    await sendMessage(userA.token, convoId, 'M2').expect(201);

    // Wait 10ms to guarantee timestamp separation
    await new Promise((resolve) => setTimeout(resolve, 10));

    // User B joins team after M1 & M2
    await addMember(userA.token, teamId, userB.userId, 'member').expect(200);

    const listResB = await listMessages(userB.token, convoId).expect(200);
    expect(listResB.body.data.messages).toHaveLength(0);
  });

  it('Scenario 3: B sends M3 after joining -> B can read M3', async () => {
    const userA = await registerAndLogin('privacy_s3_userA');
    const userB = await registerAndLogin('privacy_s3_userB');
    const teamId = await createTeam(userA.token, 'Privacy Team S3');
    const convoRes = await createTeamConvo(userA.token, teamId).expect(200);
    const convoId = convoRes.body.data.conversation_id;

    await sendMessage(userA.token, convoId, 'M1').expect(201);
    await sendMessage(userA.token, convoId, 'M2').expect(201);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await addMember(userA.token, teamId, userB.userId, 'member').expect(200);

    await sendMessage(userB.token, convoId, 'M3').expect(201);

    const listResB = await listMessages(userB.token, convoId).expect(200);
    expect(listResB.body.data.messages.map((m: any) => m.body)).toEqual(['M3']);
  });

  it('Scenario 4: A is removed after M3 -> A cannot read/send afterward (404)', async () => {
    const userA = await registerAndLogin('privacy_s4_userA');
    const userB = await registerAndLogin('privacy_s4_userB');
    const teamId = await createTeam(userA.token, 'Privacy Team S4');
    await addMember(userA.token, teamId, userB.userId, 'member').expect(200);
    const convoRes = await createTeamConvo(userA.token, teamId).expect(200);
    const convoId = convoRes.body.data.conversation_id;

    await sendMessage(userA.token, convoId, 'M1').expect(201);
    await sendMessage(userB.token, convoId, 'M3').expect(201);

    // Remove user B
    await request(app).delete(`/api/teams/${teamId}/members/${userB.userId}`).set(authHeader(userA.token)).expect(200);

    // User B attempts access -> 404
    await listMessages(userB.token, convoId).expect(404);
    await sendMessage(userB.token, convoId, 'sneaky after removal').expect(404);
  });

  it('Scenario 5 & 6: Rejoin Epoch Rule -> A removed, M4 sent, A rejoins -> A cannot see M1..M4, but can read M5 sent after rejoin', async () => {
    const owner = await registerAndLogin('privacy_s5_owner');
    const userA = await registerAndLogin('privacy_s5_userA');
    const teamId = await createTeam(owner.token, 'Privacy Team S5');
    await addMember(owner.token, teamId, userA.userId, 'member').expect(200);
    const convoRes = await createTeamConvo(owner.token, teamId).expect(200);
    const convoId = convoRes.body.data.conversation_id;

    // Epoch 1 messages for User A
    await sendMessage(owner.token, convoId, 'M1').expect(201);
    await sendMessage(userA.token, convoId, 'M2').expect(201);
    await sendMessage(owner.token, convoId, 'M3').expect(201);

    // Remove User A
    await request(app).delete(`/api/teams/${teamId}/members/${userA.userId}`).set(authHeader(owner.token)).expect(200);

    // Message M4 sent while User A is absent
    await sendMessage(owner.token, convoId, 'M4').expect(201);

    await new Promise((resolve) => setTimeout(resolve, 10));

    // User A rejoins team -> Epoch 2 begins!
    await addMember(owner.token, teamId, userA.userId, 'member').expect(200);

    // User A MUST NOT see M1, M2, M3, or M4!
    const listResRejoined = await listMessages(userA.token, convoId).expect(200);
    expect(listResRejoined.body.data.messages).toHaveLength(0);

    // User A sends M5 in Epoch 2
    await sendMessage(userA.token, convoId, 'M5').expect(201);

    // User A should see ONLY M5!
    const listResAfterM5 = await listMessages(userA.token, convoId).expect(200);
    expect(listResAfterM5.body.data.messages.map((m: any) => m.body)).toEqual(['M5']);
  });

  it('Scenario 7 & 8: Backward pagination for late joiner -> returns no pre-membership messages', async () => {
    const userA = await registerAndLogin('privacy_s7_userA');
    const userB = await registerAndLogin('privacy_s7_userB');
    const teamId = await createTeam(userA.token, 'Privacy Team S7');
    const convoRes = await createTeamConvo(userA.token, teamId).expect(200);
    const convoId = convoRes.body.data.conversation_id;

    // Send 10 pre-membership messages
    for (let i = 1; i <= 10; i++) {
      await sendMessage(userA.token, convoId, `Pre-message ${i}`).expect(201);
    }

    await new Promise((resolve) => setTimeout(resolve, 10));

    // User B joins
    await addMember(userA.token, teamId, userB.userId, 'member').expect(200);

    // Send 2 post-membership messages
    await sendMessage(userA.token, convoId, 'Post-message 1').expect(201);
    await sendMessage(userB.token, convoId, 'Post-message 2').expect(201);

    // User B lists page 1
    const p1 = await listMessages(userB.token, convoId, '?limit=1').expect(200);
    expect(p1.body.data.messages).toHaveLength(1);
    expect(p1.body.data.messages[0].body).toBe('Post-message 2');
    const cursor = p1.body.data.next_cursor;

    // User B paginates to page 2
    const p2 = await listMessages(userB.token, convoId, `?limit=10&cursor=${cursor}`).expect(200);
    expect(p2.body.data.messages.map((m: any) => m.body)).toEqual(['Post-message 1']);
    expect(p2.body.data.next_cursor).toBeNull();
  });

  it('Scenario 11: Unread count for new member -> pre-membership messages NOT counted', async () => {
    const userA = await registerAndLogin('privacy_s11_userA');
    const userB = await registerAndLogin('privacy_s11_userB');
    const teamId = await createTeam(userA.token, 'Privacy Team S11');
    const convoRes = await createTeamConvo(userA.token, teamId).expect(200);
    const convoId = convoRes.body.data.conversation_id;

    // 5 pre-membership messages
    for (let i = 1; i <= 5; i++) {
      await sendMessage(userA.token, convoId, `Pre ${i}`).expect(201);
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
    await addMember(userA.token, teamId, userB.userId, 'member').expect(200);

    // User B lists conversations -> unread count for team convo MUST be 0!
    const convosB = await listConversations(userB.token).expect(200);
    const teamConvoB = convosB.body.data.find((c: any) => c.conversation_id === convoId);
    expect(teamConvoB).toBeDefined();
    expect(teamConvoB.unread_count).toBe(0);
    expect(teamConvoB.last_message_preview).toBeNull();

    // Now User A sends 1 post-membership message
    await sendMessage(userA.token, convoId, 'Post message').expect(201);

    // User B lists conversations again -> unread count should be 1
    const convosB2 = await listConversations(userB.token).expect(200);
    const teamConvoB2 = convosB2.body.data.find((c: any) => c.conversation_id === convoId);
    expect(teamConvoB2.unread_count).toBe(1);
    expect(teamConvoB2.last_message_preview).toBe('Post message');
  });

  it('Scenario 13: Cross-team conversation ID substitution -> returns 404', async () => {
    const ownerA = await registerAndLogin('privacy_s13_ownerA');
    const ownerB = await registerAndLogin('privacy_s13_ownerB');
    const teamA = await createTeam(ownerA.token, 'Team A');
    const teamB = await createTeam(ownerB.token, 'Team B');

    const convoA = await createTeamConvo(ownerA.token, teamA).expect(200);
    const convoAId = convoA.body.data.conversation_id;

    // Owner B attempts to list messages of Team A's conversation
    await listMessages(ownerB.token, convoAId).expect(404);
  });

  it('Scenario 14: Unauthenticated request -> returns 401', async () => {
    const owner = await registerAndLogin('privacy_s14_owner');
    const teamId = await createTeam(owner.token, 'Team S14');
    const convo = await createTeamConvo(owner.token, teamId).expect(200);
    const convoId = convo.body.data.conversation_id;

    await request(app).get(`/api/chat/conversations/${convoId}/messages`).expect(401);
    await request(app).post(`/api/chat/conversations/${convoId}/messages`).send({ body: 'unauth' }).expect(401);
  });

  it('Scenario 15: Direct 1:1 conversation regression -> 100% working and participant-isolated', async () => {
    const userA = await registerAndLogin('privacy_s15_userA');
    const userB = await registerAndLogin('privacy_s15_userB');
    const userC = await registerAndLogin('privacy_s15_userC');
    const teamId = await createTeam(userA.token, 'Shared Team S15');
    await addMember(userA.token, teamId, userB.userId, 'member').expect(200);
    await addMember(userA.token, teamId, userC.userId, 'member').expect(200);

    const directRes = await createDirect(userA.token, userB.userId).expect(200);
    const directConvoId = directRes.body.data.conversation_id;

    await sendMessage(userA.token, directConvoId, 'Direct message for B').expect(201);

    // Both A and B can read
    const listA = await listMessages(userA.token, directConvoId).expect(200);
    expect(listA.body.data.messages[0].body).toBe('Direct message for B');

    const listB = await listMessages(userB.token, directConvoId).expect(200);
    expect(listB.body.data.messages[0].body).toBe('Direct message for B');

    // C (not a participant) gets 404
    await listMessages(userC.token, directConvoId).expect(404);
  });
});
