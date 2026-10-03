import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../common/middleware/asyncHandler';
import { helpController } from '../controllers/helpController';

const router = Router();

router.get('/docs', authenticate, asyncHandler((req, res, next) => helpController.getHelpDocs(req, res, next)));
router.get('/docs/:slug', authenticate, asyncHandler((req, res, next) => helpController.getHelpDocBySlug(req, res, next)));
router.get('/search', authenticate, asyncHandler((req, res, next) => helpController.searchHelpDocs(req, res, next)));

export default router;
