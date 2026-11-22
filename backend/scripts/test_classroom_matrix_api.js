require('d:/CommandCenter - Copy (2)/backend/node_modules/dotenv').config({ path: 'd:/CommandCenter - Copy (2)/backend/.env' });
const { pgPool } = require('d:/CommandCenter - Copy (2)/backend/dist/utils/database');
const jwt = require('jsonwebtoken');

async function test() {
  const userRes = await pgPool.query("SELECT user_id FROM users WHERE email = 'alice.prof@commandcenter.local'");
  if (userRes.rows.length === 0) throw new Error('Alice user not found');
  const u = userRes.rows[0];

  const clsRes = await pgPool.query(
    "SELECT team_id, team_name FROM teams WHERE created_by = $1 AND (team_type = 'class' OR team_type = 'classroom')",
    [u.user_id]
  );
  console.log('Alice classrooms:', clsRes.rows);
  if (clsRes.rows.length === 0) throw new Error('No classrooms found for Alice');

  const classroom = clsRes.rows[0];
  const token = jwt.sign({ userId: u.user_id, email: 'alice@qa.local' }, process.env.JWT_SECRET);

  const res = await fetch(`http://127.0.0.1:3001/api/teams/${classroom.team_id}/context-dashboard`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log('\n--- Context Dashboard API Response ---');
  console.log('Status:', res.status);
  console.log('Summary:', JSON.stringify(data.data?.summary, null, 2));
  console.log('Sub-Teams Count:', data.data?.teams?.length);
  if (data.data?.teams?.length > 0) {
    console.log('First Sub-Team Telemetry:');
    console.log(JSON.stringify(data.data.teams[0], null, 2));
  }
  process.exit(0);
}

test().catch(e => {
  console.error('[TEST ERROR]:', e);
  process.exit(1);
});
