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
import { BadRequestError, UnauthorizedError } from '../../common/errors';
import { env } from '../../config/env';
import { getLogger } from '../../common/logging/loggerFactory';

const BCRYPT_COST = 12; // raised from 10 -- existing hashes still verify fine, bcrypt embeds its own cost
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour -- shorter-lived, more sensitive

// Milestone 38: a fixed-cost bcrypt hash with no corresponding real
// account, compared against whenever the real user lookup comes back
// empty -- so login() always pays the same bcrypt.compare cost regardless
// of whether the email exists, closing the timing side of the account-
// enumeration oracle. Computed once at module load (bcrypt's own cost
// factor is what matters for timing-safety, not this hash's specific
// value), not per-request.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('a-fixed-dummy-password-used-only-for-timing-safety', BCRYPT_COST);

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

  // Milestone 38: previously threw a DISTINCT error (ForbiddenError,
  // 403, "Please verify your email") for an unverified account, and
  // short-circuited before ever calling bcrypt.compare for both a
  // nonexistent email and an unverified one -- while a verified account
  // (right or wrong password) always paid the full bcrypt cost. That's
  // two independent oracles: a status/message oracle (403 only ever
  // fires for a real, unverified account) and a timing oracle (a fast
  // response means nonexistent-or-unverified; a slow one means verified
  // account, regardless of whether the password was right). Every
  // failure path now (a) runs bcrypt.compare exactly once, against the
  // real hash if the account exists or a fixed dummy hash of the same
  // cost otherwise, and (b) throws the identical error. The real reason
  // is still logged server-side (unchanged, security-monitoring value),
  // just never reflected in the response. resendVerification (Milestone
  // 26, already anti-enumeration) remains the self-service path for a
  // real user who doesn't realize they're unverified.
  async login(email: string, password: string) {
    const user = await authRepository.getUserByEmail(email);

    const hashToCompare = user?.password_hash || DUMMY_PASSWORD_HASH;
    const validPassword = await bcrypt.compare(password, hashToCompare);

    if (!user || !user.is_verified || !validPassword) {
      getLogger().warn('Failed login attempt', {
        event: 'auth.failed_login',
        reason: !user ? 'user_not_found' : !user.is_verified ? 'not_verified' : 'invalid_password',
        email,
      });
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

  // Milestone 38: the password update and the refresh-token revocation
  // are now one atomic operation (authRepository.resetPasswordAndRevokeSessions)
  // instead of two separate statements -- see that method's comment for
  // the failure scenario this closes. password_changed_at is set in the
  // same statement as password_hash, which is what lets
  // middleware/auth.ts reject a JWT (legacy bearer or short-lived access
  // token) issued before this reset, not just a refresh token.
  async resetPassword(rawToken: string, newPassword: string) {
    const user = await authRepository.getUserByPasswordResetTokenHash(hashToken(rawToken));
    if (!user) {
      throw new BadRequestError('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await authRepository.resetPasswordAndRevokeSessions(user.user_id, passwordHash, new Date());
  }
}

export const authService = new AuthService();
