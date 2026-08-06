import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import * as usersController from './users.controller';

const router = Router();

// Same path as before: GET /api/users
router.get('/', authenticate, asyncHandler(usersController.getAllUsers));

export default router;
