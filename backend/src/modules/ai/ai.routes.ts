import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate } from '../../common/middleware/validate';
import * as aiController from './ai.controller';
import { chatSchema } from './ai.dto';

const router = Router();

router.post('/chat', authenticate, validate(chatSchema), asyncHandler(aiController.chat));

export default router;
