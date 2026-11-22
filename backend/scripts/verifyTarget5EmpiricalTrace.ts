import request from 'supertest';
import crypto from 'crypto';
import { app } from '../src/app';
import { pgPool } from '../src/utils/database';
import { signAccessToken } from '../src/modules/auth/jwt';
import { authHeader } from '../tests/utils/fixtures';

async function main() {
  console.log('=== Target #5 Empirical Verification & Resolution Trace ===\n');

  const userId = crypto.randomUUID();
  const teamId = crypto.randomUUID();
  const uid = Date.now() + '_' + Math.floor(Math.random() * 10000);
  const token = signAccessToken({ userId, role: 'member' });

  console.log('1. Creating test user, team & membership...');
  await pgPool.query(
    `INSERT INTO users (user_id, email, password_hash, full_name, username, is_verified)
     VALUES ($1, $2, 'hash', 'Target5 Verification User', $3, true)`,
    [userId, `target5_${uid}@test.local`, `user_${uid}`]
  );

  await pgPool.query(
    `INSERT INTO teams (team_id, team_name, created_by)
     VALUES ($1, $2, $3)`,
    [teamId, `Target5 Team ${uid}`, userId]
  );

  await pgPool.query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, 'owner')`,
    [teamId, userId]
  );

  console.log(`   User: ${userId}, Team: ${teamId}`);

  // 2. Create Blocker via API
  console.log('\n2. Creating open blocker via API...');
  const blockerRes = await request(app)
    .post('/api/blockers')
    .set(authHeader(token))
    .send({ teamId, title: 'Target5 Empirical Critical Blocker', urgency: 'critical' })
    .expect(201);
  const blockerId = blockerRes.body.data.blocker_id;
  console.log(`   Created Blocker: ${blockerId}`);

  // 3. Create Project & Task via API
  console.log('\n3. Creating project & task via API...');
  const projRes = await request(app)
    .post('/api/projects')
    .set(authHeader(token))
    .send({ projectName: 'Target5 Empirical Project', teamId })
    .expect(201);
  const projectId = projRes.body.data.project_id;

  const taskRes = await request(app)
    .post(`/api/projects/${projectId}/tasks`)
    .set(authHeader(token))
    .send({ title: 'Target5 Empirical Stalled Task' })
    .expect(201);
  const taskId = taskRes.body.data.task_id;
  console.log(`   Created Project: ${projectId}, Task: ${taskId}`);

  // Set task created_at and work_state_history created_at to 6 days ago
  await pgPool.query(`UPDATE tasks SET created_at = NOW() - INTERVAL '6 days', status = 'in_progress' WHERE task_id = $1`, [taskId]);
  await pgPool.query(
    `INSERT INTO work_state_history (history_id, team_id, artifact_type, artifact_id, event_type, actor_id, created_at)
     VALUES ($1, $2, 'task', $3, 'transition', $4, NOW() - INTERVAL '6 days')`,
    [crypto.randomUUID(), teamId, taskId, userId]
  );

  // 4. Query Team Attention API & Verify Signals
  console.log('\n4. Fetching Team Attention API response...');
  const attRes = await request(app)
    .get(`/api/attention/teams/${teamId}`)
    .set(authHeader(token))
    .expect(200);

  console.log(`   Status: ${attRes.body.data.attention_status}`);
  console.log(`   Summary: ${attRes.body.data.summary}`);
  console.log(`   Total signals: ${attRes.body.data.signals?.length || 0}\n`);

  attRes.body.data.signals?.forEach((s: any, idx: number) => {
    console.log(`   Signal #${idx + 1}: [${s.severity.toUpperCase()}] ${s.signal_type} -> "${s.title}"`);
    console.log(`     Explanation: ${s.explanation}`);
    console.log(`     Timeline Linkage: ${s.supports_timeline}, Guidance: ${s.supports_guidance}`);
    console.log(`     Action: ${s.action.label} (${s.action.route})\n`);
  });

  const blockerSig = attRes.body.data.signals.find((s: any) => s.signal_type === 'UNRESOLVED_BLOCKER');
  if (!blockerSig) {
    throw new Error('Empirical Verification Failed: UNRESOLVED_BLOCKER signal missing in API response.');
  }

  // 5. Resolve Blocker via API & Verify Immediate Disappearance
  console.log('5. Resolving blocker via API...');
  await request(app)
    .put(`/api/blockers/${blockerId}`)
    .set(authHeader(token))
    .send({ status: 'resolved' })
    .expect(200);

  console.log('   Re-querying Team Attention API...');
  const postRes = await request(app)
    .get(`/api/attention/teams/${teamId}`)
    .set(authHeader(token))
    .expect(200);

  const hasBlockerPost = postRes.body.data.signals.some((s: any) => s.signal_type === 'UNRESOLVED_BLOCKER');
  if (hasBlockerPost) {
    throw new Error('Empirical Verification Failed: Resolved blocker signal did NOT disappear immediately.');
  }
  console.log('   ✅ VERIFIED: Blocker signal disappeared immediately upon resolution.');

  // 6. Clean up DB fixtures
  console.log('\n6. Cleaning up test data...');
  await pgPool.query(`DELETE FROM blockers WHERE blocker_id = $1`, [blockerId]);
  await pgPool.query(`DELETE FROM work_state_history WHERE artifact_id = $1`, [taskId]);
  await pgPool.query(`DELETE FROM tasks WHERE task_id = $1`, [taskId]);
  await pgPool.query(`DELETE FROM projects WHERE project_id = $1`, [projectId]);
  await pgPool.query(`DELETE FROM team_members WHERE team_id = $1`, [teamId]);
  await pgPool.query(`DELETE FROM teams WHERE team_id = $1`, [teamId]);
  await pgPool.query(`DELETE FROM users WHERE user_id = $1`, [userId]);

  console.log('\n=== EMPIRICAL VERIFICATION COMPLETE: ALL CHECKS PASSED 100% ===');
  await pgPool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Empirical Verification Error:', err);
  process.exit(1);
});
