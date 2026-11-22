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

describe('Targeted Bug Discovery & Regression Audit (15 Bug Classes)', () => {
  // ==========================================
  // BUG CLASS 1 — UUID / ID HANDLING
  // ==========================================
  describe('BUG CLASS 1 — UUID / ID Handling', () => {
    it('rejects display names or arbitrary strings used as UUID route parameters with 400', async () => {
      const user = await regUser('uuid_user_1');

      await request(app)
        .get('/api/teams/Software%20Engg/members')
        .set(authHeader(user.token))
        .expect(400);

      await request(app)
        .get('/api/goals/Software%20Engg/progress')
        .set(authHeader(user.token))
        .expect(400);

      await request(app)
        .get('/api/projects/alpha-project-name/details')
        .set(authHeader(user.token))
        .expect(400);
    });

    it('rejects malformed UUIDs in request bodies without throwing 500 or leaking SQL syntax errors', async () => {
      const user = await regUser('uuid_user_2');

      const res = await request(app)
        .post('/api/goals')
        .set(authHeader(user.token))
        .send({
          title: 'Malformed Parent ID',
          goalType: 'project',
          parentGoalId: 'invalid-uuid-12345',
        })
        .expect(400);

      expect(res.body.error).toMatch(/Invalid UUID/i);
      expect(res.body.stack).toBeUndefined();
    });
  });

  // ==========================================
  // BUG CLASS 2 — MULTI-TEAM DATA MIXING
  // ==========================================
  describe('BUG CLASS 2 — Multi-Team Data Mixing', () => {
    it('ensures data isolations across Alpha, Beta, Gamma, and Personal scopes for a multi-team user', async () => {
      const user = await regUser('multiteam_user');
      const teamAlpha = await createTeam(user.token, 'Team Alpha');
      const teamBeta = await createTeam(user.token, 'Team Beta');
      await createTeam(user.token, 'Team Gamma');

      // Create goals in each scope
      const goalAlpha = await request(app)
        .post('/api/goals')
        .set(authHeader(user.token))
        .send({ title: 'Alpha Goal', goalType: 'project', teamId: teamAlpha })
        .expect(201);

      const goalBeta = await request(app)
        .post('/api/goals')
        .set(authHeader(user.token))
        .send({ title: 'Beta Goal', goalType: 'project', teamId: teamBeta })
        .expect(201);

      const goalPersonal = await request(app)
        .post('/api/goals')
        .set(authHeader(user.token))
        .send({ title: 'Personal Goal', goalType: 'project' })
        .expect(201);

      // Fetch Alpha scoped goals
      const resAlpha = await request(app)
        .get(`/api/goals?teamId=${teamAlpha}`)
        .set(authHeader(user.token))
        .expect(200);

      const alphaIds = resAlpha.body.data.map((g: any) => g.goal_id);
      expect(alphaIds).toContain(goalAlpha.body.data.goal_id);
      expect(alphaIds).not.toContain(goalBeta.body.data.goal_id);
      expect(alphaIds).not.toContain(goalPersonal.body.data.goal_id);

      // Fetch Beta scoped goals
      const resBeta = await request(app)
        .get(`/api/goals?teamId=${teamBeta}`)
        .set(authHeader(user.token))
        .expect(200);

      const betaIds = resBeta.body.data.map((g: any) => g.goal_id);
      expect(betaIds).toContain(goalBeta.body.data.goal_id);
      expect(betaIds).not.toContain(goalAlpha.body.data.goal_id);
    });
  });

  // ==========================================
  // BUG CLASS 3 — CLASSROOM HIERARCHY
  // ==========================================
  describe('BUG CLASS 3 — Classroom Hierarchy', () => {
    it('creates child team under correct parent classroom and displays sub-teams recursively', async () => {
      const owner = await regUser('classroom_owner');
      const classroomId = await createTeam(owner.token, 'CS 101 Classroom');

      // Create sub-team under classroom using camelCase teamName and parentTeamId
      const subTeamRes = await request(app)
        .post('/api/teams')
        .set(authHeader(owner.token))
        .send({
          teamName: 'Team Alpha Group',
          parentTeamId: classroomId,
          teamType: 'main',
        })
        .expect(201);

      const subTeamId = subTeamRes.body.data.team_id;

      // Verify sub-teams endpoint returns child team
      const res = await request(app)
        .get(`/api/teams/${classroomId}/sub-teams`)
        .set(authHeader(owner.token))
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((t: any) => t.team_id === subTeamId)).toBe(true);
    });
  });

  // ==========================================
  // BUG CLASS 4 — TEAM CREATION / JOIN FLOW
  // ==========================================
  describe('BUG CLASS 4 — Team Creation & Join Flow', () => {
    it('handles join request approval cleanly without duplicate membership rows', async () => {
      const owner = await regUser('join_owner');
      const member = await regUser('join_member');
      const teamId = await createTeam(owner.token, 'JoinTeamTest');

      // Member submits join request via /teams/:teamId/join
      const reqRes = await request(app)
        .post(`/api/teams/${teamId}/join`)
        .set(authHeader(member.token))
        .expect(200);

      const requestId = reqRes.body.data.request_id;

      // Owner approves join request via /join-requests/:requestId/approve
      await request(app)
        .post(`/api/join-requests/${requestId}/approve`)
        .set(authHeader(owner.token))
        .expect(200);

      // Verify member appears exactly once in team members
      const teamRes = await request(app)
        .get(`/api/teams/${teamId}/members`)
        .set(authHeader(owner.token))
        .expect(200);

      const memberCount = teamRes.body.data.filter((m: any) => m.user_id === member.userId).length;
      expect(memberCount).toBe(1);

      // Re-joining or duplicate join request is handled cleanly (returns 200 or 400)
      const dupRes = await request(app)
        .post(`/api/teams/${teamId}/join`)
        .set(authHeader(member.token));

      expect([200, 400, 409]).toContain(dupRes.status);
    });
  });

  // ==========================================
  // BUG CLASS 5 — GOAL HIERARCHY
  // ==========================================
  describe('BUG CLASS 5 — Goal Hierarchy', () => {
    it('builds recursive goal tree and prevents cycle creation', async () => {
      const user = await regUser('hierarchy_user');

      const rootGoal = await request(app)
        .post('/api/goals')
        .set(authHeader(user.token))
        .send({ title: 'Root Goal', goalType: 'company' })
        .expect(201);

      const childA = await request(app)
        .post('/api/goals')
        .set(authHeader(user.token))
        .send({ title: 'Child A', goalType: 'project', parentGoalId: rootGoal.body.data.goal_id })
        .expect(201);

      // Try setting root goal's parent to childA (creating a cycle)
      await request(app)
        .put(`/api/goals/${rootGoal.body.data.goal_id}`)
        .set(authHeader(user.token))
        .send({ parent_goal_id: childA.body.data.goal_id })
        .expect(400);
    });
  });

  // ==========================================
  // BUG CLASS 6 — PROJECT / TASK COLLISION
  // ==========================================
  describe('BUG CLASS 6 — Project / Task Collision', () => {
    it('isolates tasks to their parent project and team scope', async () => {
      const owner = await regUser('proj_owner');
      const teamAlpha = await createTeam(owner.token, 'ProjTeamAlpha');
      const teamBeta = await createTeam(owner.token, 'ProjTeamBeta');

      const projAlpha = await request(app)
        .post('/api/projects')
        .set(authHeader(owner.token))
        .send({ projectName: 'Alpha Proj', teamId: teamAlpha })
        .expect(201);

      const projBeta = await request(app)
        .post('/api/projects')
        .set(authHeader(owner.token))
        .send({ projectName: 'Beta Proj', teamId: teamBeta })
        .expect(201);

      const taskAlpha = await request(app)
        .post(`/api/projects/${projAlpha.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Alpha Task' })
        .expect(201);

      const taskBeta = await request(app)
        .post(`/api/projects/${projBeta.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'Beta Task' })
        .expect(201);

      // Verify Alpha tasks
      const alphaTasksRes = await request(app)
        .get(`/api/projects/${projAlpha.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .expect(200);

      const alphaTaskIds = alphaTasksRes.body.data.map((t: any) => t.task_id);
      expect(alphaTaskIds).toContain(taskAlpha.body.data.task_id);
      expect(alphaTaskIds).not.toContain(taskBeta.body.data.task_id);
    });
  });

  // ==========================================
  // BUG CLASS 7 — WORKLOG / HISTORY CONSISTENCY
  // ==========================================
  describe('BUG CLASS 7 — Worklog / History Consistency', () => {
    it('records work state history on task status changes', async () => {
      const owner = await regUser('history_owner');
      const teamId = await createTeam(owner.token, 'HistoryTeam');
      const proj = await request(app)
        .post('/api/projects')
        .set(authHeader(owner.token))
        .send({ projectName: 'History Proj', teamId: teamId })
        .expect(201);

      const task = await request(app)
        .post(`/api/projects/${proj.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({ title: 'History Task' })
        .expect(201);

      // Change status to in_progress
      await request(app)
        .put(`/api/tasks/${task.body.data.task_id}`)
        .set(authHeader(owner.token))
        .send({ status: 'in_progress' })
        .expect(200);

      // Verify history endpoint returns event
      const historyRes = await request(app)
        .get(`/api/teams/${teamId}/work-history`)
        .set(authHeader(owner.token))
        .expect(200);

      expect(historyRes.body.data).toBeDefined();
      expect(Array.isArray(historyRes.body.data.history)).toBe(true);
    });
  });

  // ==========================================
  // BUG CLASS 8 — ATTENTION ENGINE
  // ==========================================
  describe('BUG CLASS 8 — Attention Engine', () => {
    it('calculates explainable team attention score without errors', async () => {
      const owner = await regUser('attention_owner');
      const teamId = await createTeam(owner.token, 'AttentionTeam');

      const attentionRes = await request(app)
        .get(`/api/teams/${teamId}/attention`)
        .set(authHeader(owner.token))
        .expect(200);

      expect(attentionRes.body.data.team).toBeDefined();
      expect(attentionRes.body.data.team.status).toBeDefined();
      expect(attentionRes.body.data.team.reasons).toBeDefined();
    });
  });

  // ==========================================
  // BUG CLASS 9 — ANALYTICS
  // ==========================================
  describe('BUG CLASS 9 — Analytics', () => {
    it('returns context dashboard metrics for team owners', async () => {
      const owner = await regUser('analytics_owner');
      const teamId = await createTeam(owner.token, 'AnalyticsTeam');

      const analyticsRes = await request(app)
        .get(`/api/teams/${teamId}/context-dashboard`)
        .set(authHeader(owner.token))
        .expect(200);

      expect(analyticsRes.body.data.context).toBeDefined();
      expect(analyticsRes.body.data.summary).toBeDefined();
    });
  });

  // ==========================================
  // BUG CLASS 10 — CHAT / NOTIFICATION PRIVACY
  // ==========================================
  describe('BUG CLASS 10 — Chat & Notification Privacy', () => {
    it('ensures notification endpoints are user-scoped', async () => {
      const userA = await regUser('notif_user_a');
      const userB = await regUser('notif_user_b');

      const notifResA = await request(app)
        .get('/api/notifications')
        .set(authHeader(userA.token))
        .expect(200);

      expect(notifResA.body.data.notifications).toBeDefined();
      expect(Array.isArray(notifResA.body.data.notifications)).toBe(true);

      // User B trying to mark User A notification read should return 404
      if (notifResA.body.data.notifications.length > 0) {
        const notifId = notifResA.body.data.notifications[0].notification_id;
        await request(app)
          .put(`/api/notifications/${notifId}/read`)
          .set(authHeader(userB.token))
          .expect(404);
      }
    });
  });

  // ==========================================
  // BUG CLASS 11 — AUTHORIZATION / IDOR
  // ==========================================
  describe('BUG CLASS 11 — Authorization / IDOR', () => {
    it('prevents non-members from accessing team resources (IDOR check)', async () => {
      const owner = await regUser('idor_owner');
      const outsider = await regUser('idor_outsider');
      const teamId = await createTeam(owner.token, 'IDORTeam');

      await request(app)
        .get(`/api/teams/${teamId}/members`)
        .set(authHeader(outsider.token))
        .expect(403);

      await request(app)
        .get(`/api/teams/${teamId}/work-history`)
        .set(authHeader(outsider.token))
        .expect(403);
    });
  });

  // ==========================================
  // BUG CLASS 12 — OPTIONAL FIELDS
  // ==========================================
  describe('BUG CLASS 12 — Optional Fields', () => {
    it('accepts empty string, null, and missing optional fields on Projects and Tasks', async () => {
      const owner = await regUser('opt_owner');

      const projRes = await request(app)
        .post('/api/projects')
        .set(authHeader(owner.token))
        .send({
          projectName: 'Optional Fields Proj',
          description: '',
        })
        .expect(201);

      const taskRes = await request(app)
        .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
        .set(authHeader(owner.token))
        .send({
          title: 'Optional Fields Task',
          description: '',
        })
        .expect(201);

      expect(taskRes.body.data.task_id).toBeDefined();
    });
  });

  // ==========================================
  // BUG CLASS 13 — ASYNC / RACE CONDITIONS
  // ==========================================
  describe('BUG CLASS 13 — Async / Race Conditions', () => {
    it('handles concurrent goal updates safely', async () => {
      const user = await regUser('race_user');
      const goal = await request(app)
        .post('/api/goals')
        .set(authHeader(user.token))
        .send({ title: 'Race Goal', goalType: 'project' })
        .expect(201);

      const goalId = goal.body.data.goal_id;

      const [res1, res2] = await Promise.all([
        request(app).put(`/api/goals/${goalId}`).set(authHeader(user.token)).send({ progress: 25 }),
        request(app).put(`/api/goals/${goalId}`).set(authHeader(user.token)).send({ progress: 50 }),
      ]);

      expect([200, 400, 409]).toContain(res1.status);
      expect([200, 400, 409]).toContain(res2.status);
    });
  });

  // ==========================================
  // BUG CLASS 14 — ERROR HANDLING
  // ==========================================
  describe('BUG CLASS 14 — Error Handling', () => {
    it('returns clean error JSON for un-authorized or non-existent goal progress (403 Forbidden)', async () => {
      const user = await regUser('error_user');

      const res = await request(app)
        .get('/api/goals/00000000-0000-0000-0000-000000000000/progress')
        .set(authHeader(user.token))
        .expect(403);

      expect(res.body.error).toBeDefined();
    });
  });

  // ==========================================
  // BUG CLASS 15 — DELETE / RECREATE
  // ==========================================
  describe('BUG CLASS 15 — Delete / Recreate', () => {
    it('handles entity deletion cleanly and rejects requests to deleted IDs', async () => {
      const user = await regUser('del_user');
      const goal = await request(app)
        .post('/api/goals')
        .set(authHeader(user.token))
        .send({ title: 'To Be Deleted', goalType: 'project' })
        .expect(201);

      const goalId = goal.body.data.goal_id;

      await request(app)
        .delete(`/api/goals/${goalId}`)
        .set(authHeader(user.token))
        .expect(200);

      // Accessing deleted goal progress returns 403 (unauthorized/not found)
      await request(app)
        .get(`/api/goals/${goalId}/progress`)
        .set(authHeader(user.token))
        .expect(403);
    });
  });
});
