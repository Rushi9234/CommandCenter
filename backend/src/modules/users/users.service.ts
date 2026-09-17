import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { usersRepository } from './users.repository';
import { authRepository } from '../auth/auth.repository';
import { BadRequestError, UnauthorizedError } from '../../common/errors';
import { avatarStorageService } from '../avatars/avatars.storage';
import { generateOpaqueToken, hashToken } from '../auth/jwt';
import { sendEmailChangeVerification } from '../../services/emailService';
import { sendOtpSms } from '../../services/smsService';
import { notificationsService } from '../notifications/notifications.service';
import { normalizePhoneToE164 } from '../../common/phone';

const BCRYPT_COST = 12;
const EMAIL_CHANGE_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour -- matches PASSWORD_RESET_TTL_MS's precedent (auth.service.ts): a sensitive, security-adjacent action, not a routine 24-hour signup-verification window.

// Phase 4 phone verification (PROFILE_PHASE4_PHONE_SMS_PROVIDER_AUDIT.md
// §5/§8/§9): 10-minute expiry, 5 incorrect attempts per issued OTP, and a
// 60-second resend cooldown DERIVED from phone_otp_expires (issued_at =
// expires - OTP_TTL_MS) rather than a 6th database column -- the audit's
// §9 explicit reasoning for why the existing 5 columns are sufficient.
const PHONE_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PHONE_OTP_MAX_ATTEMPTS = 5;
const PHONE_OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
// Generic message for every "OTP didn't verify" case that must NOT be
// distinguishable from each other (wrong code, expired, already
// consumed/superseded) -- mirrors verifyEmailChange's identical
// generic-response rule for the same reason (see auth.service.ts).
const PHONE_OTP_INVALID_MESSAGE = 'Invalid or expired verification code';
// The one message the original audit's §7 note explicitly allows to
// differ from the generic one above -- the caller is authenticated and
// attempt-counting an OTP they themselves requested is not an
// enumeration vector.
const PHONE_OTP_TOO_MANY_ATTEMPTS_MESSAGE = 'Too many incorrect attempts. Please request a new verification code.';

// crypto.randomInt(100000, 1000000) is upper-bound-EXCLUSIVE, so this
// range is exactly the 6-digit space 100000-999999 inclusive -- no
// leading-zero/padding concern, unlike Math.random()-based generation.
// Returned as a string since it's compared against a hash of user input
// (also a string), never used arithmetically.
const generatePhoneOtp = (): string => crypto.randomInt(100000, 1000000).toString();

// Phase 4 audit §2.7: "already registered to someone else" and "identical
// to the current email" must be indistinguishable from each other in the
// response, so an attacker probing requestEmailChange with guessed
// addresses can't use a differently-worded error to enumerate which ones
// already belong to real accounts. Current-password confirmation (checked
// separately, before this) is intentionally the one distinctly-worded
// failure -- it isn't an enumeration vector (the caller already knows
// their own account exists) and matches changePassword's existing,
// established convention of naming that failure plainly.
const EMAIL_UNAVAILABLE_MESSAGE = 'Unable to change email to the address provided';

export class UsersService {
  // Milestone 41: the repository's SELECT DISTINCT ... ORDER BY requires
  // created_at in the select list (Postgres rule), but that column was
  // never part of this endpoint's response before -- stripped here so the
  // response shape is unchanged for every field that already existed.
  async getAllUsers(callerId: string) {
    const users = await usersRepository.getAllUsers(callerId);
    return users.map(({ created_at, ...rest }: any) => ({
      ...rest,
      avatar_key: rest.avatar_key || null,
      avatar_url: avatarStorageService.getAvatarUrl(rest.avatar_key),
    }));
  }

  async getUserById(userId: string) {
    const user = await usersRepository.getUserById(userId);
    if (!user) return null;
    return {
      ...user,
      avatar_key: user.avatar_key || null,
      avatar_url: avatarStorageService.getAvatarUrl(user.avatar_key),
    };
  }

