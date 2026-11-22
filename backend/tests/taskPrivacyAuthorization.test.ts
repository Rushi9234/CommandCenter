import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, buildTeamWithRoles, registerAndLogin, addMember } from './utils/fixtures';

jest.setTimeout(60000);

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
});

describe('Task Privacy & Mutation Authorization Hardening', () => {
  const setupScenario = async () => {
    // team has owner (raju), member (pooja), and kiran (ordinary member)
    const team = await buildTeamWithRoles();
    const { teamId, owner: raju, member: pooja } = team;

    const kiran = await registerAndLogin('kiran_ordinary');
    await addMember(raju.token, teamId, kiran.userId, 'member');

    // Raju creates project
    const projectRes = await request(app)
      .post('/api/projects')
      .set(authHeader(raju.token))
      .send({ projectName: 'Alpha Project', teamId })
      .expect(201);
    const projectId = projectRes.body.data.project_id;

    // Raju assigns task to Pooja with Raju as reviewer
    const taskRes = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(raju.token))
      .send({
        title: "Pooja's Core Feature",
        description: 'Task assigned to Pooja',
        owner: pooja.userId,
        reviewer: raju.userId,
        priority: 'high',
      })
      .expect(201);
    const taskId = taskRes.body.data.task_id;

    return { raju, pooja, kiran, teamId, projectId, taskId };
  };

  it('A. Kiran (ordinary team member, non-owner) gets 403 on mutating Pooja\'s task', async () => {
    const { kiran, projectId, taskId } = await setupScenario();

    // View task list -> allowed
    const viewRes = await request(app)
      .get(`/api/projects/${projectId}/tasks`)
      .set(authHeader(kiran.token))
      .expect(200);
    expect(viewRes.body.data.some((t: any) => t.task_id === taskId)).toBe(true);

    // Edit task details -> 403
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(kiran.token))
      .send({ title: 'Kiran Hijacked Title' })
      .expect(403);

    // Change status -> 403
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(kiran.token))
      .send({ status: 'in_progress' })
      .expect(403);

    // Direct completion -> 403
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(kiran.token))
      .send({ status: 'done' })
      .expect(403);

    // Delete task -> 403
    await request(app)
      .delete(`/api/tasks/${taskId}`)
      .set(authHeader(kiran.token))
      .expect(403);

    // Reassign owner -> 403
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(kiran.token))
      .send({ owner: kiran.userId })
      .expect(403);

    // Submit for review -> 403
    await request(app)
      .post(`/api/tasks/${taskId}/submit`)
      .set(authHeader(kiran.token))
      .expect(403);

    // Approve task -> 403
    await request(app)
      .post(`/api/tasks/${taskId}/approve`)
      .set(authHeader(kiran.token))
      .expect(403);
  });

  it('B. Pooja (task owner) can edit progress, submit for review, but cannot bypass approval or reassign', async () => {
    const { pooja, kiran, taskId } = await setupScenario();

    // Edit task progress to in_progress -> allowed
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(pooja.token))
      .send({ status: 'in_progress' })
      .expect(200);

    // Direct completion bypass -> 403
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(pooja.token))
      .send({ status: 'done' })
      .expect(403);

    // Reassign owner to Kiran -> 403
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(pooja.token))
      .send({ owner: kiran.userId })
      .expect(403);

    // Submit for review -> 200 (moves status to review)
    const submitRes = await request(app)
      .post(`/api/tasks/${taskId}/submit`)
      .set(authHeader(pooja.token))
      .send({ notes: 'Ready for review' })
      .expect(200);
    expect(submitRes.body.data.status).toBe('review');
  });

  it('C. Raju (project owner / team leader) can reassign, approve, and delete tasks', async () => {
    const { raju, pooja, kiran, taskId } = await setupScenario();

    // Reassign task reviewer to Kiran
    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(raju.token))
      .send({ reviewer: kiran.userId })
      .expect(200);

    // Pooja submits task for review
    await request(app)
      .post(`/api/tasks/${taskId}/submit`)
      .set(authHeader(pooja.token))
      .expect(200);

    // Raju approves task
    const approveRes = await request(app)
      .post(`/api/tasks/${taskId}/approve`)
      .set(authHeader(raju.token))
      .expect(200);
    expect(approveRes.body.data.status).toBe('done');

    // Raju deletes task
    await request(app)
      .delete(`/api/tasks/${taskId}`)
      .set(authHeader(raju.token))
      .expect(200);
  });

  it('D. Project owner / creator cannot submit another user\'s assigned task for review', async () => {
    const { raju, taskId } = await setupScenario();

    // Raju (project owner & task creator) attempts to submit Pooja's task for review -> 403
    await request(app)
      .post(`/api/tasks/${taskId}/submit`)
      .set(authHeader(raju.token))
      .expect(403);
  });
});
