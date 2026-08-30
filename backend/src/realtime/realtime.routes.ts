import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../common/middleware/asyncHandler';
import * as realtimeController from './realtime.controller';

const router = Router();

router.get('/realtime/events', authenticate, asyncHandler(realtimeController.connectRealtime));

export default router;