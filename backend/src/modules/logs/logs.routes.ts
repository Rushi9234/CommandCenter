import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate } from '../../common/middleware/validate';
import * as logsController from './logs.controller';
import { logEntrySchema } from './logs.dto';

const router = Router();

router.post('/logs', authenticate, validate(logEntrySchema), asyncHandler(logsController.createLog));
router.get('/logs/my', authenticate, asyncHandler(logsController.getMyLogs));
router.get('/logs/suggestions', authenticate, asyncHandler(logsController.getSuggestions));
router.get('/logs/insights', authenticate, asyncHandler(logsController.getInsights));
router.get('/logs/standup', authenticate, asyncHandler(logsController.getStandup));
router.put('/logs/:logId', authenticate, validate(logEntrySchema), asyncHandler(logsController.updateLog));

export default router;
