import dotenv from 'dotenv';
import path from 'path';

// Jest setupFiles run once per test file, before that file's own imports
// are evaluated -- so by the time a test file does `import { app } from
// '../../src/app'`, config/env.ts's own `dotenv.config()` call (which
// loads backend/.env and never overwrites a key already present in
// process.env) will find DATABASE_URL/NODE_ENV/etc. already set from
// .env.test below and leave them alone. Production's .env is never read
// during a test run.
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('commandcenter_test')) {
  throw new Error(
    'Tests must run against the commandcenter_test database. Check backend/.env.test exists and its DATABASE_URL points at commandcenter_test (see .env.test.example).'
  );
}
