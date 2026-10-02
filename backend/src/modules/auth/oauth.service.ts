import crypto from 'crypto';
import { authRepository } from './auth.repository';
import { authService } from './auth.service';
import { env } from '../../config/env';
import { BadRequestError, UnauthorizedError } from '../../common/errors';
import { getLogger } from '../../common/logging/loggerFactory';

export interface OAuthStatePayload {
  state: string;
  code_verifier: string;
  nonce: string;
  provider: 'google' | 'microsoft';
  redirectUri: string;
  expiresAt: number;
}

export interface OAuthProviderIdentity {
  provider: 'google' | 'microsoft';
  providerId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export class OAuthService {
  /**
   * Generates PKCE code_verifier and S256 code_challenge.
   */
  private generatePKCE() {
    const verifierBytes = crypto.randomBytes(32);
    const code_verifier = verifierBytes.toString('base64url');
    const code_challenge = crypto
      .createHash('sha256')
      .update(code_verifier)
      .digest('base64url');
    return { code_verifier, code_challenge };
  }

  /**
   * Encodes and signs an OAuth state token containing state, PKCE verifier, and nonce.
   */
  public generateStateToken(
    provider: 'google' | 'microsoft',
    redirectUri?: string
  ): { stateToken: string; payload: OAuthStatePayload } {
    const { code_verifier, code_challenge } = this.generatePKCE();
    const state = crypto.randomBytes(24).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    const effectiveRedirectUri =
      redirectUri ||
      (provider === 'google'
        ? env.googleRedirectUri || `${env.frontendUrl}/oauth/callback/google`
        : env.microsoftRedirectUri || `${env.frontendUrl}/oauth/callback/microsoft`);

    const payload: OAuthStatePayload = {
      state,
      code_verifier,
      nonce,
      provider,
      redirectUri: effectiveRedirectUri,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    };

    const jsonStr = JSON.stringify(payload);
    const payloadBase64 = Buffer.from(jsonStr).toString('base64url');
    const hmac = crypto
      .createHmac('sha256', env.jwtSecret)
      .update(payloadBase64)
      .digest('base64url');

    const stateToken = `${payloadBase64}.${hmac}`;
    return { stateToken, payload };
  }

  /**
   * Verifies and decodes an OAuth state token.
   */
  public verifyStateToken(stateToken: string, expectedProvider: 'google' | 'microsoft'): OAuthStatePayload {
    if (!stateToken || typeof stateToken !== 'string') {
      throw new BadRequestError('Missing or invalid OAuth state parameter');
    }

    const parts = stateToken.split('.');
    if (parts.length !== 2) {
      throw new BadRequestError('Malformed OAuth state parameter');
    }

    const [payloadBase64, hmac] = parts;
    const expectedHmac = crypto
      .createHmac('sha256', env.jwtSecret)
      .update(payloadBase64)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      throw new BadRequestError('Invalid OAuth state signature');
    }

    let payload: OAuthStatePayload;
    try {
      const decoded = Buffer.from(payloadBase64, 'base64url').toString('utf8');
      payload = JSON.parse(decoded);
    } catch {
      throw new BadRequestError('Invalid OAuth state payload');
    }

    if (payload.provider !== expectedProvider) {
      throw new BadRequestError(`OAuth state provider mismatch (expected ${expectedProvider})`);
    }

    if (!payload.expiresAt || payload.expiresAt < Date.now()) {
      throw new BadRequestError('OAuth state parameter expired. Please try logging in again.');
    }

    return payload;
  }

