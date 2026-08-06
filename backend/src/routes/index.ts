import { Router } from 'express';
import * as authController from '../controllers/authController';
import usersRoutes from '../modules/users/users.routes';
import teamsRoutes from '../modules/teams/teams.routes';
import projectsRoutes from '../modules/projects/projects.routes';
import goalsRoutes from '../modules/goals/goals.routes';
import blockersRoutes from '../modules/blockers/blockers.routes';
import logsRoutes from '../modules/logs/logs.routes';
import leaderboardRoutes from '../modules/leaderboard/leaderboard.routes';
import privacyRoutes from '../modules/privacy/privacy.routes';
import aiRoutes from '../modules/ai/ai.routes';

const router = Router();

// Auth routes -- deliberately untouched by this milestone (controller,
// middleware, and postgresDB.ts all stay exactly as they were).
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/verify-email', authController.verifyEmail);
router.post('/auth/resend-verification', authController.resendVerification);

// Everything else is now a module router. Each one owns the exact same
// paths the old monolithic router defined -- see each module's *.routes.ts
// for the mapping.
router.use('/users', usersRoutes);
router.use('/', teamsRoutes);
router.use('/', projectsRoutes);
router.use('/', goalsRoutes);
router.use('/', blockersRoutes);
router.use('/', logsRoutes);
router.use('/', leaderboardRoutes);
router.use('/', privacyRoutes);
router.use('/ai', aiRoutes);

export default router;
