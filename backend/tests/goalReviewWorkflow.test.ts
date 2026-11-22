import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, registerAndLogin, addMember } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

// goalType now required by createGoalSchema (Goals UX cleanup phase --
// matches the create form's "Goal type *" label, which was previously
// inaccurate since the backend silently defaulted it). None of these
// tests are about goal type, so the helper supplies a default rather than
// every call site needing to know about this.
const createGoal = (token: string, teamId?: string) =>
  request(app).post('/api/goals').set(authHeader(token)).send({ title: 'Review Workflow Goal', goalType: 'project', teamId });

const updateGoal = (token: string, goalId: string, body: Record<string, any>) =>
  request(app).put(`/api/goals/${goalId}`).set(authHeader(token)).send(body);

const submitReview = (token: string, goalId: string, body: Record<string, any> = {}) =>
  request(app).post(`/api/goals/${goalId}/submit-review`).set(authHeader(token)).send(body);

const approveGoal = (token: string, goalId: string) =>
  request(app).post(`/api/goals/${goalId}/approve`).set(authHeader(token));

const returnGoal = (token: string, goalId: string, body: Record<string, any> = {}) =>
  request(app).post(`/api/goals/${goalId}/return`).set(authHeader(token)).send(body);

const getGoalRow = async (goalId: string) => {
  const res = await pgPool.query('SELECT * FROM goals WHERE goal_id = $1', [goalId]);
  return res.rows[0];
};

