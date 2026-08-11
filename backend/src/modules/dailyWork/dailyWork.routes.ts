import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate, validateUuidParams } from '../../common/middleware/validate';
import { requireTeamRole, requireTeamMembership, teamIdFromBody, teamIdFromQuery, teamIdFromParams } from '../../common/middleware/requireTeamRole';
import { getRateLimitProvider } from '../../common/rateLimit/rateLimitProviderFactory';
import * as dailyWorkController from './dailyWork.controller';
import { createWorkEntrySchema, teamIdQuerySchema, summarizeWorkSchema, submitWorkSchema, workHistoryDateQuerySchema } from './dailyWork.dto';

// Milestone 49: same WRITE_ROLES exclusion blockers.routes.ts already
// established -- viewer is documented read-only across the app, so it's
// excluded from creating entries/summarizing/submitting, not just from
// creating blockers.
const WRITE_ROLES = ['owner', 'admin', 'manager', 'member'];

const router = Router();

router.post(
  '/work-entries',
  authenticate,
  validate(createWorkEntrySchema),
  requireTeamRole(teamIdFromBody, WRITE_ROLES),
  asyncHandler(dailyWorkController.createEntry)
);

router.get(
  '/work-entries/today',
  authenticate,
  validate(teamIdQuerySchema, 'query'),
  requireTeamMembership(teamIdFromQuery),
  asyncHandler(dailyWorkController.getTodaysEntries)
);

// Milestone 49: AI call, repeatable with no natural cap (re-summarizing
// costs the same whether or not entries changed) -- same
// createApiLimiter() wiring M42/M46 already applied to every other
// re-readable AI endpoint.
router.post(
  '/work-entries/summarize',
  authenticate,
  getRateLimitProvider().createApiLimiter(),
  validate(summarizeWorkSchema),
  requireTeamRole(teamIdFromBody, WRITE_ROLES),
  asyncHandler(dailyWorkController.summarizeToday)
);

router.post(
  '/work-entries/submit',
  authenticate,
  validate(submitWorkSchema),
  requireTeamRole(teamIdFromBody, WRITE_ROLES),
  asyncHandler(dailyWorkController.submitWork)
);

// Any team member can see the team's submitted work history -- same
// membership-only shape getTeamBlockers/getStandup already use.
router.get(
  '/teams/:teamId/work-submissions',
  authenticate,
  validateUuidParams('teamId'),
  validate(workHistoryDateQuerySchema, 'query'),
  requireTeamMembership(teamIdFromParams),
  asyncHandler(dailyWorkController.getTeamSubmissions)
);

export default router;
