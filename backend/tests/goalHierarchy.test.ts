import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, registerAndLogin } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const createGoal = (token: string, teamId?: string) =>
  request(app).post('/api/goals').set(authHeader(token)).send({ title: 'M30 Test Goal', teamId });

const updateGoal = (token: string, goalId: string, body: Record<string, any>) =>
  request(app).put(`/api/goals/${goalId}`).set(authHeader(token)).send(body);

const getGoalParentId = async (goalId: string) => {
  const res = await pgPool.query('SELECT parent_goal_id FROM goals WHERE goal_id = $1', [goalId]);
  return res.rows[0]?.parent_goal_id;
};

describe('PUT /goals/:goalId -- Milestone 30: no cross-team parent_goal_id reassignment', () => {
  it('rejects setting parent_goal_id to a goal in a team the caller has no write access to, and leaves the DB unchanged', async () => {
    const ownerA = await registerAndLogin('m30_owner_a');
    const ownerB = await registerAndLogin('m30_owner_b');
    const teamA = await createTeam(ownerA.token, `M30_TeamA_${Date.now()}`);
    const teamB = await createTeam(ownerB.token, `M30_TeamB_${Date.now()}`);

    const goalARes = await createGoal(ownerA.token, teamA).expect(201);
    const goalA = goalARes.body.data.goal_id;
    const goalBRes = await createGoal(ownerB.token, teamB).expect(201);
    const goalB = goalBRes.body.data.goal_id;

    await updateGoal(ownerA.token, goalA, { parent_goal_id: goalB }).expect(403);

    expect(await getGoalParentId(goalA)).toBeNull();
  });

  it('allows setting parent_goal_id to a goal in a team the caller has write access to', async () => {
    const owner = await registerAndLogin('m30_owner_c');
    const teamA = await createTeam(owner.token, `M30_TeamA2_${Date.now()}`);

    const parentRes = await createGoal(owner.token, teamA).expect(201);
    const parentGoal = parentRes.body.data.goal_id;
    const childRes = await createGoal(owner.token, teamA).expect(201);
    const childGoal = childRes.body.data.goal_id;

    await updateGoal(owner.token, childGoal, { parent_goal_id: parentGoal }).expect(200);

    expect(await getGoalParentId(childGoal)).toBe(parentGoal);
  });

  it('excludes a foreign-team goal from progress aggregation even if a cross-team link exists', async () => {
    const ownerA = await registerAndLogin('m30_owner_d');
    const ownerB = await registerAndLogin('m30_owner_e');
    const teamA = await createTeam(ownerA.token, `M30_TeamA3_${Date.now()}`);
    const teamB = await createTeam(ownerB.token, `M30_TeamB3_${Date.now()}`);

    const goalARes = await createGoal(ownerA.token, teamA).expect(201);
    const goalA = goalARes.body.data.goal_id;
    const goalBRes = await createGoal(ownerB.token, teamB).expect(201);
    const goalB = goalBRes.body.data.goal_id;

    // Simulate a pre-existing cross-team link directly in the DB (bypassing
    // the now-guarded API), to prove calculateGoalProgress itself is
    // team-scoped and won't traverse into it regardless of how it got there.
    await pgPool.query('UPDATE goals SET parent_goal_id = $1 WHERE goal_id = $2', [goalA, goalB]);

    const progressRes = await request(app).get(`/api/goals/${goalA}/progress`).set(authHeader(ownerA.token)).expect(200);

    // Only goalA itself should be counted -- goalB (foreign team) must not
    // be folded into the aggregate despite the parent_goal_id link.
    expect(progressRes.body.data.total).toBe(1);
  });

  it('leaves normal updates that do not touch parent_goal_id unaffected', async () => {
    const owner = await registerAndLogin('m30_owner_f');
    const teamA = await createTeam(owner.token, `M30_TeamA4_${Date.now()}`);

    const goalRes = await createGoal(owner.token, teamA).expect(201);
    const goalId = goalRes.body.data.goal_id;

    const res = await updateGoal(owner.token, goalId, { status: 'active' }).expect(200);
    expect(res.body.data.status).toBe('active');
    expect(await getGoalParentId(goalId)).toBeNull();
  });
});
