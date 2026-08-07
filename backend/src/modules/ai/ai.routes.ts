import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate } from '../../common/middleware/validate';
import { getRateLimitProvider } from '../../common/rateLimit/rateLimitProviderFactory';
import * as aiController from './ai.controller';
import { chatSchema } from './ai.dto';

const router = Router();

// Milestone 22: the only AI-triggering endpoint with no natural brake of
// its own (unlike log/blocker/project creation, which trigger an AI call
// only as a side effect of creating a resource) -- a direct, repeatable
// call into whichever AIProvider is active. Placed after `authenticate`
// so the limiter's per-user key (common/rateLimit/expressRateLimitProvider.ts)
// has req.user available; no other AI endpoint is affected.
router.post('/chat', authenticate, getRateLimitProvider().createApiLimiter(), validate(chatSchema), asyncHandler(aiController.chat));

export default router;
