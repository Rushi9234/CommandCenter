import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate } from '../../common/middleware/validate';
import * as usersController from './users.controller';
import { updateProfileSchema, changePasswordSchema } from './users.dto';

const router = Router();

// GET /api/users — list all users in the caller's teams
router.get('/', authenticate, asyncHandler(usersController.getAllUsers));

// GET /api/users/me — get the authenticated user's own profile
router.get('/me', authenticate, asyncHandler(usersController.getOwnProfile));

// PUT /api/users/me/profile — update the authenticated user's profile
router.put('/me/profile', authenticate, validate(updateProfileSchema), asyncHandler(usersController.updateProfile));

// POST /api/users/me/change-password — change the authenticated user's password
router.post('/me/change-password', authenticate, validate(changePasswordSchema), asyncHandler(usersController.changePassword));

export default router;
