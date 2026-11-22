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

const regUser = (label: string) => registerAndLogin(`${label}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);

describe('Goals UUID Bug Fix & Regression Matrix', () => {
  it('1. team goal + no parent (empty string parentGoalId)', async () => {
    const owner = await regUser('matrix_user_1');
    const teamId = await createTeam(owner.token, 'MatrixTeam1');

    const res = await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({
        title: 'Team Goal No Parent',
        description: 'Testing team goal with empty parentGoalId',
        goalType: 'project',
        parentGoalId: '',
        teamId: teamId,
        targetDate: '',
      })
      .expect(201);

    expect(res.body.data.goal_id).toBeDefined();
    expect(res.body.data.team_id).toBe(teamId);
    expect(res.body.data.parent_goal_id).toBeNull();
  });

  it('2. team goal + parent goal', async () => {
    const owner = await regUser('matrix_user_2');
    const teamId = await createTeam(owner.token, 'MatrixTeam2');

    const parentRes = await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({
        title: 'Parent Goal',
        goalType: 'company',
        teamId: teamId,
      })
      .expect(201);

    const parentId = parentRes.body.data.goal_id;

    const childRes = await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({
        title: 'Child Team Goal',
        goalType: 'project',
        parentGoalId: parentId,
        teamId: teamId,
      })
      .expect(201);

    expect(childRes.body.data.parent_goal_id).toBe(parentId);
  });

  it('3. Project Milestone + no parent (exact user reported workflow)', async () => {
    const owner = await regUser('matrix_user_3');
    const teamId = await createTeam(owner.token, 'Software Engg');

    const res = await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({
        title: 'need to fix the reload issue',
        description: 'everytime we reload and then the real time things appear',
        goalType: 'Project Milestone',
        parentGoalId: '',
        teamId: teamId,
        targetDate: '2026-09-23',
      })
      .expect(201);

    expect(res.body.data.title).toBe('need to fix the reload issue');
    expect(res.body.data.goal_type).toBe('Project Milestone');
    expect(res.body.data.parent_goal_id).toBeNull();
  });

  it('4. Project Milestone + parent goal', async () => {
    const owner = await regUser('matrix_user_4');
    const teamId = await createTeam(owner.token, 'MatrixTeam4');

    const parentRes = await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({ title: 'Root Strategic Goal', goalType: 'company', teamId })
      .expect(201);

    const res = await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({
        title: 'Project Milestone under Root',
        goalType: 'Project Milestone',
        parentGoalId: parentRes.body.data.goal_id,
        teamId,
      })
      .expect(201);

    expect(res.body.data.parent_goal_id).toBe(parentRes.body.data.goal_id);
  });

  it('5. personal goal (no team, no parent, empty strings)', async () => {
    const user = await regUser('matrix_user_5');

    const res = await request(app)
      .post('/api/goals')
      .set(authHeader(user.token))
      .send({
        title: 'Personal Goal',
        description: 'Self improvement',
        goalType: 'milestone',
        parentGoalId: '',
        teamId: '',
        targetDate: '',
      })
      .expect(201);

    expect(res.body.data.team_id).toBeNull();
    expect(res.body.data.parent_goal_id).toBeNull();
  });

  it('6. every other existing goal type', async () => {
    const user = await regUser('matrix_user_6');
    const types = ['company', 'department', 'project', 'milestone', 'custom_type_123'];

    for (const gType of types) {
      const res = await request(app)
        .post('/api/goals')
        .set(authHeader(user.token))
        .send({
          title: `Goal for ${gType}`,
          goalType: gType,
        })
        .expect(201);

      expect(res.body.data.goal_type).toBe(gType);
    }
  });

  it('7. valid UUID', async () => {
    const user = await regUser('matrix_user_7');
    const rootGoal = await request(app)
      .post('/api/goals')
      .set(authHeader(user.token))
      .send({ title: 'Root Goal', goalType: 'project' })
      .expect(201);

    const validUuid = rootGoal.body.data.goal_id;

    const childGoal = await request(app)
      .post('/api/goals')
      .set(authHeader(user.token))
      .send({
        title: 'Child Goal with Valid UUID',
        goalType: 'milestone',
        parentGoalId: validUuid,
      })
      .expect(201);

    expect(childGoal.body.data.parent_goal_id).toBe(validUuid);
  });

  it('8. malformed UUID is STILL rejected', async () => {
    const user = await regUser('matrix_user_8');

    const res1 = await request(app)
      .post('/api/goals')
      .set(authHeader(user.token))
      .send({
        title: 'Malformed Parent Goal ID',
        goalType: 'project',
        parentGoalId: 'invalid-uuid-string-123',
      })
      .expect(400);

    expect(res1.body.error).toMatch(/Invalid UUID/i);

    const res2 = await request(app)
      .post('/api/goals')
      .set(authHeader(user.token))
      .send({
        title: 'Malformed Team ID',
        goalType: 'project',
        teamId: 'not-a-real-uuid',
      })
      .expect(400);

    expect(res2.body.error).toMatch(/Invalid UUID/i);
  });

  it('9. empty optional UUID is converted to undefined / null', async () => {
    const user = await regUser('matrix_user_9');

    const res = await request(app)
      .post('/api/goals')
      .set(authHeader(user.token))
      .send({
        title: 'Empty Optional UUIDs',
        goalType: 'project',
        parentGoalId: '',
        teamId: '',
      })
      .expect(201);

    expect(res.body.data.parent_goal_id).toBeNull();
    expect(res.body.data.team_id).toBeNull();
  });

  it('10. "None" UI selection (literal string "None" vs empty string)', async () => {
    const user = await regUser('matrix_user_10');

    // Literal string "None" sent as UUID must be rejected
    const resNone = await request(app)
      .post('/api/goals')
      .set(authHeader(user.token))
      .send({
        title: 'Literal None as parentGoalId',
        goalType: 'project',
        parentGoalId: 'None',
      })
      .expect(400);

    expect(resNone.body.error).toMatch(/Invalid UUID/i);

    // Frontend option value is "" for None, which succeeds
    const resEmpty = await request(app)
      .post('/api/goals')
      .set(authHeader(user.token))
      .send({
        title: 'Frontend None selection (empty string)',
        goalType: 'project',
        parentGoalId: '',
      })
      .expect(201);

    expect(resEmpty.body.data.parent_goal_id).toBeNull();
  });

  it('11. edit existing goal', async () => {
    const user = await regUser('matrix_user_11');
    const created = await request(app)
      .post('/api/goals')
      .set(authHeader(user.token))
      .send({ title: 'Initial Title', goalType: 'project' })
      .expect(201);

    const goalId = created.body.data.goal_id;

    const updated = await request(app)
      .put(`/api/goals/${goalId}`)
      .set(authHeader(user.token))
      .send({ title: 'Updated Title', description: 'Updated Description' })
      .expect(200);

    expect(updated.body.data.title).toBe('Updated Title');
    expect(updated.body.data.description).toBe('Updated Description');
  });

  it('12. goal progress update', async () => {
    const user = await regUser('matrix_user_12');
    const created = await request(app)
      .post('/api/goals')
      .set(authHeader(user.token))
      .send({ title: 'Progress Goal', goalType: 'project' })
      .expect(201);

    const goalId = created.body.data.goal_id;

    const updated = await request(app)
      .put(`/api/goals/${goalId}`)
      .set(authHeader(user.token))
      .send({ progress: 75 })
      .expect(200);

    expect(updated.body.data.progress).toBe(75);
  });

  it('13. goal completion', async () => {
    const user = await regUser('matrix_user_13');
    const created = await request(app)
      .post('/api/goals')
      .set(authHeader(user.token))
      .send({ title: 'Goal To Complete', goalType: 'project' })
      .expect(201);

    const goalId = created.body.data.goal_id;

    const updated = await request(app)
      .put(`/api/goals/${goalId}`)
      .set(authHeader(user.token))
      .send({ status: 'completed', progress: 100 })
      .expect(200);

    expect(updated.body.data.status).toBe('completed');
    expect(updated.body.data.progress).toBe(100);
    expect(updated.body.data.completed_at).not.toBeNull();
  });

  it('14. goal hierarchy display endpoint', async () => {
    const user = await regUser('matrix_user_14');
    const root = await request(app)
      .post('/api/goals')
      .set(authHeader(user.token))
      .send({ title: 'Root Hierarchy Goal', goalType: 'company' })
      .expect(201);

    const child = await request(app)
      .post('/api/goals')
      .set(authHeader(user.token))
      .send({
        title: 'Child Hierarchy Goal',
        goalType: 'project',
        parentGoalId: root.body.data.goal_id,
      })
      .expect(201);

    const res = await request(app)
      .get('/api/goals/hierarchy')
      .set(authHeader(user.token))
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    const foundRoot = res.body.data.find((g: any) => g.goal_id === root.body.data.goal_id);
    expect(foundRoot).toBeDefined();
    expect(foundRoot.children).toBeDefined();
    expect(foundRoot.children.some((c: any) => c.goal_id === child.body.data.goal_id)).toBe(true);
  });
});
