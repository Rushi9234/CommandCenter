import request from 'supertest';
import { app } from '../src/app';
import { query } from '../src/db/client';
import { pgPool } from '../src/utils/database';
import { registerAndLogin, authHeader, createTeam } from './utils/fixtures';

describe('Target #6 — Goal → Task → Evidence Integration Tests', () => {
  let userToken: string;
  let userId: string;
  let user2Token: string;
  let user2Id: string;
  let teamId: string;
  let team2Id: string;
  let projectId: string;
  let project2Id: string;
  let goalId: string;

  beforeAll(async () => {
    // 1. Create User 1 (Leader/Owner of Team 1)
    const u1 = await registerAndLogin('t6_owner');
    userToken = u1.token;
    userId = u1.userId;

    // 2. Create User 2 (Leader of Team 2)
    const u2 = await registerAndLogin('t6_other');
    user2Token = u2.token;
    user2Id = u2.userId;

    // 3. Create Team 1 and Team 2 using fixtures helper
    teamId = await createTeam(userToken, `T6 Team Alpha ${Date.now()}`);
    team2Id = await createTeam(user2Token, `T6 Team Beta ${Date.now()}`);

    // 4. Create Project 1 in Team 1 and Project 2 in Team 2
    const p1Res = await request(app).post('/api/projects').set(authHeader(userToken)).send({
      projectName: 'T6 Project Alpha',
      teamId,
    }).expect(201);
    projectId = p1Res.body.data.project_id;

    const p2Res = await request(app).post('/api/projects').set(authHeader(user2Token)).send({
      projectName: 'T6 Project Beta',
      teamId: team2Id,
    }).expect(201);
    project2Id = p2Res.body.data.project_id;

    // 5. Create Team Goal in Team 1
    const gRes = await request(app).post('/api/goals').set(authHeader(userToken)).send({
      title: 'T6 Launch Goal',
      description: 'Goal for testing task linkage and evidence',
      goalType: 'milestone',
      teamId,
    }).expect(201);
    goalId = gRes.body.data.goal_id;
  });

  afterAll(async () => {
    // Cleanup created test rows in reverse dependency order
    if (projectId) await query('DELETE FROM tasks WHERE project_id = $1', [projectId]);
    if (project2Id) await query('DELETE FROM tasks WHERE project_id = $1', [project2Id]);
    if (projectId) await query('DELETE FROM projects WHERE project_id = $1', [projectId]);
    if (project2Id) await query('DELETE FROM projects WHERE project_id = $1', [project2Id]);
    if (userId || user2Id) await query('DELETE FROM goals WHERE created_by IN ($1, $2)', [userId, user2Id]);
    if (teamId) await query('DELETE FROM team_members WHERE team_id = $1', [teamId]);
    if (team2Id) await query('DELETE FROM team_members WHERE team_id = $1', [team2Id]);
    if (teamId) await query('DELETE FROM teams WHERE team_id = $1', [teamId]);
    if (team2Id) await query('DELETE FROM teams WHERE team_id = $1', [team2Id]);
    if (userId) await query('DELETE FROM users WHERE user_id = $1', [userId]);
    if (user2Id) await query('DELETE FROM users WHERE user_id = $1', [user2Id]);
    await pgPool.end();
  });

  it('1. Links task to a goal in the same team successfully', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(userToken))
      .send({
        title: 'Task 1 - Build UI',
        goalId,
        priority: 'high',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.goal_id).toBe(goalId);
  });

  it('2. Rejects linking a task to a goal belonging to a different team (cross-team IDOR protection)', async () => {
    // Create goal in Team 2
    const g2Res = await request(app).post('/api/goals').set(authHeader(user2Token)).send({
      title: 'Team 2 Goal',
      goalType: 'milestone',
      teamId: team2Id,
    }).expect(201);
    const foreignGoalId = g2Res.body.data.goal_id;

    // Try linking Task in Team 1 to Goal in Team 2
    const res = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(userToken))
      .send({
        title: 'Malicious Task',
        goalId: foreignGoalId,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/same team/i);
  });

  it('3. Calculates hybrid progress: pending-review task does NOT count as completed, approved task DOES count', async () => {
    // Create Task 2 linked to Goal 1
    const t2Res = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(userToken))
      .send({
        title: 'Task 2 - API Integration',
        goalId,
        owner: userId,
        reviewer: userId,
      }).expect(201);
    const task2Id = t2Res.body.data.task_id;

    // Currently: 2 linked tasks total (Task 1: assigned, Task 2: assigned). Completed = 0 -> Progress = 0%
    let progressRes = await request(app)
      .get(`/api/goals/${goalId}/progress`)
      .set(authHeader(userToken));
    expect(progressRes.status).toBe(200);
    expect(progressRes.body.data.progress).toBe(0);

    // Submit Task 2 for review -> status = 'review'. Completed MUST stay 0 -> Progress = 0%
    await request(app)
      .post(`/api/tasks/${task2Id}/submit`)
      .set(authHeader(userToken))
      .expect(200);

    progressRes = await request(app)
      .get(`/api/goals/${goalId}/progress`)
      .set(authHeader(userToken));
    expect(progressRes.body.data.progress).toBe(0);
    expect(progressRes.body.data.pending_review).toBe(1);

    // Approve Task 2 -> status = 'done'. Completed = 1 out of 2 -> Progress MUST be 50%
    await request(app)
      .post(`/api/tasks/${task2Id}/approve`)
      .set(authHeader(userToken))
      .expect(200);

    progressRes = await request(app)
      .get(`/api/goals/${goalId}/progress`)
      .set(authHeader(userToken));
    expect(progressRes.body.data.progress).toBe(50);
    expect(progressRes.body.data.completed).toBe(1);
    expect(progressRes.body.data.total).toBe(2);
  });

  it('4. Returns categorized verified evidence feed via GET /api/goals/:id/evidence', async () => {
    const res = await request(app)
      .get(`/api/goals/${goalId}/evidence`)
      .set(authHeader(userToken));

    expect(res.status).toBe(200);
    expect(res.body.data.goal.goal_id).toBe(goalId);
    expect(res.body.data.linked_tasks.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.progress_summary.progress).toBe(50);

    const categories = res.body.data.evidence.map((e: any) => e.category);
    expect(categories).toContain('VERIFIED'); // Approved Task 2
    expect(categories).toContain('IN_FLIGHT'); // Submitted Task 2 history event
  });

  it('5. Handles deleted tasks: unlinks active task count while preserving historical evidence with is_deleted tag', async () => {
    // Create Task 3 linked to Goal 1
    const t3Res = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(authHeader(userToken))
      .send({
        title: 'Task 3 - Temporary Spike',
        goalId,
      }).expect(201);
    const task3Id = t3Res.body.data.task_id;

    // Delete Task 3
    await request(app)
      .delete(`/api/tasks/${task3Id}`)
      .set(authHeader(userToken))
      .expect(200);

    // Fetch evidence -> Task 3 history event exists with is_deleted = true
    const evRes = await request(app)
      .get(`/api/goals/${goalId}/evidence`)
      .set(authHeader(userToken));

    expect(evRes.status).toBe(200);
    const deletedItem = evRes.body.data.evidence.find((e: any) => e.artifact_id === task3Id);
    expect(deletedItem).toBeDefined();
    expect(deletedItem.is_deleted).toBe(true);
    expect(deletedItem.display_title).toContain('[Task Deleted]');
  });

  it('6. Enforces personal goal privacy and denies unauthorized cross-team evidence access', async () => {
    // User 2 (Team 2) attempts to access User 1's Team 1 Goal evidence -> 403 Forbidden
    const unauthRes = await request(app)
      .get(`/api/goals/${goalId}/evidence`)
      .set(authHeader(user2Token));
    expect(unauthRes.status).toBe(403);

    // Create Personal Goal for User 1
    const pGoalRes = await request(app)
      .post('/api/goals')
      .set(authHeader(userToken))
      .send({
        title: 'Personal Secret Goal',
        goalType: 'milestone',
      }).expect(201);
    const personalGoalId = pGoalRes.body.data.goal_id;

    // User 2 attempts access to User 1's Personal Goal evidence -> 403 Forbidden
    const unauthPersonalRes = await request(app)
      .get(`/api/goals/${personalGoalId}/evidence`)
      .set(authHeader(user2Token));
    expect(unauthPersonalRes.status).toBe(403);
  });
});
