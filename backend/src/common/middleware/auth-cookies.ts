import { Response } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_MS } from '../../modules/auth/jwt';

// Single place that sets/clears the three auth-related cookies, so the
// flags (httpOnly, sameSite, secure, path) can't drift between login,
// verifyEmail, and refresh -- they all call this instead of setting
// cookies inline.

const baseCookieOptions = {
  httpOnly: true as const,
  secure: env.isProduction,
  sameSite: 'strict' as const,
};

export const setSessionCookies = (res: Response, accessToken: string, refreshToken: string) => {
  res.cookie('access_token', accessToken, {
    ...baseCookieOptions,
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
    path: '/',
  });

  // Scoped to /api/auth only -- the refresh token is never needed by any
  // other route, so it's never sent on any other request.
  res.cookie('refresh_token', refreshToken, {
    ...baseCookieOptions,
    maxAge: REFRESH_TOKEN_TTL_MS,
    path: '/api/auth',
  });

  // Deliberately NOT httpOnly -- the double-submit CSRF pattern requires
  // client JS to read this value and echo it back in a header. It carries
  // no authority on its own (see common/middleware/csrf.ts).
  res.cookie('csrf_token', crypto.randomBytes(24).toString('hex'), {
    httpOnly: false,
    secure: env.isProduction,
    sameSite: 'strict',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
    path: '/',
  });
};

export const clearSessionCookies = (res: Response) => {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/auth' });
  res.clearCookie('csrf_token', { path: '/' });
};