  async getProfile(userId: string) {
    const profile = await usersRepository.getProfileById(userId);
    if (!profile) return null;

    // Add avatar_url if avatar_key exists
    const profileWithUrl = { ...profile };
    if (profile.avatar_key) {
      profileWithUrl.avatar_url = avatarStorageService.getAvatarUrl(profile.avatar_key);
    } else {
      profileWithUrl.avatar_url = null;
    }

    return profileWithUrl;
  }

  async updateProfile(userId: string, updates: Record<string, any>) {
    // updateUser's `RETURNING *` includes password_hash and every other raw
    // column -- fine for the two other callers (notifications/privacy
    // services), which each extract exactly one safe field before this ever
    // reaches an HTTP response, but this was the one call site that handed
    // the entire raw row straight to the controller's ok(res, updated),
    // exposing the bcrypt hash directly in PUT /api/users/me/profile's
    // response body. Re-fetching the safe profile shape afterward matches
    // the exact pattern changePassword already uses for the same reason.
    await usersRepository.updateUser(userId, updates);
    return this.getProfile(userId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    // Verify new password is different from current
    const currentHash = await usersRepository.getPasswordHashById(userId);
    if (!currentHash) {
      throw new UnauthorizedError('User not found');
    }

    // Verify current password is correct
    const isCurrentPasswordCorrect = await bcrypt.compare(currentPassword, currentHash);
    if (!isCurrentPasswordCorrect) {
      throw new BadRequestError('Current password is incorrect');
    }

    // Verify new password is not the same as current
    const isSamePassword = await bcrypt.compare(newPassword, currentHash);
    if (isSamePassword) {
      throw new BadRequestError('New password must be different from current password');
    }

    // Hash the new password
    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

    // Update password and revoke all sessions atomically
    await authRepository.resetPasswordAndRevokeSessions(userId, newPasswordHash, new Date());

    // Return updated profile (without password hash)
    return usersRepository.getProfileById(userId);
  }

  // Phase 4 email-change, step 1 of 2 (see auth.service.ts's
  // verifyEmailChange for step 2). Current-password confirmation is
  // checked FIRST, before anything about new_email is even looked at --
  // matching changePassword's ordering and the audit's §3.4 rationale: a
  // stolen live session alone (no password) must not be enough to pivot
  // into a permanent account takeover via the recovery/login identifier.
  // Nothing about `users.email` is written here -- only pending_email and
  // the token/expiry columns -- the current, authoritative email remains
  // valid for login throughout the entire pending period (audit §3.1).
  async requestEmailChange(userId: string, newEmail: string, currentPassword: string) {
    const user = await usersRepository.getUserById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const isPasswordCorrect = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isPasswordCorrect) {
      throw new BadRequestError('Current password is incorrect');
    }

    if (newEmail === user.email) {
      throw new BadRequestError(EMAIL_UNAVAILABLE_MESSAGE);
    }
    const existing = await authRepository.getUserByEmail(newEmail);
    if (existing && existing.user_id !== userId) {
      throw new BadRequestError(EMAIL_UNAVAILABLE_MESSAGE);
    }

    const rawToken = generateOpaqueToken();
    await authRepository.updateUser(userId, {
      pending_email: newEmail,
      email_change_token_hash: hashToken(rawToken),
      email_change_expires: new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MS),
    });

    // Sent to the NEW address (proves possession before it becomes
    // authoritative -- audit §2.2 step 4), never to the old one.
    await sendEmailChangeVerification(newEmail, rawToken, user.full_name);

