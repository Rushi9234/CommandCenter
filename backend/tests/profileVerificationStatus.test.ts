import request from 'supertest';
import { app } from './utils/testApp';
import { query } from '../src/db/client';
import { registerAndLogin } from './utils/fixtures';

// Profile Phase 4 (Step 1): GET /api/users/me previously did not return
// is_verified at all (PROFILE_PHASE4_EMAIL_PHONE_VERIFICATION_AUDIT.md
// section 1.3/12 flagged this as a prerequisite fix -- there was no way for
// the frontend to render a verification badge even read-only). This is the
// only behavior change in this slice: no route, no email/phone endpoint,
// no auth-behavior change. Uses the established res.body.data.* envelope
// convention (BUG-002/BUG-004), not the flat shape some older test files
// still incorrectly assert.
describe('Profile Phase 4 Step 1 -- GET /api/users/me exposes is_verified', () => {
  it('returns is_verified: true for a freshly auto-verified test user', async () => {
    const { token } = await registerAndLogin('phase4-verified');

    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('is_verified');
    expect(res.body.data.is_verified).toBe(true);
  });

  it('reflects is_verified: false when the underlying account is unverified', async () => {
    const { token, userId } = await registerAndLogin('phase4-unverified');

    // AUTO_VERIFY=true in the test env verifies every new account immediately
    // (see fixtures.ts) -- flip it back directly to prove the field is a
    // live, accurate read of the users table, not a hardcoded true.
    await query('UPDATE users SET is_verified = false WHERE user_id = $1', [userId]);

    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_verified).toBe(false);
  });

  it('does not expose the raw verification_token alongside is_verified', async () => {
    const { token } = await registerAndLogin('phase4-no-token-leak');

    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('verification_token');
    expect(res.body.data).not.toHaveProperty('password_hash');
  });
});

// Migration coverage: proves the 9 Phase 4 columns
// (1788000002000_add-phase4-email-phone-verification-fields.sql) actually
// exist on `users` with the exact nullable/default semantics the audit
// specified (section 6.2) -- all nullable, no NOT NULL, no UNIQUE, only the
// two documented DEFAULT values. This is schema/migration coverage, not an
// application-behavior test: no endpoint reads or writes these columns yet.
describe('Profile Phase 4 Step 1 -- migration column shape', () => {
  it('adds all 9 columns as nullable, with only the two documented defaults', async () => {
    const rows = await query<{
      column_name: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = 'users'
         AND column_name IN (
           'pending_email', 'email_change_token_hash', 'email_change_expires', 'email_changed_at',
           'phone_number', 'phone_verified', 'phone_otp_hash', 'phone_otp_expires', 'phone_otp_attempts'
         )`,
    );

    const byName = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    const expectedColumns = [
      'pending_email',
      'email_change_token_hash',
      'email_change_expires',
      'email_changed_at',
      'phone_number',
      'phone_verified',
      'phone_otp_hash',
      'phone_otp_expires',
      'phone_otp_attempts',
    ];

    expect(Object.keys(byName).sort()).toEqual([...expectedColumns].sort());

    for (const name of expectedColumns) {
      expect(byName[name].is_nullable).toBe('YES');
    }

    expect(byName['phone_verified'].column_default).toBe('false');
    expect(byName['phone_otp_attempts'].column_default).toBe('0');

    // Every other column has no default -- NULL until an endpoint (not yet
    // implemented) writes to it.
    for (const name of expectedColumns) {
      if (name === 'phone_verified' || name === 'phone_otp_attempts') continue;
      expect(byName[name].column_default).toBeNull();
    }
  });

  it('does not add is_verified-style uniqueness or NOT NULL to any Phase 4 column', async () => {
    // Deliberate per the audit: phone_number is NOT unique (shared family
    // numbers are legitimate, and phone is not a login identifier).
    const constraints = await query<{ constraint_type: string; column_name: string }>(
      `SELECT tc.constraint_type, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
       WHERE tc.table_name = 'users'
         AND kcu.column_name = 'phone_number'`,
    );
    expect(constraints.length).toBe(0);
  });
});
