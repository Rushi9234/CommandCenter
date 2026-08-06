import { queryOne } from '../../db/client';

// Replaces utils/postgresDB.ts, which held its own separate pg.Pool() with
// an explicit `ssl: false` in development -- the second live database
// connection pool in the app, and the reason register/login failed against
// Neon (which requires SSL) whenever NODE_ENV wasn't "production". Routing
// through the shared query/queryOne helpers (backed by the single pgPool in
// utils/database.ts, which has no such override) fixes both the duplicate
// pool and the SSL bug as one change.
//
// getUserById and getAllUsers, which used to live on postgresDB, are not
// carried over here -- grep confirmed authController never calls them
// (usersRepository already has its own versions, which is what every other
// module actually uses).
export class AuthRepository {
  async createUser(email: string, username: string, fullName: string, passwordHash: string, verificationToken?: string) {
    const text = `
      INSERT INTO users (email, username, full_name, password_hash, verification_token, is_verified)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    return queryOne<any>(text, [email, username, fullName, passwordHash, verificationToken, true]);
  }

  async getUserByEmail(email: string) {
    return queryOne<any>('SELECT * FROM users WHERE email = $1', [email]);
  }
}

export const authRepository = new AuthRepository();
