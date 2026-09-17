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

const isProduction = process.env.NODE_ENV === 'production';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '30018', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  groqApiKey: process.env.GROQ_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  // Milestone 13: which AIProvider implementation ai.service.ts's factory
  // (modules/ai/providers/aiProviderFactory.ts) selects. 'groq' (the free
  // default) if unset. 'none' makes zero external requests. Business
  // logic never reads this directly -- only the factory does.
  aiProvider: process.env.AI_PROVIDER || 'groq',
  // Milestone 14: which Logger implementation loggerFactory.ts's
  // getLogger() selects. 'console' (the free default) if unset. Business
  // logic never reads this directly -- only the factory does.
  loggerProvider: process.env.LOGGER || 'console',
  // Milestone 15: which EmailProvider implementation
  // emailProviderFactory.ts's getEmailProvider() selects. 'console' (the
  // free default) if unset. Business logic never reads this directly --
  // only the factory does.
  emailProvider: process.env.EMAIL_PROVIDER || 'console',
  // Phone verification (Profile Phase 4): which SmsProvider implementation
  // smsProviderFactory.ts's getSmsProvider() selects. 'console' (the free
  // default) if unset -- matching emailProvider's exact precedent, this
  // means no test run, CI run, or plain local dev session ever reaches a
  // real MSG91 API call unless this is explicitly set to 'msg91'.
  // Business logic never reads this directly -- only the factory does.
  smsProvider: process.env.SMS_PROVIDER || 'console',
  // Milestone 17: which RateLimitProvider implementation
  // rateLimitProviderFactory.ts's getRateLimitProvider() selects.
  // 'express' (the free default) if unset. app.ts never reads this
  // directly -- only the factory does.
  rateLimitProvider: process.env.RATE_LIMIT_PROVIDER || 'express',
  // Milestone 7: forced false in production no matter what AUTO_VERIFY is
  // set to -- a copied/misconfigured .env should never be able to make
  // production silently skip email verification for every new account.
  autoVerify: !isProduction && process.env.AUTO_VERIFY === 'true',
  isProduction,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  vercelBlobToken: process.env.VERCEL_BLOB_READ_WRITE_TOKEN,
};