    // In-app security notice to the account itself (still reachable via
    // the OLD, still-authoritative email/login throughout the pending
    // period) -- the account owner's earliest chance to notice and react
    // to a change they didn't request (audit §3.2). Awaited, matching
    // changePassword's own notifyUser call site and the exact reasoning
    // behind it (users.controller.ts) -- never fire-and-forget against a
    // request that might be followed by a test/caller tearing down state.
    await notificationsService.notifyUser({
      recipientUserId: userId,
      category: 'email_change_requested',
      preferenceGroup: 'email_change',
      title: 'Email Change Requested',
      message: `A request was made to change your account email to ${newEmail}. If you did not request this, please contact support immediately.`,
    });

    return { pending_email: newEmail };
  }

  // Phase 4 email-change resend: re-sends the verification link to the
  // SAME pending address, generating a fresh token that overwrites (and
  // therefore invalidates) whatever token the original request issued --
  // the same single-slot-column pattern every other token pair in this
  // codebase already uses (see auth.repository.ts's AUTH_UPDATABLE_COLUMNS
  // comment). Does not re-verify the password or accept a new target
  // address -- mirrors resendVerification's shape (auth.service.ts): a
  // resend operates on an already-established pending state, not a fresh
  // request.
  async resendEmailChangeVerification(userId: string) {
    const user = await usersRepository.getUserById(userId);
    if (!user || !user.pending_email) {
      // Not an enumeration concern (audit §7's proposed-endpoint note):
      // the caller is already authenticated as themselves, so "you have
      // no pending change" reveals nothing about any other account.
      throw new BadRequestError('No pending email change to resend');
    }

    const rawToken = generateOpaqueToken();
    await authRepository.updateUser(userId, {
      email_change_token_hash: hashToken(rawToken),
      email_change_expires: new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MS),
    });

    await sendEmailChangeVerification(user.pending_email, rawToken, user.full_name);

    return { pending_email: user.pending_email };
  }

  // Phase 4 phone verification, step 1. No password confirmation --
  // unlike email, phone is non-credential/additive (audit §5.1: no
  // session invalidation, no re-auth requirement), matching the audit's
  // explicit reasoning for why phone verification is held to a lower
  // confirmation bar than email/password changes. normalizePhoneToE164
  // throws BadRequestError for anything unparseable -- a plain client-
  // input rejection, not an enumeration concern (phone is deliberately
  // NOT unique, §9, so there is no "already in use" check to leak from
  // in the first place).
  async requestPhoneVerification(userId: string, rawPhoneNumber: string) {
    const phoneNumber = normalizePhoneToE164(rawPhoneNumber);
    const otp = generatePhoneOtp();

    const updated = await usersRepository.setPendingPhoneOtp(
      userId,
      phoneNumber,
      hashToken(otp),
      new Date(Date.now() + PHONE_OTP_TTL_MS)
    );
    if (!updated) {
      throw new UnauthorizedError('User not found');
    }

    await sendOtpSms(phoneNumber, otp);

    // phone_verified comes from the row setPendingPhoneOtp actually just
    // wrote (always false there -- see that method's comment), not a
    // hardcoded literal, so the frontend can derive its displayed state
    // directly from this response instead of assuming/optimistically
    // setting it locally.
    return { phone_number: phoneNumber, phone_verified: updated.phone_verified };
  }

  // Phase 4 phone verification, resend. Operates on the existing pending
  // phone_number (no new target accepted here, matching
  // resendEmailChangeVerification's identical shape) -- issuing a fresh
  // OTP overwrites (and thereby invalidates) whatever OTP the previous
  // request/resend issued, the same single-slot-column pattern as every
  // other token pair in this codebase.
  async resendPhoneVerification(userId: string) {
    const state = await usersRepository.getPhoneVerificationState(userId);
    // phone_verified is included in this guard, not just phone_number's
    // presence: an already-verified number is never "pending" by
    // definition, and setPendingPhoneOtp unconditionally sets
    // phone_verified = false (needed so a genuine number CHANGE starts
    // unverified -- see requestPhoneVerification's own comment). Without
    // this check, calling resend against an already-verified number
    // (unreachable through the UI, which never shows "resend" once
    // verified, but not blocked at the API level otherwise) would
    // silently un-verify a number the caller never asked to change.
    if (!state || !state.phone_number || state.phone_verified) {
      // Not an enumeration concern -- caller is authenticated as
      // themselves, matching resendEmailChangeVerification's identical
      // reasoning.
      throw new BadRequestError('No pending phone verification to resend');
    }

    // 60-second cooldown, derived from phone_otp_expires rather than a
    // dedicated "last sent" column (audit §9) -- only enforced when an
    // OTP is still actually pending; a caller resending after their
    // previous OTP already expired (10+ minutes ago) is never blocked by
    // a cooldown that's long since elapsed.
    if (state.phone_otp_expires) {
      const issuedAt = new Date(state.phone_otp_expires).getTime() - PHONE_OTP_TTL_MS;
      const elapsed = Date.now() - issuedAt;
      if (elapsed < PHONE_OTP_RESEND_COOLDOWN_MS) {
        throw new BadRequestError('Please wait before requesting another code');
      }
    }

    const otp = generatePhoneOtp();
    const updated = await usersRepository.setPendingPhoneOtp(
      userId,
      state.phone_number,
      hashToken(otp),
      new Date(Date.now() + PHONE_OTP_TTL_MS)
    );
    if (!updated) {
      throw new UnauthorizedError('User not found');
    }

    await sendOtpSms(state.phone_number, otp);

    return { phone_number: state.phone_number };
  }

  // Phase 4 phone verification, step 2. Expiry is checked BEFORE hash
  // comparison and before any attempt-increment -- an expired/already-
  // consumed OTP has nothing meaningful to count an attempt against, and
  // treating it as "just wrong" would let a replayed/expired credential
  // slowly count toward nothing. consumeEmailChangeToken-style atomic
  // UPDATE (verifyPhoneOtp) is the actual authority on success -- the
  // hash comparison here is only what decides "increment attempts" vs.
  // "attempt the atomic verify," never the sole gate for marking the
  // phone verified.
  async verifyPhone(userId: string, rawCode: string) {
    const state = await usersRepository.getPhoneVerificationState(userId);
    const isExpired = !state?.phone_otp_expires || new Date(state.phone_otp_expires) < new Date();
    if (!state || !state.phone_otp_hash || isExpired) {
      throw new BadRequestError(PHONE_OTP_INVALID_MESSAGE);
    }

    const submittedHash = hashToken(rawCode);
    if (submittedHash !== state.phone_otp_hash) {
      const attempts = await usersRepository.incrementPhoneOtpAttempts(userId);
      if (attempts !== null && attempts >= PHONE_OTP_MAX_ATTEMPTS) {
        await usersRepository.clearPhoneOtp(userId);
        throw new BadRequestError(PHONE_OTP_TOO_MANY_ATTEMPTS_MESSAGE);
      }
      throw new BadRequestError(PHONE_OTP_INVALID_MESSAGE);
    }

    const updated = await usersRepository.verifyPhoneOtp(userId, state.phone_otp_hash);
    if (!updated) {
      // Race: the OTP was superseded/expired/cleared between the read
      // above and this write (e.g. a concurrent resend or a 5th failed
      // attempt from another in-flight request) -- collapses to the same
      // generic message, never a distinct "someone else already used
      // this" response.
      throw new BadRequestError(PHONE_OTP_INVALID_MESSAGE);
    }

    // In-app only, matching the original audit's §9 recommendation --
    // no external channel needed, the user is already looking at the
    // screen that just succeeded. Awaited for the same reason as every
    // other notifyUser call site since the Milestone 38 deadlock fix.
    await notificationsService.notifyUser({
      recipientUserId: userId,
      category: 'phone_verified',
      preferenceGroup: 'phone_verification',
      title: 'Phone Verified',
      message: 'Your phone number has been verified.',
    });

    return { phone_verified: true };
  }
}

export const usersService = new UsersService();
