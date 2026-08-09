import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, addMember, registerAndLogin } from './utils/fixtures';
import { teamsRepository } from '../src/modules/teams/teams.repository';

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

const rejectInvite = (token: string, inviteId: string) => request(app).post(`/api/invites/${inviteId}/reject`).set(authHeader(token));

const requestJoin = (token: string, teamId: string) => request(app).post(`/api/teams/${teamId}/join`).set(authHeader(token));

const approveJoinRequest = (ownerToken: string, requestId: string) =>
  request(app).post(`/api/join-requests/${requestId}/approve`).set(authHeader(ownerToken));

const rejectJoinRequest = (ownerToken: string, requestId: string) =>
  request(app).post(`/api/join-requests/${requestId}/reject`).set(authHeader(ownerToken));

// ---------------------------------------------------------------------------
// Milestone 43 -- rejectInvite/approveJoinRequest/rejectJoinRequest now
// guard on status='pending', closing the accept/reject race and double-
// processing gaps.
// ---------------------------------------------------------------------------

describe('Milestone 43 -- rejectInvite cannot flip an already-accepted invite back to rejected', () => {
  it('rejecting an already-accepted invite is a clean error, and the invite stays accepted with membership intact', async () => {
    const owner = await registerAndLogin('m43_reject_accepted_owner');
    const invitee = await registerAndLogin('m43_reject_accepted_invitee');
    const teamId = await createTeam(owner.token, `M43_RejectAccepted_${Date.now()}`);

    const inviteRes = await invite(owner.token, teamId, invitee.user.email).expect(200);
    const inviteId = inviteRes.body.data.invite_id;

    await acceptInvite(invitee.token, inviteId).expect(200);

    // Directly exercises the repository-level race this milestone closes:
    // rejectInvite's own atomic guard, independent of the service-layer
    // assertInviteBelongsToCaller pre-check (which would itself reject
    // this via getUserInvites' status='pending' filter -- calling the
    // repository method directly proves the SQL-level fix, matching the
    // established M39/M40 deterministic-proof convention).
    const rejected = await teamsRepository.rejectInvite(inviteId);
    expect(rejected).toBeNull();

    const row = await pgPool.query('SELECT status FROM team_invites WHERE invite_id = $1', [inviteId]);
    expect(row.rows[0].status).toBe('accepted');

    const members = await pgPool.query('SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, invitee.userId]);
    expect(members.rows.length).toBe(1);
  });

  it('the HTTP-level reject on an already-accepted invite is rejected with 403 (assertInviteBelongsToCaller catches it first) and never reaches a 500', async () => {
    const owner = await registerAndLogin('m43_reject_http_owner');
    const invitee = await registerAndLogin('m43_reject_http_invitee');
    const teamId = await createTeam(owner.token, `M43_RejectHttp_${Date.now()}`);

    const inviteRes = await invite(owner.token, teamId, invitee.user.email).expect(200);
    const inviteId = inviteRes.body.data.invite_id;
    await acceptInvite(invitee.token, inviteId).expect(200);

    const res = await rejectInvite(invitee.token, inviteId);
    expect(res.status).toBe(403);
  });

  it('rejecting a still-pending invite still works normally (regression)', async () => {
    const owner = await registerAndLogin('m43_reject_normal_owner');
    const invitee = await registerAndLogin('m43_reject_normal_invitee');
    const teamId = await createTeam(owner.token, `M43_RejectNormal_${Date.now()}`);

    const inviteRes = await invite(owner.token, teamId, invitee.user.email).expect(200);
    await rejectInvite(invitee.token, inviteRes.body.data.invite_id).expect(200);

    const row = await pgPool.query('SELECT status FROM team_invites WHERE invite_id = $1', [inviteRes.body.data.invite_id]);
    expect(row.rows[0].status).toBe('rejected');
  });
});

describe('Milestone 43 -- approveJoinRequest/rejectJoinRequest cannot re-process an already-processed request', () => {
  it('approving an already-rejected join request is a clean error, and no membership is created', async () => {
    const owner = await registerAndLogin('m43_approve_rejected_owner');
    const joiner = await registerAndLogin('m43_approve_rejected_joiner');
    const teamId = await createTeam(owner.token, `M43_ApproveRejected_${Date.now()}`);

    const joinRes = await requestJoin(joiner.token, teamId).expect(200);
    const requestId = joinRes.body.data.request_id;

    await rejectJoinRequest(owner.token, requestId).expect(200);

    const res = await approveJoinRequest(owner.token, requestId);
    expect(res.status).toBe(400);

    const members = await pgPool.query('SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, joiner.userId]);
    expect(members.rows.length).toBe(0);

    const row = await pgPool.query('SELECT status FROM join_requests WHERE request_id = $1', [requestId]);
    expect(row.rows[0].status).toBe('rejected');
  });

  it('rejecting an already-approved join request is a clean error, and membership already granted is unaffected', async () => {
    const owner = await registerAndLogin('m43_reject_approved_owner');
    const joiner = await registerAndLogin('m43_reject_approved_joiner');
    const teamId = await createTeam(owner.token, `M43_RejectApproved_${Date.now()}`);

    const joinRes = await requestJoin(joiner.token, teamId).expect(200);
    const requestId = joinRes.body.data.request_id;

    await approveJoinRequest(owner.token, requestId).expect(200);

    const res = await rejectJoinRequest(owner.token, requestId);
    expect(res.status).toBe(400);

    const row = await pgPool.query('SELECT status FROM join_requests WHERE request_id = $1', [requestId]);
    expect(row.rows[0].status).toBe('approved');

    const members = await pgPool.query('SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, joiner.userId]);
    expect(members.rows.length).toBe(1);
  });

  it('a normal, single approve/reject still works (regression)', async () => {
    const owner = await registerAndLogin('m43_normal_approve_owner');
    const joinerA = await registerAndLogin('m43_normal_approve_joiner_a');
    const joinerB = await registerAndLogin('m43_normal_approve_joiner_b');
    const teamId = await createTeam(owner.token, `M43_NormalApprove_${Date.now()}`);

    const joinA = await requestJoin(joinerA.token, teamId).expect(200);
    await approveJoinRequest(owner.token, joinA.body.data.request_id).expect(200);
    const membersA = await pgPool.query('SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, joinerA.userId]);
    expect(membersA.rows.length).toBe(1);

    const joinB = await requestJoin(joinerB.token, teamId).expect(200);
    await rejectJoinRequest(owner.token, joinB.body.data.request_id).expect(200);
    const membersB = await pgPool.query('SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, joinerB.userId]);
    expect(membersB.rows.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Milestone 43 -- blockers.affected_tasks existence/same-team validation
// ---------------------------------------------------------------------------

describe('Milestone 43 -- blockers.affected_tasks must reference existing tasks in the same team', () => {
  const createProject = async (token: string, teamId: string) => {
    const res = await request(app).post('/api/projects').set(authHeader(token)).send({ projectName: 'M43 Project', teamId }).expect(201);
    return res.body.data.project_id;
  };
  const createTask = async (token: string, projectId: string) => {
    const res = await request(app).post(`/api/projects/${projectId}/tasks`).set(authHeader(token)).send({ title: 'M43 Task' }).expect(201);
    return res.body.data.task_id;
  };
  const createBlocker = (token: string, teamId: string, body: Record<string, any> = {}) =>
    request(app).post('/api/blockers').set(authHeader(token)).send({ teamId, title: 'M43 Blocker', ...body });

  it('rejects a nonexistent task ID in affectedTasks on create, and no blocker is created', async () => {
    const owner = await registerAndLogin('m43_blocker_nonexistent_owner');
    const teamId = await createTeam(owner.token, `M43_BlockerNonexistent_${Date.now()}`);
    const fakeTaskId = '00000000-0000-0000-0000-000000000000';

    const res = await createBlocker(owner.token, teamId, { affectedTasks: [fakeTaskId] });
    expect(res.status).toBe(400);

    const row = await pgPool.query('SELECT COUNT(*) FROM blockers WHERE team_id = $1', [teamId]);
    expect(Number(row.rows[0].count)).toBe(0);
  });

  it('rejects a task belonging to a DIFFERENT team in affectedTasks on create', async () => {
    const ownerA = await registerAndLogin('m43_blocker_crossteam_owner_a');
    const ownerB = await registerAndLogin('m43_blocker_crossteam_owner_b');
    const teamAId = await createTeam(ownerA.token, `M43_BlockerCrossA_${Date.now()}`);
    const teamBId = await createTeam(ownerB.token, `M43_BlockerCrossB_${Date.now()}`);
    const projectBId = await createProject(ownerB.token, teamBId);
    const taskInB = await createTask(ownerB.token, projectBId);

    const res = await createBlocker(ownerA.token, teamAId, { affectedTasks: [taskInB] });
    expect(res.status).toBe(400);
  });

  it('accepts a real task in the same team in affectedTasks on create', async () => {
    const owner = await registerAndLogin('m43_blocker_valid_owner');
    const teamId = await createTeam(owner.token, `M43_BlockerValid_${Date.now()}`);
    const projectId = await createProject(owner.token, teamId);
    const taskId = await createTask(owner.token, projectId);

    const res = await createBlocker(owner.token, teamId, { affectedTasks: [taskId] });
    expect(res.status).toBe(201);
  });

  it('rejects a cross-team task reference on update, and the row is unchanged', async () => {
    const ownerA = await registerAndLogin('m43_blocker_update_owner_a');
    const ownerB = await registerAndLogin('m43_blocker_update_owner_b');
    const teamAId = await createTeam(ownerA.token, `M43_BlockerUpdateA_${Date.now()}`);
    const teamBId = await createTeam(ownerB.token, `M43_BlockerUpdateB_${Date.now()}`);
    const projectBId = await createProject(ownerB.token, teamBId);
    const taskInB = await createTask(ownerB.token, projectBId);

    const blockerRes = await createBlocker(ownerA.token, teamAId).expect(201);
    const blockerId = blockerRes.body.data.blocker_id;

    const res = await request(app)
      .put(`/api/blockers/${blockerId}`)
      .set(authHeader(ownerA.token))
      .send({ affected_tasks: [taskInB] });
    expect(res.status).toBe(400);

    const row = await pgPool.query('SELECT affected_tasks FROM blockers WHERE blocker_id = $1', [blockerId]);
    expect(row.rows[0].affected_tasks).toEqual([]);
  });

  it('no affectedTasks at all still works (regression -- the check is opt-in)', async () => {
    const owner = await registerAndLogin('m43_blocker_no_tasks_owner');
    const teamId = await createTeam(owner.token, `M43_BlockerNoTasks_${Date.now()}`);
    await createBlocker(owner.token, teamId).expect(201);
  });
});
