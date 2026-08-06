// Centralized environment access. Every other module reads config from here
// instead of calling process.env directly, so there is one place that knows
// what variables exist and what their defaults are.
import dotenv from 'dotenv';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'secret',
  groqApiKey: process.env.GROQ_API_KEY,
  autoVerify: process.env.AUTO_VERIFY === 'true',
  isProduction: process.env.NODE_ENV === 'production',
};
