require('d:/CommandCenter - Copy (2)/backend/node_modules/dotenv').config({ path: 'd:/CommandCenter - Copy (2)/backend/.env' });
const { pgPool } = require('d:/CommandCenter - Copy (2)/backend/dist/utils/database');
const jwt = require('jsonwebtoken');

async function test() {
  const userRes = await pgPool.query("SELECT user_id, email FROM users WHERE email = 'alice.prof@commandcenter.local'");
  if (userRes.rows.length === 0) throw new Error('Alice user not found');
  const u = userRes.rows[0];

  const clsRes = await pgPool.query(
    "SELECT team_id, team_name FROM teams WHERE created_by = $1 AND (team_type = 'class' OR team_type = 'classroom')",
    [u.user_id]
  );
  if (clsRes.rows.length === 0) throw new Error('No classrooms found for Alice');
  const classroom = clsRes.rows[0];

  const token = jwt.sign({ userId: u.user_id, email: u.email }, process.env.JWT_SECRET);

  console.log('Testing GET /api/teams/:teamId/audit-report (JSON format)...');
  const jsonRes = await fetch(`http://127.0.0.1:3001/api/teams/${classroom.team_id}/audit-report`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('JSON Status:', jsonRes.status);
  const jsonData = await jsonRes.json();
  console.log('JSON Context:', jsonData.data?.context?.team_name);
  console.log('JSON Summary:', JSON.stringify(jsonData.data?.summary, null, 2));
  console.log('JSON Blockers count:', jsonData.data?.blockers?.length);
  console.log('JSON CSV length:', jsonData.data?.csv?.length);

  console.log('\nTesting GET /api/teams/:teamId/audit-report?format=csv (CSV format)...');
  const csvRes = await fetch(`http://127.0.0.1:3001/api/teams/${classroom.team_id}/audit-report?format=csv`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('CSV Status:', csvRes.status);
  console.log('Content-Type:', csvRes.headers.get('content-type'));
  console.log('Content-Disposition:', csvRes.headers.get('content-disposition'));
  const csvText = await csvRes.text();
  console.log('CSV Preview:\n' + csvText.split('\r\n').slice(0, 6).join('\n'));

  process.exit(0);
}

test().catch(e => {
  console.error('[TEST ERROR]:', e);
  process.exit(1);
});
