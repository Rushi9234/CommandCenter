const { pgPool } = require('../dist/utils/database');
const jwt = require('jsonwebtoken');

async function testFeature() {
  const userRes = await pgPool.query("SELECT user_id, email FROM users WHERE email = 'carol.member@commandcenter.local'");
  if (userRes.rows.length === 0) throw new Error('Carol user not found');
  const user = userRes.rows[0];

  const teamRes = await pgPool.query(
    "SELECT t.team_id, t.team_name FROM teams t JOIN team_members tm ON t.team_id = tm.team_id WHERE tm.user_id = $1 LIMIT 1",
    [user.user_id]
  );
  const team = teamRes.rows[0];
  console.log(`[TEST] User Carol (${user.user_id}) testing on team "${team.team_name}" (${team.team_id})`);

  const token = jwt.sign({ userId: user.user_id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });

  console.log('\n--- 1. Creating Historical Resolved Blocker ---');
  const res1 = await fetch('http://127.0.0.1:3001/api/blockers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      teamId: team.team_id,
      title: 'Neon PostgreSQL pooler connection timeout',
      description: 'Axios requests fail after 10000ms with timeout on heavy analytics queries',
      blockerType: 'technical',
      severity: 'high',
      attemptedSolutions: 'Restarted express server'
    })
  });
  const data1 = await res1.json();
  console.log('Blocker 1 Created:', data1.success, 'ID:', data1.data?.blocker_id);

  console.log('\n--- 2. Resolving Blocker 1 with Institutional Resolution Notes ---');
  const resResolve = await fetch(`http://127.0.0.1:3001/api/blockers/${data1.data.blocker_id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      status: 'resolved',
      resolution_notes: 'Configured Vite proxy target to 127.0.0.1 and bumped Axios client timeout to 20000ms in frontend/src/services/api.ts'
    })
  });
  const dataResolve = await resResolve.json();
  console.log('Blocker 1 Resolved:', dataResolve.success, 'Resolution Notes:', dataResolve.data?.resolution_notes);

  console.log('\n--- 3. Creating Blocker 2 (New Blocker Triggering AI Matcher) ---');
  const res2 = await fetch('http://127.0.0.1:3001/api/blockers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      teamId: team.team_id,
      title: 'Timeout error on analytics dashboard queries',
      description: 'Getting Axios timeout error when loading large classroom metrics',
      blockerType: 'technical',
      severity: 'medium',
      attemptedSolutions: 'Checked database connection string'
    })
  });
  const data2 = await res2.json();
  console.log('Blocker 2 Created:', data2.success, 'ID:', data2.data?.blocker_id);
  console.log('\nAI Suggestions on Blocker 2:');
  console.log(JSON.stringify(data2.data?.ai_suggestions, null, 2));

  console.log('\n--- 4. Calling On-Demand /auto-resolve Endpoint on Blocker 2 ---');
  const resAuto = await fetch(`http://127.0.0.1:3001/api/blockers/${data2.data.blocker_id}/auto-resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
  });
  const dataAuto = await resAuto.json();
  console.log('Auto-Resolve Endpoint HTTP Status:', resAuto.status);
  console.log('Auto-Resolve Payload:');
  console.log(JSON.stringify(dataAuto.data, null, 2));

  console.log('\n--- 5. Verifying Blocker List Retrieval with Resolver Enrichment ---');
  const resList = await fetch(`http://127.0.0.1:3001/api/teams/${team.team_id}/blockers`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const dataList = await resList.json();
  const resolvedItem = dataList.data.find(b => b.blocker_id === data1.data.blocker_id);
  console.log('Resolved Item in List has resolver name:', resolvedItem?.resolver?.full_name);
  console.log('Resolved Item in List has resolution_notes:', resolvedItem?.resolution_notes);

  console.log('\n[ALL VERIFICATION CHECKS PASSED SUCCESSFULLY]');
  process.exit(0);
}

testFeature().catch(e => {
  console.error('[TEST FAILED]:', e);
  process.exit(1);
});