describe('Goal review workflow', () => {
  it('a normal member cannot mark a team goal completed directly via PUT', async () => {
    const owner = await registerAndLogin('review_owner_a');
    const member = await registerAndLogin('review_member_a');
    const teamId = await createTeam(owner.token, `ReviewTeamA_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const goalRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;

    await updateGoal(member.token, goalId, { status: 'completed' }).expect(403);

    const row = await getGoalRow(goalId);
    expect(row.status).not.toBe('completed');
  });

  it('a personal (teamless) goal can still be marked completed directly, unaffected by the review workflow', async () => {
    const owner = await registerAndLogin('review_owner_b');
    const goalRes = await createGoal(owner.token).expect(201);
    const goalId = goalRes.body.data.goal_id;

    await updateGoal(owner.token, goalId, { status: 'completed' }).expect(200);

    const row = await getGoalRow(goalId);
    expect(row.status).toBe('completed');
    expect(row.progress).toBe(100);
  });

  it('a member can submit a team goal for review, recording who and when', async () => {
    const owner = await registerAndLogin('review_owner_c');
    const member = await registerAndLogin('review_member_c');
    const teamId = await createTeam(owner.token, `ReviewTeamC_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const goalRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;

    const res = await submitReview(member.token, goalId).expect(200);
    expect(res.body.data.status).toBe('pending_review');

    const row = await getGoalRow(goalId);
    expect(row.status).toBe('pending_review');
    expect(row.submitted_for_review_by).toBe(member.userId);
    expect(row.submitted_for_review_at).not.toBeNull();
  });

  it('a normal member cannot approve a goal even after submitting it for review', async () => {
    const owner = await registerAndLogin('review_owner_d');
    const member = await registerAndLogin('review_member_d');
    const teamId = await createTeam(owner.token, `ReviewTeamD_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const goalRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;
    await submitReview(member.token, goalId).expect(200);

    await approveGoal(member.token, goalId).expect(403);

    const row = await getGoalRow(goalId);
    expect(row.status).toBe('pending_review');
  });

  it('CORRECTIVE FIX: approving a plain progress/stage sign-off request does NOT complete the goal', async () => {
    const owner = await registerAndLogin('review_owner_k');
    const member = await registerAndLogin('review_member_k');
    const teamId = await createTeam(owner.token, `ReviewTeamK_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const goalRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;

    // createGoal defaults a new goal's status to 'planning', not 'active' --
    // move it to 'active' first so this matches the scenario it's actually
    // testing ("40% -> 60%, In Progress -> In Progress"), same as any
    // in-flight goal a member would really be working on.
    await updateGoal(owner.token, goalId, { status: 'active' }).expect(200);

    // Lightweight, ungated progress bump -- exactly what a member does for
    // an ordinary 40% -> 60% style update. Must not require review at all.
    await updateGoal(member.token, goalId, { progress: 60 }).expect(200);
    expect((await getGoalRow(goalId)).progress).toBe(60);

    // Member asks the leader to sign off on the current stage -- NOT a
    // completion request (no requestedStatus, or requestedStatus left as
    // the goal's own current status).
    await submitReview(member.token, goalId).expect(200);
    const pending = await getGoalRow(goalId);
    expect(pending.status).toBe('pending_review');
    expect(pending.requested_status).toBe('active');

    const res = await approveGoal(owner.token, goalId).expect(200);

    // This is the actual bug: approving this sign-off must NOT produce
    // completed/100 -- it must return the goal to its requested (working)
    // status with progress untouched.
    expect(res.body.data.status).not.toBe('completed');
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.progress).toBe(60);

    const row = await getGoalRow(goalId);
    expect(row.status).toBe('active');
    expect(row.progress).toBe(60);
    expect(row.completed_at).toBeNull();
    expect(row.approved_by).toBe(owner.userId);
  });

  it('a team leader (owner) can approve an explicit completion request, setting completed + progress 100 + approver', async () => {
    const owner = await registerAndLogin('review_owner_e');
    const member = await registerAndLogin('review_member_e');
    const teamId = await createTeam(owner.token, `ReviewTeamE_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const goalRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;
    await submitReview(member.token, goalId, { requestedStatus: 'completed' }).expect(200);

    const res = await approveGoal(owner.token, goalId).expect(200);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.progress).toBe(100);

    const row = await getGoalRow(goalId);
    expect(row.status).toBe('completed');
    expect(row.progress).toBe(100);
    expect(row.approved_by).toBe(owner.userId);
    expect(row.approved_at).not.toBeNull();
    expect(row.completed_at).not.toBeNull();
  });

  it('an admin (not just the owner) can also approve, matching the existing owner/admin leadership tier', async () => {
    const owner = await registerAndLogin('review_owner_f');
    const admin = await registerAndLogin('review_admin_f');
    const member = await registerAndLogin('review_member_f');
    const teamId = await createTeam(owner.token, `ReviewTeamF_${Date.now()}`);
    await addMember(owner.token, teamId, admin.userId, 'admin').expect(200);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const goalRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;
    await submitReview(member.token, goalId, { requestedStatus: 'completed' }).expect(200);

    await approveGoal(admin.token, goalId).expect(200);
    const row = await getGoalRow(goalId);
    expect(row.status).toBe('completed');
  });

  it('a team leader can return a pending-review goal to in-progress, clearing submission/request markers', async () => {
    const owner = await registerAndLogin('review_owner_g');
    const member = await registerAndLogin('review_member_g');
    const teamId = await createTeam(owner.token, `ReviewTeamG_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const goalRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;
    await submitReview(member.token, goalId, { requestedStatus: 'completed' }).expect(200);

    const res = await returnGoal(owner.token, goalId).expect(200);
    expect(res.body.data.status).toBe('active');

    const row = await getGoalRow(goalId);
    expect(row.status).toBe('active');
    expect(row.requested_status).toBeNull();
    expect(row.submitted_for_review_by).toBeNull();
    expect(row.submitted_for_review_at).toBeNull();
    expect(row.approved_by).toBeNull();
  });

  it('a normal member cannot return a goal (leader-only, same as approve)', async () => {
    const owner = await registerAndLogin('review_owner_h');
    const member = await registerAndLogin('review_member_h');
    const teamId = await createTeam(owner.token, `ReviewTeamH_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const goalRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;
    await submitReview(member.token, goalId).expect(200);

    await returnGoal(member.token, goalId).expect(403);
  });

  it('approve is rejected when the goal is not currently pending review', async () => {
    const owner = await registerAndLogin('review_owner_i');
    const teamId = await createTeam(owner.token, `ReviewTeamI_${Date.now()}`);
    const goalRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;

    await approveGoal(owner.token, goalId).expect(400);
  });

  it('submit-review is rejected for a personal goal', async () => {
    const owner = await registerAndLogin('review_owner_j');
    const goalRes = await createGoal(owner.token).expect(201);
    const goalId = goalRes.body.data.goal_id;

    await submitReview(owner.token, goalId).expect(400);
  });

  it('LEGACY GOAL: a goal whose review columns have always been NULL (never touched review workflow) can still be submitted, approved, and completed normally', async () => {
    const owner = await registerAndLogin('review_owner_legacy');
    const member = await registerAndLogin('review_member_legacy');
    const teamId = await createTeam(owner.token, `ReviewTeamLegacy_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);

    const goalRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;

    // Simulates a goal that predates the review workflow entirely: all
    // four original review columns plus the new requested_status are
    // NULL, exactly as a genuinely pre-migration row would be -- NULL
    // must mean "no review pending," not "incompatible."
    const before = await getGoalRow(goalId);
    expect(before.submitted_for_review_by).toBeNull();
    expect(before.approved_by).toBeNull();
    expect(before.requested_status).toBeNull();

    await submitReview(member.token, goalId, { requestedStatus: 'completed' }).expect(200);
    const res = await approveGoal(owner.token, goalId).expect(200);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.progress).toBe(100);
  });
});

describe('Goal privacy -- team goal visibility', () => {
  it('a non-member cannot see a team goal via GET /goals?teamId=... (403, not empty/omitted)', async () => {
    const owner = await registerAndLogin('privacy_owner_a');
    const outsider = await registerAndLogin('privacy_outsider_a');
    const teamId = await createTeam(owner.token, `PrivacyTeamA_${Date.now()}`);
    await createGoal(owner.token, teamId).expect(201);

    await request(app)
      .get(`/api/goals?teamId=${teamId}`)
      .set(authHeader(outsider.token))
      .expect(403);
  });

  it('a non-member cannot see a team goal via GET /goals/hierarchy?teamId=...', async () => {
    const owner = await registerAndLogin('privacy_owner_b');
    const outsider = await registerAndLogin('privacy_outsider_b');
    const teamId = await createTeam(owner.token, `PrivacyTeamB_${Date.now()}`);
    await createGoal(owner.token, teamId).expect(201);

    await request(app)
      .get(`/api/goals/hierarchy?teamId=${teamId}`)
      .set(authHeader(outsider.token))
      .expect(403);
  });

  it("a non-member's own personal goal list (GET /goals, no teamId) never includes another team's goal", async () => {
    const owner = await registerAndLogin('privacy_owner_c');
    const outsider = await registerAndLogin('privacy_outsider_c');
    const teamId = await createTeam(owner.token, `PrivacyTeamC_${Date.now()}`);
    const goalRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;

    const res = await request(app).get('/api/goals').set(authHeader(outsider.token)).expect(200);
    const ids = res.body.data.map((g: any) => g.goal_id);
    expect(ids).not.toContain(goalId);
  });

  it('a non-member cannot read a team goal via GET /goals/:goalId/progress', async () => {
    const owner = await registerAndLogin('privacy_owner_d');
    const outsider = await registerAndLogin('privacy_outsider_d');
    const teamId = await createTeam(owner.token, `PrivacyTeamD_${Date.now()}`);
    const goalRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;

    await request(app).get(`/api/goals/${goalId}/progress`).set(authHeader(outsider.token)).expect(403);
  });

  it('a non-member cannot mutate a team goal via PUT, DELETE, submit-review, approve, or return', async () => {
    const owner = await registerAndLogin('privacy_owner_e');
    const member = await registerAndLogin('privacy_member_e');
    const outsider = await registerAndLogin('privacy_outsider_e');
    const teamId = await createTeam(owner.token, `PrivacyTeamE_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const goalRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;

    await updateGoal(outsider.token, goalId, { progress: 50 }).expect(403);
    await request(app).delete(`/api/goals/${goalId}`).set(authHeader(outsider.token)).expect(403);
    await submitReview(outsider.token, goalId).expect(403);

    await submitReview(member.token, goalId).expect(200);
    await approveGoal(outsider.token, goalId).expect(403);
    await returnGoal(outsider.token, goalId).expect(403);
  });

  it('a team member (not just owner/creator) CAN see the team goal -- privacy fix does not over-restrict legitimate access', async () => {
    const owner = await registerAndLogin('privacy_owner_f');
    const member = await registerAndLogin('privacy_member_f');
    const teamId = await createTeam(owner.token, `PrivacyTeamF_${Date.now()}`);
    await addMember(owner.token, teamId, member.userId, 'member').expect(200);
    const goalRes = await createGoal(owner.token, teamId).expect(201);
    const goalId = goalRes.body.data.goal_id;

    const res = await request(app).get(`/api/goals?teamId=${teamId}`).set(authHeader(member.token)).expect(200);
    expect(res.body.data.map((g: any) => g.goal_id)).toContain(goalId);
  });

  it('cross-team parent_goal_id cannot leak a foreign team goal through hierarchy building', async () => {
    const ownerA = await registerAndLogin('privacy_owner_g');
    const ownerB = await registerAndLogin('privacy_owner_h');
    const teamA = await createTeam(ownerA.token, `PrivacyTeamG_${Date.now()}`);
    const teamB = await createTeam(ownerB.token, `PrivacyTeamH_${Date.now()}`);
    const goalA = (await createGoal(ownerA.token, teamA).expect(201)).body.data.goal_id;
    const goalB = (await createGoal(ownerB.token, teamB).expect(201)).body.data.goal_id;

    // Team A's own goal cannot be re-parented under Team B's goal in the
    // first place (existing M30 protection) -- confirms the guard is
    // still intact, then independently verifies the hierarchy endpoint
    // itself never returns Team B's goal to a Team A caller regardless.
    await updateGoal(ownerA.token, goalA, { parent_goal_id: goalB }).expect(403);

    const res = await request(app).get(`/api/goals/hierarchy?teamId=${teamA}`).set(authHeader(ownerA.token)).expect(200);
    const flatten = (nodes: any[]): string[] => nodes.flatMap((n) => [n.goal_id, ...flatten(n.children || [])]);
    expect(flatten(res.body.data)).not.toContain(goalB);
  });
});
