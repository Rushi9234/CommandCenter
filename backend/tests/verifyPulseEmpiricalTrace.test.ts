import request from 'supertest';
import { app } from '../src/app';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool } from './utils/db';
import { authHeader } from './utils/fixtures';
import { signAccessToken } from '../src/modules/auth/jwt';
import crypto from 'crypto';

async function createTestUser(roleName: string) {
  const userId = crypto.randomUUID();
  const uid = Date.now() + '_' + Math.floor(Math.random() * 1000000);
  const email = `${roleName}_${uid}@test.local`;
  await pgPool.query(
    `INSERT INTO users (user_id, email, password_hash, full_name, username, is_verified)
     VALUES ($1, $2, 'hash', $3, $4, true)`,
    [userId, email, `Empirical ${roleName}`, `user_${uid}`]
  );
  const token = signAccessToken({ userId, role: 'member' });
  return { userId, email, token };
}

describe('Empirical Pulse & Data Trace Multi-Session Suite', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeTestPool();
    await pgPool.end();
  });

  it('Empirical Multi-Session Realtime, Authorization & Data Trace Verification', async () => {
    // 1. Provision Users & Teams
    const owner = await createTestUser('Owner');
    const member = await createTestUser('Member');
    const nonMember = await createTestUser('NonMember');
    const parentCoord = await createTestUser('ParentCoord');

    const teamRes = await pgPool.query(
      `INSERT INTO teams (team_name, created_by) VALUES ('Empirical Alpha Team', $1) RETURNING team_id`,
      [owner.userId]
    );
    const teamId = teamRes.rows[0].team_id;

    await pgPool.query(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ($1, $2, 'owner'), ($1, $3, 'member')`,
      [teamId, owner.userId, member.userId]
    );

    const parentTeamRes = await pgPool.query(
      `INSERT INTO teams (team_name, created_by) VALUES ('Parent Classroom', $1) RETURNING team_id`,
      [parentCoord.userId]
    );
    const parentTeamId = parentTeamRes.rows[0].team_id;
    await pgPool.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`, [parentTeamId, parentCoord.userId]);
    await pgPool.query(`UPDATE teams SET parent_team_id = $1 WHERE team_id = $2`, [parentTeamId, teamId]);

    // 2. Create Project & 3 Representative Work Events
    const projRes = await pgPool.query(
      `INSERT INTO projects (project_name, team_id, created_by) VALUES ('Empirical Project', $1, $2) RETURNING project_id`,
      [teamId, owner.userId]
    );
    const projectId = projRes.rows[0].project_id;

    // Event 1: Task Completion
    const taskRes = await pgPool.query(
      `INSERT INTO tasks (title, project_id, created_by, status) VALUES ('Auth API Endpoint Task', $1, $2, 'in_progress') RETURNING task_id`,
      [projectId, owner.userId]
    );
    const taskId = taskRes.rows[0].task_id;

    const taskHistRes = await pgPool.query(
      `INSERT INTO work_state_history (team_id, artifact_type, artifact_id, event_type, actor_id, previous_state, new_state)
       VALUES ($1, 'task', $2, 'completed', $3, '{"status": "in_progress"}', '{"status": "done"}') RETURNING history_id, created_at`,
      [teamId, taskId, owner.userId]
    );
    const taskHistId = taskHistRes.rows[0].history_id;

    // Event 2: Goal Progress
    const goalRes = await pgPool.query(
      `INSERT INTO goals (title, team_id, created_by, progress) VALUES ('99.9% Uptime SLA Goal', $1, $2, 85) RETURNING goal_id`,
      [teamId, owner.userId]
    );
    const goalId = goalRes.rows[0].goal_id;

    const goalHistRes = await pgPool.query(
      `INSERT INTO work_state_history (team_id, artifact_type, artifact_id, event_type, actor_id, previous_state, new_state)
       VALUES ($1, 'goal', $2, 'progress_changed', $3, '{"progress": 50}', '{"progress": 85}') RETURNING history_id, created_at`,
      [teamId, goalId, owner.userId]
    );
    const goalHistId = goalHistRes.rows[0].history_id;

    // Event 3: Blocker Resolution
    const blockerRes = await pgPool.query(
      `INSERT INTO blockers (title, team_id, created_by, status) VALUES ('DB Connection Pool Spike Blocker', $1, $2, 'resolved') RETURNING blocker_id`,
      [teamId, owner.userId]
    );
    const blockerId = blockerRes.rows[0].blocker_id;

    const blockerHistRes = await pgPool.query(
      `INSERT INTO work_state_history (team_id, artifact_type, artifact_id, event_type, actor_id, previous_state, new_state)
       VALUES ($1, 'blocker', $2, 'resolved', $3, '{"status": "open"}', '{"status": "resolved"}') RETURNING history_id, created_at`,
      [teamId, blockerId, owner.userId]
    );
    const blockerHistId = blockerHistRes.rows[0].history_id;

    // Personal Private Task (personal project with team_id IS NULL)
    const personalProjRes = await pgPool.query(
      `INSERT INTO projects (project_name, team_id, created_by) VALUES ('Personal Notes Project', NULL, $1) RETURNING project_id`,
      [member.userId]
    );
    const personalProjectId = personalProjRes.rows[0].project_id;

    const personalTaskRes = await pgPool.query(
      `INSERT INTO tasks (title, project_id, created_by, status) VALUES ('Private Member Notes Task', $1, $2, 'done') RETURNING task_id`,
      [personalProjectId, member.userId]
    );
    const personalTaskId = personalTaskRes.rows[0].task_id;

    // 3. Perform Authorized API Calls & Empirical Data Trace Verification
    // A. Authorized Leader Pulse
    const leaderPulseRes = await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(owner.token))
      .expect(200);

    const leaderEvents = leaderPulseRes.body.data.events;
    expect(leaderEvents.length).toBe(3);

    // Verify Exact 3-Event Data Trace
    // Trace 1: Task
    const taskEv = leaderEvents.find((e: any) => e.history_id === taskHistId);
    expect(taskEv).toBeDefined();
    expect(taskEv.artifact_type).toBe('task');
    expect(taskEv.artifact_title).toBe('Auth API Endpoint Task');
    expect(taskEv.event_type).toBe('completed');
    expect(taskEv.context_status).toBe('active');

    // Trace 2: Goal
    const goalEv = leaderEvents.find((e: any) => e.history_id === goalHistId);
    expect(goalEv).toBeDefined();
    expect(goalEv.artifact_type).toBe('goal');
    expect(goalEv.artifact_title).toBe('99.9% Uptime SLA Goal');
    expect(goalEv.event_type).toBe('progress_changed');
    expect(goalEv.context_status).toBe('active');

    // Trace 3: Blocker
    const blockerEv = leaderEvents.find((e: any) => e.history_id === blockerHistId);
    expect(blockerEv).toBeDefined();
    expect(blockerEv.artifact_type).toBe('blocker');
    expect(blockerEv.artifact_title).toBe('DB Connection Pool Spike Blocker');
    expect(blockerEv.event_type).toBe('resolved');
    expect(blockerEv.context_status).toBe('active');

    // B. Personal Work Exclusion Verification
    const hasPersonalInTeam = leaderEvents.some((e: any) => e.artifact_title === 'Private Member Notes Task');
    expect(hasPersonalInTeam).toBe(false);

    // C. Non-Member Authorization Denial
    await request(app)
      .get(`/api/pulse/teams/${teamId}`)
      .set(authHeader(nonMember.token))
      .expect(403);

    // D. Classroom Coordinator Aggregation Verification
    const classRes = await request(app)
      .get(`/api/pulse/classrooms/${parentTeamId}`)
      .set(authHeader(parentCoord.token))
      .expect(200);

    expect(classRes.body.data.events.length).toBeGreaterThan(0);
    const hasPersonalInClassroom = classRes.body.data.events.some((e: any) => e.artifact_title === 'Private Member Notes Task');
    expect(hasPersonalInClassroom).toBe(false);
  });
});
