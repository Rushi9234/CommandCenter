import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export const postgresDB = {
  async createUser(email: string, username: string, fullName: string, passwordHash: string, verificationToken?: string) {
    const result = await pool.query(
      `INSERT INTO users (email, username, full_name, password_hash, verification_token, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [email, username, fullName, passwordHash, verificationToken, true]
    );
    return result.rows[0];
  },

  async getUserByEmail(email: string) {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
  },

  async getUserById(userId: string) {
    const result = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    return result.rows[0] || null;
  },

  async getAllUsers() {
    const result = await pool.query('SELECT user_id, username, full_name, email, role, team_id FROM users');
    return result.rows;
  },
};

export default pool;
