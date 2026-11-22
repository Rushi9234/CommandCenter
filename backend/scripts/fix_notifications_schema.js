require('d:/CommandCenter - Copy (2)/backend/node_modules/dotenv').config({ path: 'd:/CommandCenter - Copy (2)/backend/.env' });
const { pgPool } = require('d:/CommandCenter - Copy (2)/backend/dist/utils/database');

async function fix() {
  const r = await pgPool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'notifications'");
  console.log('Current notifications columns:', r.rows.map(x => x.column_name));

  console.log('Ensuring conversation_id column exists on notifications...');
  await pgPool.query("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS conversation_id UUID;");

  const r2 = await pgPool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'notifications'");
  console.log('Updated notifications columns:', r2.rows.map(x => x.column_name));
  process.exit(0);
}

fix().catch(err => {
  console.error(err);
  process.exit(1);
});
