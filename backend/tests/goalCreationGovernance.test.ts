import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, registerAndLogin, addMember } from './utils/fixtures';

// Goal CREATION governance -- deliberately separate from
// goalReviewWorkflow.test.ts, which only ever covers the completion-review
// workflow (submit-review/approve/return). These tests cover whether a
// member-PROPOSED team goal becomes an official team goal at all, using
// the goals.creation_status column (migration 1786900000000).

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const createGoal = (token: string, teamId?: string, title = 'Governance Goal') =>
  request(app).post('/api/goals').set(authHeader(token)).send({ title, goalType: 'project', teamId });

const updateGoal = (token: string, goalId: string, body: Record<string, any>) =>
  request(app).put(`/api/goals/${goalId}`).set(authHeader(token)).send(body);

const submitReview = (token: string, goalId: string, body: Record<string, any> = {}) =>
  request(app).post(`/api/goals/${goalId}/submit-review`).set(authHeader(token)).send(body);

const approveCreation = (token: string, goalId: string) =>
  request(app).post(`/api/goals/${goalId}/approve-creation`).set(authHeader(token));

const rejectCreation = (token: string, goalId: string) =>
  request(app).post(`/api/goals/${goalId}/reject-creation`).set(authHeader(token));

const getGoalRow = async (goalId: string) => {
  const res = await pgPool.query('SELECT * FROM goals WHERE goal_id = $1', [goalId]);
  return res.rows[0];
};

