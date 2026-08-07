import bcrypt from 'bcrypt';
import { authRepository } from './auth.repository';
import { sendVerificationEmail, sendPasswordResetEmail } from '../../services/emailService';
import {
  signAccessToken,
  generateOpaqueToken,
  hashToken,
  LEGACY_BEARER_TOKEN_TTL_SECONDS,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
} from './jwt';
import { BadRequestError, UnauthorizedError, ForbiddenError } from '../../common/errors';
import { env } from '../../config/env';
import { getLogger } from '../../common/logging/loggerFactory';

const BCRYPT_COST = 12; // raised from 10 -- existing hashes still verify fine, bcrypt embeds its own cost
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour -- shorter-lived, more sensitive

const toPublicUser = (user: any) => ({
  user_id: user.user_id,
  email: user.email,
  username: user.username,
  full_name: user.full_name,
  role: user.role,
  impact_score: user.impact_score,
  streak_count: user.streak_count,
});

export class AuthService {
  async register(email: string, username: string, fullName: string, password: string) {
    const existingByEmail = await authRepository.getUserByEmail(email);
    if (existingByEmail) {
      throw new BadRequestError('Email or username already exists');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const rawVerificationToken = generateOpaqueToken();
    const verificationTokenHash = hashToken(rawVerificationToken);
    const verificationExpires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

    const user = await authRepository.createUser(
      email,
      username,
      fullName,
      passwordHash,
      verificationTokenHash,
      verificationExpires
    );

    if (env.autoVerify) {
      // Explicit, visible auto-verify step for local/demo use -- not a
      // hardcoded `is_verified: true` baked into every INSERT regardless of
      // this flag, which is what the previous implementation did (the bug
      // that made the login verification gate unconditionally unreachable).
      await authRepository.updateUser(user.user_id, {
        is_verified: true,
        verification_token: null,
        verification_token_expires: null,
      });
      getLogger().info('Auto-verified user', { event: 'auth.auto_verified', email });
    } else {
      await sendVerificationEmail(email, rawVerificationToken, fullName);
    }

    return {
      email: user.email,
      username: user.username,
      is_verified: env.autoVerify,
    };
  }

  async login(email: string, password: string) {
    const user = await authRepository.getUserByEmail(email);
    if (!user) {
      // Milestone 11: security-relevant, structured, no password included.
      // Email is logged deliberately -- it's what makes "this account is
      // being targeted" visible at all, and it isn't a secret the way the
      // password/token fields this milestone must never log are.
      getLogger().warn('Failed login attempt', { event: 'auth.failed_login', reason: 'user_not_found', email });
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.is_verified) {
      throw new ForbiddenError('Please verify your email before logging in');
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      getLogger().warn('Failed login attempt', { event: 'auth.failed_login', reason: 'invalid_password', email });
      throw new UnauthorizedError('Invalid credentials');
    }

    return this.issueSession(user);
  }

  // Shared by login and refresh -- issues the legacy long-lived bearer
  // token (unchanged shape, for the current header-based frontend) and the
  // new short-lived access token + rotating refresh token pair (for the
  // cookie-based flow this milestone adds). Both represent the same
  // session; the legacy token is retired once the frontend migrates to
  // cookies (tracked in the rebuild blueprint, not this milestone).
  private async issueSession(user: any) {
    const legacyToken = signAccessToken({ userId: user.user_id, role: user.role }, LEGACY_BEARER_TOKEN_TTL_SECONDS);
    const accessToken = signAccessToken({ userId: user.user_id, role: user.role }, ACCESS_TOKEN_TTL_SECONDS);

    const rawRefreshToken = generateOpaqueToken();
    const refreshTokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await authRepository.createRefreshToken(user.user_id, refreshTokenHash, expiresAt);

    return {
      user: toPublicUser(user),
      token: legacyToken,
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  async refresh(rawRefreshToken: string) {
    const tokenHash = hashToken(rawRefreshToken);
    const stored = await authRepository.getValidRefreshToken(tokenHash);
    if (!stored) {
      // Milestone 11: covers both "never existed" and "reuse of a token
      // that was already rotated/revoked" -- getValidRefreshToken's query
      // (repository.ts, out of this milestone's scope) filters out
      // revoked/expired rows the same way it filters out a hash that never
      // existed, so a null result here can't be split into "invalid" vs.
      // "suspicious reuse" without a repository-level change. This is the
      // single signal available from the service layer today; the raw
      // token, its hash, and the JWT are never included.
      getLogger().warn('Invalid refresh token attempt', { event: 'auth.invalid_refresh_token', reason: 'not_found_or_already_used' });
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const user = await authRepository.getUserById(stored.user_id);
    if (!user) {
      getLogger().warn('Invalid refresh token attempt', { event: 'auth.invalid_refresh_token', reason: 'user_not_found', userId: stored.user_id });
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Rotate: the old refresh token is revoked the moment a new one is
    // issued from it, so a stolen-and-replayed refresh token is only ever
    // usable once before it stops working for either party.
    await authRepository.revokeRefreshToken(stored.token_id);

    const accessToken = signAccessToken({ userId: user.user_id, role: user.role }, ACCESS_TOKEN_TTL_SECONDS);
    const newRawRefreshToken = generateOpaqueToken();
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await authRepository.createRefreshToken(user.user_id, hashToken(newRawRefreshToken), newExpiresAt);

    return { accessToken, refreshToken: newRawRefreshToken };
  }

  async logout(rawRefreshToken: string | undefined) {
    if (!rawRefreshToken) {
      return;
    }
    const stored = await authRepository.getValidRefreshToken(hashToken(rawRefreshToken));
    if (stored) {
      await authRepository.revokeRefreshToken(stored.token_id);
    }
  }

  async verifyEmail(rawToken: string) {
    const user = await authRepository.getUserByVerificationTokenHash(hashToken(rawToken));
    if (!user) {
      throw new BadRequestError('Invalid or expired verification token');
    }

    await authRepository.updateUser(user.user_id, {
      is_verified: true,
      verification_token: null,
      verification_token_expires: null,
    });

    return this.issueSession({ ...user, is_verified: true });
  }

  // Milestone 26: mirrors forgotPassword's existing anti-enumeration
  // shape exactly -- silently returns (no throw) whether the email
  // doesn't exist or is already verified, instead of the two distinct
  // BadRequestErrors this used to throw ('User not found' /
  // 'User already verified'), which let anyone unauthenticated probe
  // whether a given email had an account and whether it was verified.
  async resendVerification(email: string) {
    const user = await authRepository.getUserByEmail(email);
    if (!user || user.is_verified) {
      return;
    }

    const rawToken = generateOpaqueToken();
    await authRepository.updateUser(user.user_id, {
      verification_token: hashToken(rawToken),
      verification_token_expires: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    });

    await sendVerificationEmail(email, rawToken, user.full_name);
  }

  // Always succeeds from the caller's point of view, whether or not the
  // email exists -- prevents an attacker from using this endpoint to
  // enumerate registered emails.
  async forgotPassword(email: string) {
    const user = await authRepository.getUserByEmail(email);
    if (!user) {
      return;
    }

    const rawToken = generateOpaqueToken();
    await authRepository.updateUser(user.user_id, {
      password_reset_token_hash: hashToken(rawToken),
      password_reset_expires: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });

    await sendPasswordResetEmail(email, rawToken, user.full_name);
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const user = await authRepository.getUserByPasswordResetTokenHash(hashToken(rawToken));
    if (!user) {
      throw new BadRequestError('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await authRepository.updateUser(user.user_id, {
      password_hash: passwordHash,
      password_reset_token_hash: null,
      password_reset_expires: null,
    });

    // Force re-login everywhere -- a password reset almost always follows
    // a suspected compromise, so any existing session (stolen or not)
    // stops working immediately.
    await authRepository.revokeAllRefreshTokensForUser(user.user_id);
  }
}

export const authService = new AuthService();
