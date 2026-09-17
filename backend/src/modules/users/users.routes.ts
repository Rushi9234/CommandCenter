import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate } from '../../common/middleware/validate';
import { getRateLimitProvider } from '../../common/rateLimit/rateLimitProviderFactory';
import { BadRequestError } from '../../common/errors';
import * as usersController from './users.controller';
import {
  updateProfileSchema,
  changePasswordSchema,
  requestEmailChangeSchema,
  requestPhoneVerificationSchema,
  verifyPhoneSchema,
} from './users.dto';

const router = Router();

// Multer configuration for avatar uploads (memory storage, 5MB max)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// multer's own errors (e.g. LIMIT_FILE_SIZE) are raised through the
// middleware's callback, not a thrown exception -- asyncHandler can't catch
// them, and left alone they fall through to the generic-500 branch of
// errorHandler.ts (which only recognizes AppError). Translating the one
// error condition that can occur here (oversized file) into a BadRequestError
// keeps the same `{ error: string }` 400 shape every other validation
// failure on this endpoint already returns.
const handleAvatarFile = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && (err as multer.MulterError).code === 'LIMIT_FILE_SIZE') {
        return next(new BadRequestError('File size exceeds 5MB limit'));
      }
      return next(new BadRequestError('Invalid file upload'));
    }
    next();
  });
};

// Both applied here (after `authenticate` runs below), not in app.ts -- each
// limiter's key generator reads req.user.userId, which does not exist yet if
// this middleware runs ahead of authentication. Mounting either one at the
// app.ts level (as the password-change limiter previously did, on its own,
// before this fix) would make every request fall back to the limiter's IP
// key regardless of which authenticated user sent it -- silently merging
// every user behind a shared IP into one bucket instead of one each.
const avatarRateLimiter = getRateLimitProvider().createAvatarLimiter();
const passwordChangeRateLimiter = getRateLimitProvider().createPasswordChangeLimiter();
const emailChangeRateLimiter = getRateLimitProvider().createEmailChangeLimiter();
const emailChangeResendRateLimiter = getRateLimitProvider().createEmailChangeResendLimiter();
const phoneVerificationRateLimiter = getRateLimitProvider().createPhoneVerificationLimiter();
const phoneVerificationResendRateLimiter = getRateLimitProvider().createPhoneVerificationResendLimiter();
const phoneVerifyRateLimiter = getRateLimitProvider().createPhoneVerifyLimiter();

// GET /api/users — list all users in the caller's teams
router.get('/', authenticate, asyncHandler(usersController.getAllUsers));

// GET /api/users/me — get the authenticated user's own profile
router.get('/me', authenticate, asyncHandler(usersController.getOwnProfile));

// PUT /api/users/me/profile — update the authenticated user's profile
router.put('/me/profile', authenticate, validate(updateProfileSchema), asyncHandler(usersController.updateProfile));

// POST /api/users/me/change-password — change the authenticated user's password
router.post('/me/change-password', authenticate, passwordChangeRateLimiter, validate(changePasswordSchema), asyncHandler(usersController.changePassword));

// POST /api/users/me/request-email-change — request an email change (verification sent to new_email)
router.post(
  '/me/request-email-change',
  authenticate,
  emailChangeRateLimiter,
  validate(requestEmailChangeSchema),
  asyncHandler(usersController.requestEmailChange)
);

// POST /api/users/me/resend-email-change-verification — resend the verification link for an existing pending email change
router.post(
  '/me/resend-email-change-verification',
  authenticate,
  emailChangeResendRateLimiter,
  asyncHandler(usersController.resendEmailChangeVerification)
);

// POST /api/users/me/request-phone-verification — request phone verification (OTP sent via SmsProvider)
router.post(
  '/me/request-phone-verification',
  authenticate,
  phoneVerificationRateLimiter,
  validate(requestPhoneVerificationSchema),
  asyncHandler(usersController.requestPhoneVerification)
);

// POST /api/users/me/resend-phone-verification — resend the OTP for an existing pending phone verification
router.post(
  '/me/resend-phone-verification',
  authenticate,
  phoneVerificationResendRateLimiter,
  asyncHandler(usersController.resendPhoneVerification)
);

// POST /api/users/me/verify-phone — verify the OTP for the authenticated user's pending phone number
router.post(
  '/me/verify-phone',
  authenticate,
  phoneVerifyRateLimiter,
  validate(verifyPhoneSchema),
  asyncHandler(usersController.verifyPhone)
);

// POST /api/users/me/avatar — upload/replace user's avatar
router.post('/me/avatar', authenticate, avatarRateLimiter, handleAvatarFile, asyncHandler(usersController.uploadAvatar));

// POST /api/users/me/avatar/preset — set user's avatar to a trusted application preset
router.post('/me/avatar/preset', authenticate, avatarRateLimiter, asyncHandler(usersController.setPresetAvatar));

// DELETE /api/users/me/avatar — delete user's avatar (not rate-limited: idempotent, no abuse surface)
router.delete('/me/avatar', authenticate, asyncHandler(usersController.deleteAvatar));

export default router;
