import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import * as privacyController from './privacy.controller';

const router = Router();

router.get('/privacy/settings', authenticate, asyncHandler(privacyController.getPrivacySettings));
router.put('/privacy/settings', authenticate, asyncHandler(privacyController.updatePrivacySettings));
router.get('/privacy/export', authenticate, asyncHandler(privacyController.exportUserData));
router.post('/privacy/delete', authenticate, asyncHandler(privacyController.deleteUserData));

export default router;
