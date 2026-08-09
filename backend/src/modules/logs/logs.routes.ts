import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate, validateUuidParams } from '../../common/middleware/validate';
import { requireAccess } from '../../common/middleware/requireAccess';
import { getRateLimitProvider } from '../../common/rateLimit/rateLimitProviderFactory';
import { logsRepository } from './logs.repository';
import * as logsController from './logs.controller';
import { logEntrySchema, getMyLogsQuerySchema } from './logs.dto';

const router = Router();

router.post('/logs', authenticate, validate(logEntrySchema), asyncHandler(logsController.createLog));
router.get('/logs/my', authenticate, validate(getMyLogsQuerySchema, 'query'), asyncHandler(logsController.getMyLogs));

// Milestone 42: same "direct, repeatable, no-side-effect AI call" shape
// M22/M34 already fixed for /api/ai/chat and /projects/analyze -- these
// three GETs call the AI provider fresh on every request (no caching),
// gated only by the caller's own ai_enabled privacy setting, with no
// rate limit at all. Unlike log/task/blocker CREATION (which is bounded
// by "how many resources you're willing to create"), simply re-reading
// suggestions/insights/a standup has no natural cap -- a caller can loop
// any of these indefinitely. Each gets its own independent
// createApiLimiter() budget (a fresh closure-captured store per call,
// same as every other independent wiring of this method), not shared
// with chat's or analyze's.
router.get('/logs/suggestions', authenticate, getRateLimitProvider().createApiLimiter(), asyncHandler(logsController.getSuggestions));
router.get('/logs/insights', authenticate, getRateLimitProvider().createApiLimiter(), asyncHandler(logsController.getInsights));
router.get('/logs/standup', authenticate, getRateLimitProvider().createApiLimiter(), asyncHandler(logsController.getStandup));

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
