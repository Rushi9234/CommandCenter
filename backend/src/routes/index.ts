import { Router } from 'express';
import * as authController from '../controllers/authController';
import { asyncHandler } from '../common/middleware/asyncHandler';
import { validate } from '../common/middleware/validate';
import { getRateLimitProvider } from '../common/rateLimit/rateLimitProviderFactory';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailChangeSchema,
} from '../modules/auth/auth.dto';
import usersRoutes from '../modules/users/users.routes';
import teamsRoutes from '../modules/teams/teams.routes';
import projectsRoutes from '../modules/projects/projects.routes';
import goalsRoutes from '../modules/goals/goals.routes';
import blockersRoutes from '../modules/blockers/blockers.routes';
import logsRoutes from '../modules/logs/logs.routes';
import dailyWorkRoutes from '../modules/dailyWork/dailyWork.routes';
import contextDashboardRoutes from '../modules/contextDashboard/contextDashboard.routes';
import leaderboardRoutes from '../modules/leaderboard/leaderboard.routes';
import privacyRoutes from '../modules/privacy/privacy.routes';
import aiRoutes from '../modules/ai/ai.routes';
import realtimeRoutes from '../realtime/realtime.routes';
import notificationsRoutes from '../modules/notifications/notifications.routes';
import chatRoutes from '../modules/chat/chat.routes';
import worklogRoutes from '../modules/worklog/worklog.routes';
import workStateHistoryRoutes from '../modules/workStateHistory/workStateHistory.routes';
import attentionRoutes from '../modules/attention/attention.routes';
import guidanceRoutes from '../modules/guidance/guidance.routes';
import pulseRoutes from '../modules/pulse/pulse.routes';
import analyticsRoutes from '../modules/analytics/analytics.routes';

const router = Router();

// Auth routes. Milestone 4: all business logic now lives in
// modules/auth/auth.service.ts; this file only wires paths to the
// (now-thin) controller, same as every other module.
router.post('/auth/register', validate(registerSchema), asyncHandler(authController.register));
router.post('/auth/login', validate(loginSchema), asyncHandler(authController.login));
router.post('/auth/verify-email', validate(verifyEmailSchema), asyncHandler(authController.verifyEmail));
router.post('/auth/resend-verification', validate(resendVerificationSchema), asyncHandler(authController.resendVerification));

// New in Milestone 4: refresh/logout read their token from a cookie first,
// falling back to the request body, so these work whether or not the
// caller has migrated to the cookie-based flow yet.
router.post('/auth/refresh', asyncHandler(authController.refresh));
router.post('/auth/logout', asyncHandler(authController.logout));
router.post('/auth/forgot-password', validate(forgotPasswordSchema), asyncHandler(authController.forgotPassword));
router.post('/auth/reset-password', validate(resetPasswordSchema), asyncHandler(authController.resetPassword));

// Phase 4 email-change verification: no authenticate() -- the token itself
// is the credential (see auth.service.ts's verifyEmailChange) -- so this
// is rate-limited by IP rather than by user, matching /auth/refresh's
// existing IP-only shape below rather than the per-user pattern the
// authenticated email-change endpoints (users.routes.ts) use.
const emailChangeVerifyRateLimiter = getRateLimitProvider().createEmailChangeVerifyLimiter();
router.post(
  '/auth/verify-email-change',
  emailChangeVerifyRateLimiter,
  validate(verifyEmailChangeSchema),
  asyncHandler(authController.verifyEmailChange)
);

// Everything else is now a module router. Each one owns the exact same
// paths the old monolithic router defined -- see each module's *.routes.ts
// for the mapping.
router.use('/users', usersRoutes);
router.use('/', teamsRoutes);
router.use('/', projectsRoutes);
router.use('/', goalsRoutes);
router.use('/', blockersRoutes);
router.use('/', logsRoutes);
router.use('/', dailyWorkRoutes);
router.use('/', contextDashboardRoutes);
router.use('/', leaderboardRoutes);
router.use('/', privacyRoutes);
router.use('/ai', aiRoutes);
router.use('/', realtimeRoutes);
router.use('/', notificationsRoutes);
// Chat V1 -- mounted at '/', same as most other modules above, since
// chat.routes.ts's own paths already start with '/chat' (distinct from
// the existing, unrelated '/ai/chat' AI-assistant endpoint mounted above).
router.use('/', chatRoutes);
router.use('/', worklogRoutes);
router.use('/', workStateHistoryRoutes);
router.use('/', attentionRoutes);
router.use('/', guidanceRoutes);
router.use('/pulse', pulseRoutes);
router.use('/', analyticsRoutes);

export default router;
