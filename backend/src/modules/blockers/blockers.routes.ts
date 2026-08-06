import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate } from '../../common/middleware/validate';
import * as blockersController from './blockers.controller';
import { createBlockerSchema, sendMessageSchema, updateBlockerSchema } from './blockers.dto';

const router = Router();

router.post('/blockers', authenticate, validate(createBlockerSchema), asyncHandler(blockersController.createBlocker));
router.get('/teams/:teamId/blockers', authenticate, asyncHandler(blockersController.getTeamBlockers));
router.put('/blockers/:blockerId', authenticate, validate(updateBlockerSchema), asyncHandler(blockersController.updateBlocker));
router.post('/blockers/:blockerId/messages', authenticate, validate(sendMessageSchema), asyncHandler(blockersController.sendMessage));
router.get('/blockers/:blockerId/messages', authenticate, asyncHandler(blockersController.getMessages));
router.get('/blockers/:blockerId/ai-advice', authenticate, asyncHandler(blockersController.getAIMentorAdvice));

export default router;
