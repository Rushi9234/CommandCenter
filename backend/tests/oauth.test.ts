import request from 'supertest';
import { app } from './utils/testApp';
import { pgPool } from '../src/utils/database';
import { resetDatabase, closeTestPool, testPool } from './utils/db';
import { buildUser, register } from './utils/fixtures';
import { oauthService } from '../src/modules/auth/oauth.service';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('OAuth 2.0 / OIDC Authorization Code Flow with PKCE (Phase 2)', () => {
  describe('GET /api/auth/oauth/:provider/init', () => {
    it('initiates Google OAuth flow with PKCE parameters and signed state cookie', async () => {
      const res = await request(app)
        .get('/api/auth/oauth/google/init')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.provider).toBe('google');
      expect(res.body.data.authUrl).toContain('accounts.google.com');
      expect(res.body.data.authUrl).toContain('code_challenge=');
      expect(res.body.data.authUrl).toContain('code_challenge_method=S256');
      expect(res.body.data.authUrl).toContain('nonce=');

      // Verify oauth_state cookie is set
      const cookies = res.get('Set-Cookie');
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.includes('oauth_state='))).toBe(true);
    });

    it('initiates Microsoft OAuth flow with PKCE parameters', async () => {
      const res = await request(app)
        .get('/api/auth/oauth/microsoft/init')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.provider).toBe('microsoft');
      expect(res.body.data.authUrl).toContain('login.microsoftonline.com');
      expect(res.body.data.authUrl).toContain('code_challenge=');
      expect(res.body.data.authUrl).toContain('code_challenge_method=S256');
    });

    it('rejects unsupported OAuth providers', async () => {
      const res = await request(app)
        .get('/api/auth/oauth/github/init')
        .expect(400);

      expect(res.body.error).toMatch(/unsupported oauth provider/i);
    });
  });

  describe('OAuth State & PKCE Verification', () => {
    it('rejects callback with missing or tampered state token', async () => {
      const res = await request(app)
        .post('/api/auth/oauth/google/callback')
        .send({ code: 'test_code', state: 'tampered.state.token' })
        .expect(400);

      expect(res.body.error).toMatch(/malformed|invalid/i);
    });

    it('rejects callback when provider in state does not match endpoint', async () => {
      const { stateToken } = oauthService.generateStateToken('google');

      const res = await request(app)
        .post('/api/auth/oauth/microsoft/callback')
        .send({ code: 'test_code', state: stateToken })
        .expect(400);

      expect(res.body.error).toMatch(/provider mismatch/i);
    });
  });

  describe('OAuth User Provisioning & Account Linking', () => {
    it('provisions a new verified user upon successful Google OAuth callback', async () => {
      const { stateToken } = oauthService.generateStateToken('google');

      const testIdentity = {
        provider: 'google' as const,
        providerId: 'google_sub_123456789',
        email: 'google_new_user@test.local',
        emailVerified: true,
        name: 'Google User',
      };

      const res = await request(app)
        .post('/api/auth/oauth/google/callback')
        .send({
          code: 'valid_google_code',
          state: stateToken,
          testIdentityOverride: testIdentity,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe(testIdentity.email);

      // Verify DB record
      const dbRes = await testPool.query(
        'SELECT google_id, auth_provider, is_verified, password_hash FROM users WHERE email = $1',
        [testIdentity.email]
      );
      expect(dbRes.rows[0].google_id).toBe('google_sub_123456789');
      expect(dbRes.rows[0].auth_provider).toBe('google');
      expect(dbRes.rows[0].is_verified).toBe(true);
      expect(dbRes.rows[0].password_hash).toBeNull();
    });

    it('authenticates existing OAuth user on subsequent logins without duplicate creation', async () => {
      const { stateToken: state1 } = oauthService.generateStateToken('microsoft');
      const testIdentity = {
        provider: 'microsoft' as const,
        providerId: 'ms_sub_987654321',
        email: 'ms_user@test.local',
        emailVerified: true,
        name: 'Microsoft User',
      };

      // First callback (provisioning)
      await request(app)
        .post('/api/auth/oauth/microsoft/callback')
        .send({ code: 'code_1', state: state1, testIdentityOverride: testIdentity })
        .expect(200);

      // Second callback (login)
      const { stateToken: state2 } = oauthService.generateStateToken('microsoft');
      const res2 = await request(app)
        .post('/api/auth/oauth/microsoft/callback')
        .send({ code: 'code_2', state: state2, testIdentityOverride: testIdentity })
        .expect(200);

      expect(res2.body.success).toBe(true);
      expect(res2.body.data.user.email).toBe(testIdentity.email);

      const dbRes = await testPool.query('SELECT COUNT(*) FROM users WHERE email = $1', [testIdentity.email]);
      expect(parseInt(dbRes.rows[0].count, 10)).toBe(1);
    });

    it('links Google account to an existing unlinked local user with verified email claim', async () => {
      const localUser = buildUser('link_target');
      await register(localUser).expect(201);

      const { stateToken } = oauthService.generateStateToken('google');
      const testIdentity = {
        provider: 'google' as const,
        providerId: 'google_sub_link_1001',
        email: localUser.email,
        emailVerified: true,
        name: localUser.fullName,
      };

      const res = await request(app)
        .post('/api/auth/oauth/google/callback')
        .send({ code: 'code_link', state: stateToken, testIdentityOverride: testIdentity })
        .expect(200);

      expect(res.body.success).toBe(true);

      const dbRes = await testPool.query(
        'SELECT google_id, is_verified FROM users WHERE email = $1',
        [localUser.email]
      );
      expect(dbRes.rows[0].google_id).toBe('google_sub_link_1001');
      expect(dbRes.rows[0].is_verified).toBe(true);
    });

    it('rejects linking when account is already associated with a different provider ID', async () => {
      const localUser = buildUser('link_conflict');
      await register(localUser).expect(201);

      // Set existing google_id
      await testPool.query(
        "UPDATE users SET google_id = 'existing_google_id' WHERE email = $1",
        [localUser.email]
      );

      const { stateToken } = oauthService.generateStateToken('google');
      const testIdentity = {
        provider: 'google' as const,
        providerId: 'new_conflicting_google_id',
        email: localUser.email,
        emailVerified: true,
        name: localUser.fullName,
      };

      const res = await request(app)
        .post('/api/auth/oauth/google/callback')
        .send({ code: 'code_conflict', state: stateToken, testIdentityOverride: testIdentity })
        .expect(400);

      expect(res.body.error).toMatch(/already linked to a different google account/i);
    });
  });
});
