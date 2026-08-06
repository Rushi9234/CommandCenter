import { Request, Response } from 'express';
import { authService } from '../modules/auth/auth.service';
import { ACCESS_TOKEN_TTL_SECONDS } from '../modules/auth/jwt';
import { setSessionCookies, clearSessionCookies } from '../common/middleware/auth-cookies';
import { csrfTokenMatches } from '../common/security/csrf';

// Thin by design -- every branch of business logic (password hashing,
// token generation, verification/reset lookups, session issuance) now
// lives in auth.service.ts. This file only parses the request, calls one
// service method, and shapes the response -- the same convention every
// other module already follows.

export const register = async (req: Request, res: Response) => {
  try {
    const { email, username, fullName, password } = req.body;
    const result = await authService.register(email, username, fullName, password);

    res.status(201).json({
      success: true,
      message: result.is_verified
        ? 'Account created and verified! You can now login.'
        : 'Registration successful! Check backend console for verification link.',
      data: result,
    });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Registration failed' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const session = await authService.login(email, password);
    setSessionCookies(res, session.accessToken, session.refreshToken);

    res.json({
      success: true,
      message: 'Login successful!',
      data: { user: session.user, token: session.token },
    });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Login failed' });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const session = await authService.verifyEmail(req.body.token);
    setSessionCookies(res, session.accessToken, session.refreshToken);

    res.json({
      success: true,
      message: 'Email verified successfully!',
      data: { user: session.user, token: session.token },
    });
  } catch (error: any) {
    res.status(error.status || 400).json({ error: error.message || 'Verification failed' });
  }
};

export const resendVerification = async (req: Request, res: Response) => {
  try {
    await authService.resendVerification(req.body.email);
    res.json({ success: true, message: 'Verification email sent!' });
  } catch (error: any) {
    res.status(error.status || 400).json({ error: error.message || 'Failed to resend verification' });
  }
};

// ---- New in Milestone 4 ----

export const refresh = async (req: Request, res: Response) => {
  try {
    const viaCookie = !req.body.refreshToken && !!req.cookies?.refresh_token;
    const token = req.cookies?.refresh_token || req.body.refreshToken;
    if (!token) {
      return res.status(401).json({ error: 'No refresh token provided' });
    }

    // Same double-submit check middleware/auth.ts applies to protected
    // routes -- this endpoint reads its credential from a cookie before
    // authenticate ever runs, so it has to check independently rather than
    // relying on that middleware.
    if (viaCookie && !csrfTokenMatches(req)) {
      return res.status(403).json({ error: 'CSRF token missing or invalid' });
    }

    const session = await authService.refresh(token);
    setSessionCookies(res, session.accessToken, session.refreshToken);

    res.json({
      success: true,
      message: 'Token refreshed',
      data: { accessToken: session.accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    });
  } catch (error: any) {
    clearSessionCookies(res);
    res.status(error.status || 401).json({ error: error.message || 'Failed to refresh token' });
  }
};

export const logout = async (req: Request, res: Response) => {
  const viaCookie = !req.body.refreshToken && !!req.cookies?.refresh_token;

  if (viaCookie && !csrfTokenMatches(req)) {
    return res.status(403).json({ error: 'CSRF token missing or invalid' });
  }

  try {
    const token = req.cookies?.refresh_token || req.body.refreshToken;
    await authService.logout(token);
  } finally {
    clearSessionCookies(res);
  }
  res.json({ success: true, message: 'Logged out' });
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    await authService.forgotPassword(req.body.email);
  } catch (error) {
    // Intentionally swallowed -- see auth.service.ts: this endpoint must
    // not reveal whether the email exists via a differing response.
  }
  res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    await authService.resetPassword(req.body.token, req.body.newPassword);
    res.json({ success: true, message: 'Password reset successfully. Please log in again.' });
  } catch (error: any) {
    res.status(error.status || 400).json({ error: error.message || 'Failed to reset password' });
  }
};
