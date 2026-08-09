import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate, validateUuidParams } from '../../common/middleware/validate';
import { requireAccess } from '../../common/middleware/requireAccess';
import { logsRepository } from './logs.repository';
import * as logsController from './logs.controller';
import { logEntrySchema } from './logs.dto';

const router = Router();

router.post('/logs', authenticate, validate(logEntrySchema), asyncHandler(logsController.createLog));
router.get('/logs/my', authenticate, asyncHandler(logsController.getMyLogs));
router.get('/logs/suggestions', authenticate, asyncHandler(logsController.getSuggestions));
router.get('/logs/insights', authenticate, asyncHandler(logsController.getInsights));
router.get('/logs/standup', authenticate, asyncHandler(logsController.getStandup));

// Milestone 6: ownership check moved out of logs.service.ts into
// requireAccess + canWriteLog, matching the canWriteX pattern from Milestone 5.
router.put(
  '/logs/:logId',
  authenticate,
  validateUuidParams('logId'),
  requireAccess((req) => logsRepository.canWriteLog(req.user!.userId, req.params.logId), 'Access denied to this log'),
  validate(logEntrySchema),
  asyncHandler(logsController.updateLog)
);

export default router;
