import { Router } from 'express';
import * as authController from '../controllers/authController';
import { asyncHandler } from '../common/middleware/asyncHandler';
import { validate } from '../common/middleware/validate';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../modules/auth/auth.dto';
import usersRoutes from '../modules/users/users.routes';
import teamsRoutes from '../modules/teams/teams.routes';
import projectsRoutes from '../modules/projects/projects.routes';
import goalsRoutes from '../modules/goals/goals.routes';
import blockersRoutes from '../modules/blockers/blockers.routes';
import logsRoutes from '../modules/logs/logs.routes';
import dailyWorkRoutes from '../modules/dailyWork/dailyWork.routes';
import leaderboardRoutes from '../modules/leaderboard/leaderboard.routes';
import privacyRoutes from '../modules/privacy/privacy.routes';
import aiRoutes from '../modules/ai/ai.routes';

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
router.use('/', leaderboardRoutes);
router.use('/', privacyRoutes);
router.use('/ai', aiRoutes);

export default router;
