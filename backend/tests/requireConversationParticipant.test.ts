import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, addMember, registerAndLogin } from './utils/fixtures';
import {
  requireConversationParticipant,
  ConversationRequest,
} from '../src/common/middleware/requireConversationParticipant';

// Chat V1 Task 2 -- unit coverage for the reusable authorization primitive
// requireConversationParticipant. No Task 2 route mounts it yet (Task 2's
// three endpoints are GET /api/chat/conversations, POST
// /api/chat/conversations/direct, POST /api/chat/conversations/team/:teamId
// -- none take a :conversationId). It is built now, and tested directly
// here, so Task 3's message endpoints can mount it with this behavior
// already proven.

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const buildRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const runMiddleware = async (userId: string, conversationId: string) => {
  const req = { params: { conversationId }, user: { userId, role: 'member' } } as unknown as ConversationRequest;
  const res = buildRes();
  const next = jest.fn();
  await requireConversationParticipant()(req, res, next);
  return { req, res, next };
};

describe('requireConversationParticipant', () => {
  it('returns 404 for a nonexistent conversation', async () => {
    const user = await registerAndLogin('rcp_none');
    const fakeConversationId = '00000000-0000-0000-0000-000000000000';

    const { res, next } = await runMiddleware(user.userId, fakeConversationId);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Conversation not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 (not 403) for a direct conversation the caller is not a participant of', async () => {
    const a = await registerAndLogin('rcp_direct_a');
    const b = await registerAndLogin('rcp_direct_b');
    const outsider = await registerAndLogin('rcp_direct_outsider');
    const teamId = await createTeam(a.token, 'RCP Direct Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);

    const convoRes = await request(app)
      .post('/api/chat/conversations/direct')
      .set(authHeader(a.token))
      .send({ other_user_id: b.userId })
      .expect(200);
    const conversationId = convoRes.body.data.conversation_id;

    const { res, next } = await runMiddleware(outsider.userId, conversationId);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a direct conversation participant through and attaches the conversation to the request', async () => {
    const a = await registerAndLogin('rcp_ok_a');
    const b = await registerAndLogin('rcp_ok_b');
    const teamId = await createTeam(a.token, 'RCP OK Team');
    await addMember(a.token, teamId, b.userId, 'member').expect(200);

    const convoRes = await request(app)
      .post('/api/chat/conversations/direct')
      .set(authHeader(a.token))
      .send({ other_user_id: b.userId })
      .expect(200);
    const conversationId = convoRes.body.data.conversation_id;

    const { req, next } = await runMiddleware(a.userId, conversationId);

    expect(next).toHaveBeenCalledWith();
    expect(req.conversation?.conversation_id).toBe(conversationId);
  });

  it('team authorization is a live team_members check -- a team member with NO conversation_participants row is still authorized', async () => {
    const owner = await registerAndLogin('rcp_team_owner');
    const member = await registerAndLogin('rcp_team_member');
    const teamId = await createTeam(owner.token, 'RCP Live Team');
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const convoRes = await request(app)
      .post(`/api/chat/conversations/team/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);
    const conversationId = convoRes.body.data.conversation_id;

    // `member` never called the team-conversation endpoint themselves, so
    // they have no conversation_participants row for it at all -- proving
    // that table is not what authorizes them.
    const participantRow = await pgPool.query(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, member.userId]
    );
    expect(participantRow.rows.length).toBe(0);

    const { req, next } = await runMiddleware(member.userId, conversationId);

    expect(next).toHaveBeenCalledWith();
    expect(req.conversation?.conversation_id).toBe(conversationId);
  });

  it('removing a user from team_members immediately revokes their team-chat access, with no separate sync step', async () => {
    const owner = await registerAndLogin('rcp_removed_owner');
    const member = await registerAndLogin('rcp_removed_member');
    const teamId = await createTeam(owner.token, 'RCP Removal Team');
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const convoRes = await request(app)
      .post(`/api/chat/conversations/team/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);
    const conversationId = convoRes.body.data.conversation_id;

    const before = await runMiddleware(member.userId, conversationId);
    expect(before.next).toHaveBeenCalledWith();

    await request(app).delete(`/api/teams/${teamId}/members/${member.userId}`).set(authHeader(owner.token)).expect(200);

    const after = await runMiddleware(member.userId, conversationId);
    expect(after.res.status).toHaveBeenCalledWith(404);
    expect(after.next).not.toHaveBeenCalled();
  });

  it('a parent-team member is not authorized for a child team\'s conversation', async () => {
    const parentOwner = await registerAndLogin('rcp_parent_owner');
    const parentMember = await registerAndLogin('rcp_parent_member');
    const parentTeamId = await createTeam(parentOwner.token, 'RCP Parent');
    await addMember(parentOwner.token, parentTeamId, parentMember.userId, 'admin').expect(200);

    const childRes = await request(app)
      .post('/api/teams')
      .set(authHeader(parentOwner.token))
      .send({ teamName: 'RCP Child', parentTeamId })
      .expect(201);
    const childTeamId = childRes.body.data.team_id;

    const convoRes = await request(app)
      .post(`/api/chat/conversations/team/${childTeamId}`)
      .set(authHeader(parentOwner.token))
      .expect(200);
    const conversationId = convoRes.body.data.conversation_id;

    // parentMember has never been added to the CHILD team's team_members.
    const { res, next } = await runMiddleware(parentMember.userId, conversationId);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
});
