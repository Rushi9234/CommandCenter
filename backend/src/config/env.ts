// Centralized environment access. Every other module reads config from here
// instead of calling process.env directly, so there is one place that knows
// what variables exist and what their defaults are.
import dotenv from 'dotenv';

dotenv.config();

// Milestone 4: JWT_SECRET no longer falls back to a hardcoded default. A
// missing secret used to mean every token in the app was silently signed
// and verified with the literal string "secret" -- fail at boot instead,
// where it's immediately visible, rather than at runtime where it's a
// silent security hole.
if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is required and has no default. Set it in backend/.env before starting the server.'
  );
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  groqApiKey: process.env.GROQ_API_KEY,
  autoVerify: process.env.AUTO_VERIFY === 'true',
  isProduction: process.env.NODE_ENV === 'production',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
};
