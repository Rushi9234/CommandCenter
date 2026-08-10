import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, registerAndLogin } from './utils/fixtures';
import { goalsRepository } from '../src/modules/goals/goals.repository';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const createGoal = (token: string, teamId?: string, parentGoalId?: string) =>
  request(app).post('/api/goals').set(authHeader(token)).send({ title: 'M45 Test Goal', teamId, parentGoalId });

const updateGoal = (token: string, goalId: string, body: Record<string, any>) =>
  request(app).put(`/api/goals/${goalId}`).set(authHeader(token)).send(body);

const getGoalParentId = async (goalId: string) => {
  const res = await pgPool.query('SELECT parent_goal_id FROM goals WHERE goal_id = $1', [goalId]);
  return res.rows[0]?.parent_goal_id;
};

describe('Milestone 45 -- goal hierarchy cycle prevention (closes the recursive-CTE DoS)', () => {
  it('rejects the second of two updates that would together create a 2-node cycle, and the DB is unchanged', async () => {
    const owner = await registerAndLogin('m45_cycle_2node_owner');
    const teamId = await createTeam(owner.token, `M45_Cycle2_${Date.now()}`);
    const goalA = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;
    const goalB = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;

    // A's parent -> B: legitimate, no cycle yet.
    await updateGoal(owner.token, goalA, { parent_goal_id: goalB }).expect(200);
    expect(await getGoalParentId(goalA)).toBe(goalB);

    // B's parent -> A would close the cycle A -> B -> A. Must be rejected.
    const res = await updateGoal(owner.token, goalB, { parent_goal_id: goalA });
    expect(res.status).toBe(400);
    expect(await getGoalParentId(goalB)).toBeNull();
  });

  it('rejects a 3-node cycle (A -> B -> C -> A) on the closing update, and the DB is unchanged', async () => {
    const owner = await registerAndLogin('m45_cycle_3node_owner');
    const teamId = await createTeam(owner.token, `M45_Cycle3_${Date.now()}`);
    const goalA = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;
    const goalB = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;
    const goalC = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;

    await updateGoal(owner.token, goalA, { parent_goal_id: goalB }).expect(200);
    await updateGoal(owner.token, goalB, { parent_goal_id: goalC }).expect(200);

    const res = await updateGoal(owner.token, goalC, { parent_goal_id: goalA });
    expect(res.status).toBe(400);
    expect(await getGoalParentId(goalC)).toBeNull();
  });

  it('rejects a goal being set as its own parent', async () => {
    const owner = await registerAndLogin('m45_cycle_self_owner');
    const teamId = await createTeam(owner.token, `M45_CycleSelf_${Date.now()}`);
    const goalA = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;

    const res = await updateGoal(owner.token, goalA, { parent_goal_id: goalA });
    expect(res.status).toBe(400);
    expect(await getGoalParentId(goalA)).toBeNull();
  });

  it('a legitimate, deep, acyclic re-parenting still works (regression)', async () => {
    const owner = await registerAndLogin('m45_cycle_regression_owner');
    const teamId = await createTeam(owner.token, `M45_CycleRegression_${Date.now()}`);
    const goalA = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;
    const goalB = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;
    const goalC = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;

    await updateGoal(owner.token, goalB, { parent_goal_id: goalA }).expect(200);
    await updateGoal(owner.token, goalC, { parent_goal_id: goalB }).expect(200);
    expect(await getGoalParentId(goalC)).toBe(goalB);
  });

  it('calculateGoalProgress terminates quickly even against directly-seeded cyclic data (defense-in-depth CTE guard)', async () => {
    // Seeds a cycle directly at the DB level, bypassing the new
    // application-level guard entirely -- this is the test that proves
    // the recursive CTE's OWN cycle-safety (the belt half of "belt and
    // suspenders"), independent of whether the write-time check works.
    const owner = await registerAndLogin('m45_cycle_cte_owner');
    const teamId = await createTeam(owner.token, `M45_CycleCTE_${Date.now()}`);
    const goalA = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;
    const goalB = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;

    await pgPool.query('UPDATE goals SET parent_goal_id = $1 WHERE goal_id = $2', [goalB, goalA]);
    await pgPool.query('UPDATE goals SET parent_goal_id = $1 WHERE goal_id = $2', [goalA, goalB]);

    const start = Date.now();
    const result = await goalsRepository.calculateGoalProgress(goalA);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(10000);
    expect(result.total).toBe(2);
  });

  it('wouldCreateCycle itself terminates against directly-seeded cyclic data (defense-in-depth for the check itself)', async () => {
    const owner = await registerAndLogin('m45_cycle_check_owner');
    const teamId = await createTeam(owner.token, `M45_CycleCheck_${Date.now()}`);
    const goalA = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;
    const goalB = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;
    const goalC = (await createGoal(owner.token, teamId).expect(201)).body.data.goal_id;

    await pgPool.query('UPDATE goals SET parent_goal_id = $1 WHERE goal_id = $2', [goalB, goalA]);
    await pgPool.query('UPDATE goals SET parent_goal_id = $1 WHERE goal_id = $2', [goalA, goalB]);

    const start = Date.now();
    const result = await goalsRepository.wouldCreateCycle(goalC, goalA);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(10000);
    expect(result).toBe(false);
  });
});
