import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate, validateUuidParams } from '../../common/middleware/validate';
import { requireAccess } from '../../common/middleware/requireAccess';
import { notificationsRepository } from './notifications.repository';
import * as notificationsController from './notifications.controller';
import { updateNotificationPreferencesSchema, listNotificationsQuerySchema } from './notifications.dto';

const router = Router();

// All routes are inherently self-scoped by req.user.userId (never a URL
// param), same shape as GET /teams/join-requests/my -- no requireAccess
// needed for the list/preferences endpoints since there's no other
// caller's data they could reach in the first place.
router.get(
  '/notifications',
  authenticate,
  validate(listNotificationsQuerySchema, 'query'),
  asyncHandler(notificationsController.getMyNotifications)
);

router.put(
  '/notifications/read-all',
  authenticate,
  asyncHandler(notificationsController.markAllNotificationsRead)
);

// requireAccess(isRecipient) is the actual IDOR guard here -- the only
// notification-mutation route that references another row by ID, so it's
// the one place ownership must be checked before acting.
router.put(
  '/notifications/:notificationId/read',
  authenticate,
  validateUuidParams('notificationId'),
  requireAccess(
    (req) => notificationsRepository.isRecipient(req.user!.userId, req.params.notificationId),
    'Access denied to this notification'
  ),
  asyncHandler(notificationsController.markNotificationRead)
);

router.get('/notifications/preferences', authenticate, asyncHandler(notificationsController.getNotificationPreferences));
router.put(
  '/notifications/preferences',
  authenticate,
  validate(updateNotificationPreferencesSchema),
  asyncHandler(notificationsController.updateNotificationPreferences)
);

export default router;
