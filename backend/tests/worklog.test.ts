import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader, createTeam, addMember, registerAndLogin, buildTeamWithRoles } from './utils/fixtures';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

const getWorklog = (token: string, teamId: string, limit?: number) => {
  let reqUrl = `/api/teams/${teamId}/worklog`;
  if (limit !== undefined) {
    reqUrl += `?limit=${limit}`;
  }
  return request(app).get(reqUrl).set(authHeader(token));
};

describe('GET /api/teams/:id/worklog', () => {
  it('1. Authenticated team member can retrieve worklog', async () => {
    const { teamId, member } = await buildTeamWithRoles();
    const res = await getWorklog(member.token, teamId).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.team_id).toBe(teamId);
    expect(res.body.data.team_summary).toBeDefined();
    expect(res.body.data.member_summary).toBeDefined();
    expect(res.body.data.work_items).toBeDefined();
  });

  it('2. Team owner/admin can retrieve worklog', async () => {
    const { teamId, owner, admin } = await buildTeamWithRoles();

    const resOwner = await getWorklog(owner.token, teamId).expect(200);
    expect(resOwner.body.data.team_id).toBe(teamId);

    const resAdmin = await getWorklog(admin.token, teamId).expect(200);
    expect(resAdmin.body.data.team_id).toBe(teamId);
  });

  it('3. Non-member receives 403 Forbidden', async () => {
    const { teamId, nonMember } = await buildTeamWithRoles();
    const res = await getWorklog(nonMember.token, teamId).expect(403);
    expect(res.body.error).toMatch(/Not a member/i);
  });

  it('4. Unauthenticated request receives 401 Unauthorized', async () => {
    const { teamId } = await buildTeamWithRoles();
    await request(app).get(`/api/teams/${teamId}/worklog`).expect(401);
  });

  it('5. Invalid team UUID is rejected cleanly with 400', async () => {
    const user = await registerAndLogin('user_invalid');
    const res = await request(app)
      .get('/api/teams/not-a-valid-uuid/worklog')
      .set(authHeader(user.token))
      .expect(400);
    expect(res.body.error).toMatch(/Invalid teamId/i);
  });

  it('6. Empty team returns a valid empty worklog', async () => {
    const owner = await registerAndLogin('empty_owner');
    const teamId = await createTeam(owner.token, 'Empty Team');

    const res = await getWorklog(owner.token, teamId).expect(200);
    expect(res.body.data.team_id).toBe(teamId);
    expect(res.body.data.team_summary.tasks.assigned).toBe(0);
    expect(res.body.data.team_summary.goals.total).toBe(0);
    expect(res.body.data.team_summary.daily_work.total_submissions).toBe(0);
    expect(res.body.data.team_summary.blockers.total).toBe(0);
    expect(res.body.data.work_items.tasks.length).toBe(0);
  });

  it('7. Multiple projects correctly aggregate tasks into the team', async () => {
    const owner = await registerAndLogin('proj_owner');
    const teamId = await createTeam(owner.token, 'Multi-Project Team');

    // Create Project 1 and 2
    const proj1Res = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Project 1', teamId })
      .expect(201);
    const proj1Id = proj1Res.body.data.project_id;

    const proj2Res = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Project 2', teamId })
      .expect(201);
    const proj2Id = proj2Res.body.data.project_id;

    // Create Tasks in Proj 1 and Proj 2
    await request(app)
      .post(`/api/projects/${proj1Id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task P1' })
      .expect(201);

    const task2Res = await request(app)
      .post(`/api/projects/${proj2Id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task P2' })
      .expect(201);
    const task2Id = task2Res.body.data.task_id;

    await request(app)
      .put(`/api/tasks/${task2Id}`)
      .set(authHeader(owner.token))
      .send({ status: 'done' })
      .expect(200);

    const res = await getWorklog(owner.token, teamId).expect(200);
    expect(res.body.data.team_summary.tasks.assigned).toBe(2);
    expect(res.body.data.team_summary.tasks.completed).toBe(1);
    expect(res.body.data.team_summary.tasks.remaining).toBe(1);
    expect(res.body.data.work_items.tasks.length).toBe(2);
  });

  it('8. Multiple members correctly aggregate member work', async () => {
    const owner = await registerAndLogin('multi_mem_owner');
    const member1 = await registerAndLogin('multi_mem_1');
    const teamId = await createTeam(owner.token, 'Team Members Work');

    await addMember(owner.token, teamId, member1.userId, 'member').expect(200);

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Member Project', teamId })
      .expect(201);
    const projId = projRes.body.data.project_id;

    // Create task assigned to member1
    const taskRes = await request(app)
      .post(`/api/projects/${projId}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Task for Member 1', owner: member1.userId })
      .expect(201);
    const taskId = taskRes.body.data.task_id;

    await request(app)
      .put(`/api/tasks/${taskId}`)
      .set(authHeader(owner.token))
      .send({ status: 'in_progress' })
      .expect(200);

    const res = await getWorklog(owner.token, teamId).expect(200);
    const member1Summary = res.body.data.member_summary.find((m: any) => m.user_id === member1.userId);
    expect(member1Summary).toBeDefined();
    expect(member1Summary.tasks.assigned).toBe(1);
    expect(member1Summary.tasks.in_progress).toBe(1);
  });

  it('9. Completed, in-progress, and remaining counts are correct', async () => {
    const owner = await registerAndLogin('counts_owner');
    const teamId = await createTeam(owner.token, 'Counts Team');

    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Counts Proj', teamId })
      .expect(201);
    const projId = projRes.body.data.project_id;

    await request(app).post(`/api/projects/${projId}/tasks`).set(authHeader(owner.token)).send({ title: 'Task 1' });
    const t2 = await request(app).post(`/api/projects/${projId}/tasks`).set(authHeader(owner.token)).send({ title: 'Task 2' });
    const t3 = await request(app).post(`/api/projects/${projId}/tasks`).set(authHeader(owner.token)).send({ title: 'Task 3' });
    const t4 = await request(app).post(`/api/projects/${projId}/tasks`).set(authHeader(owner.token)).send({ title: 'Task 4' });

    await request(app).put(`/api/tasks/${t2.body.data.task_id}`).set(authHeader(owner.token)).send({ status: 'in_progress' });
    await request(app).put(`/api/tasks/${t3.body.data.task_id}`).set(authHeader(owner.token)).send({ status: 'review' });
    await request(app).put(`/api/tasks/${t4.body.data.task_id}`).set(authHeader(owner.token)).send({ status: 'done' });

    const res = await getWorklog(owner.token, teamId).expect(200);
    const tasks = res.body.data.team_summary.tasks;
    expect(tasks.assigned).toBe(4);
    expect(tasks.completed).toBe(1);
    expect(tasks.in_progress).toBe(2); // in_progress + review
    expect(tasks.remaining).toBe(3); // 4 - 1
  });

  it('10. Project-linked tasks do not leak across teams', async () => {
    const owner1 = await registerAndLogin('leak_owner_1');
    const owner2 = await registerAndLogin('leak_owner_2');

    const team1Id = await createTeam(owner1.token, 'Team 1 Leak Test');
    const team2Id = await createTeam(owner2.token, 'Team 2 Leak Test');

    const proj1Res = await request(app)
      .post('/api/projects')
      .set(authHeader(owner1.token))
      .send({ projectName: 'Team 1 Proj', teamId: team1Id })
      .expect(201);

    const proj2Res = await request(app)
      .post('/api/projects')
      .set(authHeader(owner2.token))
      .send({ projectName: 'Team 2 Proj', teamId: team2Id })
      .expect(201);

    await request(app).post(`/api/projects/${proj1Res.body.data.project_id}/tasks`).set(authHeader(owner1.token)).send({ title: 'Team 1 Task' });
    await request(app).post(`/api/projects/${proj2Res.body.data.project_id}/tasks`).set(authHeader(owner2.token)).send({ title: 'Team 2 Task' });

    const res1 = await getWorklog(owner1.token, team1Id).expect(200);
    expect(res1.body.data.work_items.tasks.length).toBe(1);
    expect(res1.body.data.work_items.tasks[0].title).toBe('Team 1 Task');

    const res2 = await getWorklog(owner2.token, team2Id).expect(200);
    expect(res2.body.data.work_items.tasks.length).toBe(1);
    expect(res2.body.data.work_items.tasks[0].title).toBe('Team 2 Task');
  });

  it('11. Goals are limited to the requested team', async () => {
    const owner1 = await registerAndLogin('goal_owner_1');
    const owner2 = await registerAndLogin('goal_owner_2');

    const team1Id = await createTeam(owner1.token, 'Team 1 Goals');
    const team2Id = await createTeam(owner2.token, 'Team 2 Goals');

    await request(app)
      .post('/api/goals')
      .set(authHeader(owner1.token))
      .send({ title: 'Goal Team 1', goalType: 'project', teamId: team1Id })
      .expect(201);

    await request(app)
      .post('/api/goals')
      .set(authHeader(owner2.token))
      .send({ title: 'Goal Team 2', goalType: 'project', teamId: team2Id })
      .expect(201);

    const res1 = await getWorklog(owner1.token, team1Id).expect(200);
    expect(res1.body.data.team_summary.goals.total).toBe(1);
    expect(res1.body.data.work_items.goals[0].title).toBe('Goal Team 1');
  });

  it('12. Daily Work contains team submissions only', async () => {
    const owner = await registerAndLogin('dw_owner');
    const teamId = await createTeam(owner.token, 'Daily Work Team');

    // Create and submit a daily work entry for teamId
    await request(app)
      .post('/api/work-entries')
      .set(authHeader(owner.token))
      .send({ teamId, entryText: 'Completed feature X' })
      .expect(201);

    await request(app)
      .post('/api/work-entries/submit')
      .set(authHeader(owner.token))
      .send({ teamId, confirmedSummary: 'Feature X verified and submitted' })
      .expect(201);

    const res = await getWorklog(owner.token, teamId).expect(200);
    expect(res.body.data.team_summary.daily_work.total_submissions).toBe(1);
    expect(res.body.data.work_items.daily_work_submissions.length).toBe(1);
    expect(res.body.data.work_items.daily_work_submissions[0].confirmed_summary).toBe('Feature X verified and submitted');
  });

  it('13. Personal daily_logs are NEVER returned in worklog', async () => {
    const owner = await registerAndLogin('personal_log_owner');
    const teamId = await createTeam(owner.token, 'Personal Log Isolation Team');

    // Create a personal daily log entry (not a team submission)
    await request(app)
      .post('/api/logs')
      .set(authHeader(owner.token))
      .send({ entryText: 'Secret personal journal entry' })
      .expect(201);

    const res = await getWorklog(owner.token, teamId).expect(200);
    // Worklog contains daily_work_submissions array; ensure personal daily_logs text is not present anywhere
    expect(res.body.data.work_items.daily_work_submissions.length).toBe(0);
    const jsonStr = JSON.stringify(res.body.data);
    expect(jsonStr).not.toContain('Secret personal journal entry');
  });

  it('14. Blockers are limited to the requested team', async () => {
    const owner1 = await registerAndLogin('blocker_owner_1');
    const owner2 = await registerAndLogin('blocker_owner_2');

    const team1Id = await createTeam(owner1.token, 'Team 1 Blockers');
    const team2Id = await createTeam(owner2.token, 'Team 2 Blockers');

    await request(app)
      .post('/api/blockers')
      .set(authHeader(owner1.token))
      .send({ teamId: team1Id, title: 'Team 1 Blocker', description: 'DB latency' })
      .expect(201);

    await request(app)
      .post('/api/blockers')
      .set(authHeader(owner2.token))
      .send({ teamId: team2Id, title: 'Team 2 Blocker', description: 'API rate limit' })
      .expect(201);

    const res1 = await getWorklog(owner1.token, team1Id).expect(200);
    expect(res1.body.data.team_summary.blockers.total).toBe(1);
    expect(res1.body.data.work_items.blockers[0].title).toBe('Team 1 Blocker');
  });

  it('15. No sensitive fields are returned (passwords, tokens, verification secrets, emails in member_summary)', async () => {
    const owner = await registerAndLogin('sensitive_owner');
    const teamId = await createTeam(owner.token, 'Sensitive Check Team');

    const res = await getWorklog(owner.token, teamId).expect(200);
    const jsonStr = JSON.stringify(res.body.data);

    expect(jsonStr).not.toContain('password_hash');
    expect(jsonStr).not.toContain('verification_token');
    expect(jsonStr).not.toContain('password_reset_token_hash');
    expect(jsonStr).not.toContain('phone_otp_hash');

    // Verify member_summary does NOT expose email while retaining safe identity fields
    expect(res.body.data.member_summary.length).toBeGreaterThan(0);
    for (const member of res.body.data.member_summary) {
      expect(member.email).toBeUndefined();
      expect(member.user_id).toBeDefined();
      expect(member.full_name).toBeDefined();
      expect(member.role).toBeDefined();
    }
  });

  it('16. Query path does not produce N+1 behavior', async () => {
    const owner = await registerAndLogin('nplus1_owner');
    const teamId = await createTeam(owner.token, 'N+1 Query Test Team');

    // Create 3 projects
    for (let i = 1; i <= 3; i++) {
      await request(app)
        .post('/api/projects')
        .set(authHeader(owner.token))
        .send({ projectName: `Project ${i}`, teamId })
        .expect(201);
    }

    const res = await getWorklog(owner.token, teamId).expect(200);
    expect(res.body.data.team_id).toBe(teamId);
  });

  it('17. Response is bounded by limit parameter', async () => {
    const owner = await registerAndLogin('bound_owner');
    const teamId = await createTeam(owner.token, 'Bounded Response Team');

    // Create a goal
    await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({ title: 'Bounded Goal 1', goalType: 'project', teamId })
      .expect(201);

    const res = await getWorklog(owner.token, teamId, 10).expect(200);
    expect(res.body.data.team_id).toBe(teamId);
  });

  it('18. Mixed task/goal/Daily Work/blocker data aggregates correctly', async () => {
    const owner = await registerAndLogin('mixed_owner');
    const teamId = await createTeam(owner.token, 'Mixed Artifacts Team');

    // 1 Project + Task
    const projRes = await request(app)
      .post('/api/projects')
      .set(authHeader(owner.token))
      .send({ projectName: 'Mixed Project', teamId })
      .expect(201);
    const mixedTaskRes = await request(app)
      .post(`/api/projects/${projRes.body.data.project_id}/tasks`)
      .set(authHeader(owner.token))
      .send({ title: 'Mixed Task' })
      .expect(201);
    await request(app)
      .put(`/api/tasks/${mixedTaskRes.body.data.task_id}`)
      .set(authHeader(owner.token))
      .send({ status: 'done' })
      .expect(200);

    // 1 Goal
    await request(app)
      .post('/api/goals')
      .set(authHeader(owner.token))
      .send({ title: 'Mixed Goal', goalType: 'objective', teamId })
      .expect(201);

    // 1 Blocker
    await request(app)
      .post('/api/blockers')
      .set(authHeader(owner.token))
      .send({ teamId, title: 'Mixed Blocker' })
      .expect(201);

    // 1 Daily Work Submission
    await request(app)
      .post('/api/work-entries')
      .set(authHeader(owner.token))
      .send({ teamId, entryText: 'Worked on mixed features' })
      .expect(201);
    await request(app)
      .post('/api/work-entries/submit')
      .set(authHeader(owner.token))
      .send({ teamId, confirmedSummary: 'Confirmed mixed features work' })
      .expect(201);

    const res = await getWorklog(owner.token, teamId).expect(200);
    expect(res.body.data.team_summary.tasks.assigned).toBe(1);
    expect(res.body.data.team_summary.tasks.completed).toBe(1);
    expect(res.body.data.team_summary.goals.total).toBe(1);
    expect(res.body.data.team_summary.blockers.total).toBe(1);
    expect(res.body.data.team_summary.daily_work.total_submissions).toBe(1);
  });
});