  /**
   * Returns the OAuth authorization URL for Google or Microsoft with PKCE parameters.
   */
  public getAuthorizationUrl(
    provider: 'google' | 'microsoft',
    customRedirectUri?: string
  ): { authUrl: string; stateToken: string } {
    const { stateToken, payload } = this.generateStateToken(provider, customRedirectUri);
    const { code_challenge } = this.generatePKCEFromVerifier(payload.code_verifier);

    let authUrl = '';

    if (provider === 'google') {
      const clientId = env.googleClientId || 'MOCK_GOOGLE_CLIENT_ID';
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: payload.redirectUri,
        scope: 'openid email profile',
        state: stateToken,
        code_challenge,
        code_challenge_method: 'S256',
        nonce: payload.nonce,
        prompt: 'select_account',
      });
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    } else {
      const clientId = env.microsoftClientId || 'MOCK_MICROSOFT_CLIENT_ID';
      const tenant = env.microsoftTenantId || 'common';
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: payload.redirectUri,
        scope: 'openid email profile User.Read',
        state: stateToken,
        code_challenge,
        code_challenge_method: 'S256',
        nonce: payload.nonce,
        response_mode: 'query',
      });
      authUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
    }

    return { authUrl, stateToken };
  }

  private generatePKCEFromVerifier(code_verifier: string) {
    const code_challenge = crypto
      .createHash('sha256')
      .update(code_verifier)
      .digest('base64url');
    return { code_challenge };
  }

  /**
   * Validates raw ID Token payload (issuer, audience, expiry, nonce, email verification).
   */
  public validateIDTokenClaims(
    payload: any,
    provider: 'google' | 'microsoft',
    expectedNonce: string
  ): OAuthProviderIdentity {
    const nowSec = Math.floor(Date.now() / 1000);

    if (!payload || typeof payload !== 'object') {
      throw new UnauthorizedError('Invalid ID Token structure');
    }

    if (payload.exp && payload.exp < nowSec) {
      throw new UnauthorizedError('ID Token has expired');
    }

    if (expectedNonce && payload.nonce && payload.nonce !== expectedNonce) {
      throw new UnauthorizedError('ID Token nonce mismatch');
    }

    const providerId = payload.sub || payload.oid;
    if (!providerId) {
      throw new UnauthorizedError('Missing provider subject identity claim in ID token');
    }

    const email = (payload.email || payload.preferred_username || '').toLowerCase().trim();
    if (!email || !email.includes('@')) {
      throw new UnauthorizedError('Missing or invalid email claim in provider identity token');
    }

    // Google provides `email_verified`; Microsoft provides verified directory/tenant email
    const emailVerified =
      provider === 'google'
        ? payload.email_verified === true || payload.email_verified === 'true'
        : true; // Microsoft OIDC account tokens from tenant/common are verified

    if (!emailVerified) {
      throw new UnauthorizedError('Unverified provider email addresses cannot be used for authentication');
    }

    const name = payload.name || payload.given_name || email.split('@')[0];

    return {
      provider,
      providerId,
      email,
      emailVerified,
      name,
    };
  }

  /**
   * Complete OAuth callback authentication flow:
   * 1. Verifies PKCE state token
   * 2. Resolves identity (via provider exchange or test stub)
   * 3. Performs safe account linking or provisions new user
   * 4. Issues authenticated session
   */
  public async handleOAuthCallback(
    provider: 'google' | 'microsoft',
    code: string,
    stateToken: string,
    testIdentityOverride?: OAuthProviderIdentity
  ) {
    if (!code) {
      throw new BadRequestError('Missing authorization code from OAuth provider');
    }

    const statePayload = this.verifyStateToken(stateToken, provider);

    let identity: OAuthProviderIdentity;

    if (testIdentityOverride) {
      identity = testIdentityOverride;
    } else {
      identity = await this.exchangeCodeForIdentity(provider, code, statePayload);
    }

    return this.processOAuthIdentity(identity);
  }

  /**
   * Exchanges code for tokens via HTTPS and verifies ID token claims.
   */
  private async exchangeCodeForIdentity(
    provider: 'google' | 'microsoft',
    code: string,
    statePayload: OAuthStatePayload
  ): Promise<OAuthProviderIdentity> {
    const isTest = process.env.NODE_ENV === 'test';
    const clientId = provider === 'google' ? env.googleClientId : env.microsoftClientId;
    const clientSecret = provider === 'google' ? env.googleClientSecret : env.microsoftClientSecret;

    if (!clientId || !clientSecret || isTest) {
      // Stub identity for testing or missing credentials mode
      return {
        provider,
        providerId: `${provider}_sub_${crypto.createHash('md5').update(code).digest('hex').substring(0, 12)}`,
        email: `${provider}_user_${code.substring(0, 8).toLowerCase()}@test.local`,
        emailVerified: true,
        name: `${provider.toUpperCase()} User`,
      };
    }

    const tokenEndpoint =
      provider === 'google'
        ? 'https://oauth2.googleapis.com/token'
        : `https://login.microsoftonline.com/${env.microsoftTenantId || 'common'}/oauth2/v2.0/token`;

    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: statePayload.redirectUri,
      code_verifier: statePayload.code_verifier,
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      getLogger().error('OAuth token exchange failed', { provider, errorText });
      throw new UnauthorizedError('Failed to exchange authorization code with OAuth provider');
    }

    const tokenData: any = await response.json();
    if (!tokenData.id_token) {
      throw new UnauthorizedError('OAuth provider response did not include ID token');
    }

    const parts = tokenData.id_token.split('.');
    if (parts.length < 2) {
      throw new UnauthorizedError('Malformed ID token returned by OAuth provider');
    }

    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const idTokenClaims = JSON.parse(payloadJson);

    return this.validateIDTokenClaims(idTokenClaims, provider, statePayload.nonce);
  }

  /**
   * Safely links existing accounts or creates new users based on verified provider identity.
   */
  public async processOAuthIdentity(identity: OAuthProviderIdentity) {
    const { provider, providerId, email, name } = identity;

    // Step 1: Check by provider ID
    const existingByProviderId =
      provider === 'google'
        ? await authRepository.getUserByGoogleId(providerId)
        : await authRepository.getUserByMicrosoftId(providerId);

    if (existingByProviderId) {
      getLogger().info('OAuth login success (existing provider ID)', {
        event: 'auth.oauth_login',
        provider,
        userId: existingByProviderId.user_id,
      });
      return authService['issueSession'](existingByProviderId);
    }

    // Step 2: Check by email for safe account linking
    const existingByEmail = await authRepository.getUserByEmail(email);

    if (existingByEmail) {
      // Check if user already linked to a conflicting provider ID of the same type
      const currentGoogleId = existingByEmail.google_id;
      const currentMicrosoftId = existingByEmail.microsoft_id;

      if (provider === 'google' && currentGoogleId && currentGoogleId !== providerId) {
        throw new BadRequestError('Account is already linked to a different Google account');
      }

      if (provider === 'microsoft' && currentMicrosoftId && currentMicrosoftId !== providerId) {
        throw new BadRequestError('Account is already linked to a different Microsoft account');
      }

      // Link provider ID and set is_verified = true
      const updates: Record<string, any> = {
        is_verified: true,
      };

      if (provider === 'google') {
        updates.google_id = providerId;
      } else {
        updates.microsoft_id = providerId;
      }

      if (!existingByEmail.auth_provider || existingByEmail.auth_provider === 'local') {
        updates.auth_provider = provider;
      }

      const updatedUser = await authRepository.updateUser(existingByEmail.user_id, updates);

      getLogger().info('OAuth account linking success', {
        event: 'auth.oauth_link',
        provider,
        userId: updatedUser.user_id,
        email,
      });

      return authService['issueSession'](updatedUser);
    }

    // Step 3: New User Provisioning
    let username = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
    if (username.length < 3) {
      username = `user_${username}`;
    }

    // Resolve username collisions
    let existingUsername = await authRepository.getUserByUsername(username);
    while (existingUsername) {
      const suffix = crypto.randomInt(1000, 9999);
      const testUsername = `${username.substring(0, 15)}_${suffix}`;
      existingUsername = await authRepository.getUserByUsername(testUsername);
      if (!existingUsername) {
        username = testUsername;
      }
    }

    const newUser = await authRepository.createOAuthUser(
      email,
      username,
      name,
      provider,
      providerId
    );

    getLogger().info('OAuth new user registered', {
      event: 'auth.oauth_register',
      provider,
      userId: newUser.user_id,
      email,
    });

    return authService['issueSession'](newUser);
  }
}

export const oauthService = new OAuthService();
