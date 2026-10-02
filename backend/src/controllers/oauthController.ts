import { Request, Response } from 'express';
import { oauthService } from '../modules/auth/oauth.service';
import { setSessionCookies } from '../common/middleware/auth-cookies';
import { env } from '../config/env';

const OAUTH_COOKIE_NAME = 'oauth_state';

const validateRedirectUri = (urlStr?: string): string | undefined => {
  if (!urlStr) return undefined;
  try {
    const parsed = new URL(urlStr);
    const frontendParsed = new URL(env.frontendUrl);
    // Enforce matching origin with frontendUrl to prevent open redirects
    if (parsed.origin === frontendParsed.origin || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return urlStr;
    }
  } catch {
    // Malformed URL
  }
  return undefined;
};

export const initiateOAuth = async (req: Request, res: Response) => {
  try {
    const providerParam = (req.params.provider || '').toLowerCase();
    if (providerParam !== 'google' && providerParam !== 'microsoft') {
      return res.status(400).json({ error: 'Unsupported OAuth provider' });
    }
    const provider = providerParam as 'google' | 'microsoft';

    const requestedRedirectUri = validateRedirectUri(req.query.redirectUri as string);
    const { authUrl, stateToken } = oauthService.getAuthorizationUrl(provider, requestedRedirectUri);

    res.cookie(OAUTH_COOKIE_NAME, stateToken, {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: '/',
    });

    if (req.query.redirect === 'true') {
      return res.redirect(authUrl);
    }

    res.json({
      success: true,
      data: {
        provider,
        authUrl,
        stateToken,
      },
    });
  } catch (error: any) {
    res.status(error.status || 400).json({ error: error.status ? error.message : 'Failed to initiate OAuth flow' });
  }
};

export const handleOAuthCallback = async (req: Request, res: Response) => {
  try {
    const providerParam = (req.params.provider || '').toLowerCase();
    if (providerParam !== 'google' && providerParam !== 'microsoft') {
      return res.status(400).json({ error: 'Unsupported OAuth provider' });
    }
    const provider = providerParam as 'google' | 'microsoft';

    // Handle provider error (e.g. user cancelled login)
    const providerError = req.query.error || req.body?.error;
    if (providerError) {
      const errorMsg = String(req.query.error_description || providerError);
      if (req.method === 'GET') {
        return res.redirect(`${env.frontendUrl}/login?error=${encodeURIComponent(errorMsg)}`);
      }
      return res.status(400).json({ error: `OAuth provider error: ${errorMsg}` });
    }

    const code = (req.query.code || req.body?.code || '') as string;
    const stateToken = (req.query.state || req.body?.state || req.cookies?.[OAUTH_COOKIE_NAME] || '') as string;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Optional test override for unit tests
    const testOverride = req.body?.testIdentityOverride;

    const session = await oauthService.handleOAuthCallback(provider, code, stateToken, testOverride);

    // Clear state cookie
    res.clearCookie(OAUTH_COOKIE_NAME, { path: '/' });

    // Set HTTP-only session cookies
    setSessionCookies(res, session.accessToken, session.refreshToken);

    if (req.method === 'GET') {
      // Browser callback redirection
      return res.redirect(`${env.frontendUrl}/login/success?token=${encodeURIComponent(session.token)}`);
    }

    res.json({
      success: true,
      message: `${provider === 'google' ? 'Google' : 'Microsoft'} login successful!`,
      data: {
        user: session.user,
        token: session.token,
      },
    });
  } catch (error: any) {
    res.clearCookie(OAUTH_COOKIE_NAME, { path: '/' });
    if (req.method === 'GET') {
      return res.redirect(`${env.frontendUrl}/login?error=${encodeURIComponent(error.message || 'OAuth authentication failed')}`);
    }
    res.status(error.status || 400).json({ error: error.status ? error.message : 'OAuth authentication failed' });
  }
};