describe('Goal creation governance', () => {
  it('a normal member creating a team goal enters pending_approval -- not immediately official', async () => {
    const owner = await registerAndLogin('gov_owner_a');
    const member = await registerAndLogin('gov_member_a');
    const teamId = await createTeam(owner.token, `GovTeamA_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const res = await createGoal(member.token, teamId).expect(201);
    expect(res.body.data.creation_status).toBe('pending_approval');
    expect(res.body.data.status).toBe('planning');

    const row = await getGoalRow(res.body.data.goal_id);
    expect(row.creation_status).toBe('pending_approval');
  });

  it('a manager (WRITE_ROLES member, still not a leader) creating a team goal also enters pending_approval', async () => {
    const owner = await registerAndLogin('gov_owner_m');
    const manager = await registerAndLogin('gov_manager_m');
    const teamId = await createTeam(owner.token, `GovTeamM_${Date.now()}`);
    await addMember(owner.token, teamId, manager.userId, 'manager').expect(200);

    const res = await createGoal(manager.token, teamId).expect(201);
    expect(res.body.data.creation_status).toBe('pending_approval');
  });

  it('a team leader (owner) creating a team goal is auto-approved -- creation_status stays NULL, no self-approval step', async () => {
    const owner = await registerAndLogin('gov_owner_b');
    const teamId = await createTeam(owner.token, `GovTeamB_${Date.now()}`);

    const res = await createGoal(owner.token, teamId).expect(201);
    expect(res.body.data.creation_status).toBeNull();

    const row = await getGoalRow(res.body.data.goal_id);
    expect(row.creation_status).toBeNull();
    expect(row.creation_reviewed_by).toBeNull();
  });

  it('an admin creating a team goal is also auto-approved, matching the same leadership tier as approval', async () => {
    const owner = await registerAndLogin('gov_owner_c');
    const admin = await registerAndLogin('gov_admin_c');
    const teamId = await createTeam(owner.token, `GovTeamC_${Date.now()}`);
    await addMember(owner.token, teamId, admin.userId, 'admin').expect(200);

    const res = await createGoal(admin.token, teamId).expect(201);
    expect(res.body.data.creation_status).toBeNull();
  });

  it('a personal (teamless) goal never gets a creation_status, regardless of who creates it', async () => {
    const member = await registerAndLogin('gov_personal_d');
    const res = await createGoal(member.token).expect(201);
    expect(res.body.data.creation_status).toBeNull();
    expect(res.body.data.team_id).toBeNull();
  });

  it('a team leader can approve a pending proposal, clearing creation_status and recording who/when', async () => {
    const owner = await registerAndLogin('gov_owner_e');
    const member = await registerAndLogin('gov_member_e');
    const teamId = await createTeam(owner.token, `GovTeamE_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const goalId = (await createGoal(member.token, teamId).expect(201)).body.data.goal_id;

    const res = await approveCreation(owner.token, goalId).expect(200);
    expect(res.body.data.creation_status).toBeNull();

    const row = await getGoalRow(goalId);
    expect(row.creation_status).toBeNull();
    expect(row.creation_reviewed_by).toBe(owner.userId);
    expect(row.creation_reviewed_at).not.toBeNull();
  });

  it('a team leader can reject a pending proposal', async () => {
    const owner = await registerAndLogin('gov_owner_f');
    const member = await registerAndLogin('gov_member_f');
    const teamId = await createTeam(owner.token, `GovTeamF_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const goalId = (await createGoal(member.token, teamId).expect(201)).body.data.goal_id;

    const res = await rejectCreation(owner.token, goalId).expect(200);
    expect(res.body.data.creation_status).toBe('rejected');

    const row = await getGoalRow(goalId);
    expect(row.creation_status).toBe('rejected');
    expect(row.creation_reviewed_by).toBe(owner.userId);
  });

  it('a normal member cannot approve their OWN proposal -- creating it grants no approval authority', async () => {
    const owner = await registerAndLogin('gov_owner_g');
    const member = await registerAndLogin('gov_member_g');
    const teamId = await createTeam(owner.token, `GovTeamG_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const goalId = (await createGoal(member.token, teamId).expect(201)).body.data.goal_id;

    await approveCreation(member.token, goalId).expect(403);
    await rejectCreation(member.token, goalId).expect(403);

    const row = await getGoalRow(goalId);
    expect(row.creation_status).toBe('pending_approval');
  });

  it('a normal member cannot approve or reject a DIFFERENT member\'s proposal either', async () => {
    const owner = await registerAndLogin('gov_owner_h');
    const proposer = await registerAndLogin('gov_proposer_h');
    const bystander = await registerAndLogin('gov_bystander_h');
    const teamId = await createTeam(owner.token, `GovTeamH_${Date.now()}`);
    await addMember(owner.token, teamId, proposer.userId, 'member').expect(200);
    await addMember(owner.token, teamId, bystander.userId, 'member').expect(200);
    const goalId = (await createGoal(proposer.token, teamId).expect(201)).body.data.goal_id;

    await approveCreation(bystander.token, goalId).expect(403);
    await rejectCreation(bystander.token, goalId).expect(403);
  });

  it('a leader of a DIFFERENT team cannot approve or reject this team\'s proposal (cross-team isolation)', async () => {
    const ownerA = await registerAndLogin('gov_owner_i1');
    const memberA = await registerAndLogin('gov_member_i1');
    const ownerB = await registerAndLogin('gov_owner_i2');
    const teamA = await createTeam(ownerA.token, `GovTeamI1_${Date.now()}`);
    await createTeam(ownerB.token, `GovTeamI2_${Date.now()}`);
    await addMember(ownerA.token, teamA, memberA.userId, 'member').expect(200);
    const goalId = (await createGoal(memberA.token, teamA).expect(201)).body.data.goal_id;

    await approveCreation(ownerB.token, goalId).expect(403);
    await rejectCreation(ownerB.token, goalId).expect(403);

    const row = await getGoalRow(goalId);
    expect(row.creation_status).toBe('pending_approval');
  });

  it('a non-member cannot approve or reject a proposal at all', async () => {
    const owner = await registerAndLogin('gov_owner_j');
    const member = await registerAndLogin('gov_member_j');
    const outsider = await registerAndLogin('gov_outsider_j');
    const teamId = await createTeam(owner.token, `GovTeamJ_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const goalId = (await createGoal(member.token, teamId).expect(201)).body.data.goal_id;

    await approveCreation(outsider.token, goalId).expect(403);
    await rejectCreation(outsider.token, goalId).expect(403);
  });

  it('progress and status updates are blocked on a pending proposal, even for its own creator', async () => {
    const owner = await registerAndLogin('gov_owner_k');
    const member = await registerAndLogin('gov_member_k');
    const teamId = await createTeam(owner.token, `GovTeamK_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const goalId = (await createGoal(member.token, teamId).expect(201)).body.data.goal_id;

    await updateGoal(member.token, goalId, { progress: 50 }).expect(403);
    await updateGoal(member.token, goalId, { status: 'active' }).expect(403);
    await updateGoal(owner.token, goalId, { progress: 50 }).expect(403);

    const row = await getGoalRow(goalId);
    expect(row.progress).toBe(0);
    expect(row.status).toBe('planning');
  });

  it('title/description edits on a pending proposal are still allowed (not blocked by creation governance)', async () => {
    const owner = await registerAndLogin('gov_owner_l');
    const member = await registerAndLogin('gov_member_l');
    const teamId = await createTeam(owner.token, `GovTeamL_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const goalId = (await createGoal(member.token, teamId).expect(201)).body.data.goal_id;

    const res = await updateGoal(member.token, goalId, { title: 'Renamed proposal' }).expect(200);
    expect(res.body.data.title).toBe('Renamed proposal');
  });

  it('submit-review is rejected for a goal still pending creation approval', async () => {
    const owner = await registerAndLogin('gov_owner_n');
    const member = await registerAndLogin('gov_member_n');
    const teamId = await createTeam(owner.token, `GovTeamN_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const goalId = (await createGoal(member.token, teamId).expect(201)).body.data.goal_id;

    await submitReview(member.token, goalId).expect(403);
  });

  it('submit-review is rejected for a goal whose creation proposal was rejected', async () => {
    const owner = await registerAndLogin('gov_owner_o');
    const member = await registerAndLogin('gov_member_o');
    const teamId = await createTeam(owner.token, `GovTeamO_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const goalId = (await createGoal(member.token, teamId).expect(201)).body.data.goal_id;
    await rejectCreation(owner.token, goalId).expect(200);

    await submitReview(member.token, goalId).expect(403);
  });

  it('approve-creation/reject-creation are rejected (400) once a proposal is no longer pending', async () => {
    const owner = await registerAndLogin('gov_owner_p');
    const member = await registerAndLogin('gov_member_p');
    const teamId = await createTeam(owner.token, `GovTeamP_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const goalId = (await createGoal(member.token, teamId).expect(201)).body.data.goal_id;
    await approveCreation(owner.token, goalId).expect(200);

    await approveCreation(owner.token, goalId).expect(400);
    await rejectCreation(owner.token, goalId).expect(400);
  });

  it('once approved, the goal behaves as a normal team goal -- progress updates and the review workflow work normally', async () => {
    const owner = await registerAndLogin('gov_owner_q');
    const member = await registerAndLogin('gov_member_q');
    const teamId = await createTeam(owner.token, `GovTeamQ_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const goalId = (await createGoal(member.token, teamId).expect(201)).body.data.goal_id;
    await approveCreation(owner.token, goalId).expect(200);

    await updateGoal(member.token, goalId, { status: 'active' }).expect(200);
    await updateGoal(member.token, goalId, { progress: 50 }).expect(200);
    await submitReview(member.token, goalId, { requestedStatus: 'completed' }).expect(200);
    const res = await request(app).post(`/api/goals/${goalId}/approve`).set(authHeader(owner.token)).expect(200);
    expect(res.body.data.status).toBe('completed');
  });

  it('LEGACY GOAL: a team goal created before this feature (creation_status NULL) is unaffected -- treated as already approved', async () => {
    const owner = await registerAndLogin('gov_owner_r');
    const teamId = await createTeam(owner.token, `GovTeamR_${Date.now()}`);
    const goalId = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;

    // Simulate a genuinely pre-migration row: force creation_status back
    // to NULL exactly as an already-existing row would already be.
    await pgPool.query('UPDATE goals SET creation_status = NULL WHERE goal_id = $1', [goalId]);

    const row = await getGoalRow(goalId);
    expect(row.creation_status).toBeNull();

    // No approval gate blocks any normal operation on it.
    await updateGoal(owner.token, goalId, { progress: 40 }).expect(200);
  });
});
