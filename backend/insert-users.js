require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await pool.query(`
      INSERT INTO users (email, username, full_name, password_hash, is_verified) 
      VALUES 
        ('demo@commandcenter.com', 'demo', 'Demo User', '$2b$10$HJ.sBGg5OCx9Ek0m6/6Ohe40arB0FHMyowjCfDW5kW/heSl0tpHU2', true),
        ('rushikedar40@gmail.com', 'rushi', 'Rushikesh Kedar', '$2b$10$HJ.sBGg5OCx9Ek0m6/6Ohe40arB0FHMyowjCfDW5kW/heSl0tpHU2', true),
        ('akashbhuyan07@gmail.com', 'akabhu', 'Akash Bhuyan', '$2b$10$cvDPL3kR2PEPv3e5E5DPCeKzCvI8bjdyw/p.nlqXqXx1Dxb2ICBIO', true)
      ON CONFLICT (email) DO NOTHING
    `);
    console.log('✅ Users inserted successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
