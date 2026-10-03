import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { adminAnalyticsController } from './adminAnalytics.controller';

const router = Router();

router.get(
  '/admin/analytics/platform',
  authenticate,
  authorize('admin'),
  asyncHandler(adminAnalyticsController.getPlatformAnalytics.bind(adminAnalyticsController))
);

export default router;
