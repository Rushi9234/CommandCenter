import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { feedbackController } from './feedback.controller';
import { getRateLimitProvider } from '../../common/rateLimit/rateLimitProviderFactory';

const router = Router();
const apiLimiter = getRateLimitProvider().createApiLimiter();

// User-facing ticket endpoints
router.post('/feedback', authenticate, apiLimiter, asyncHandler((req, res, next) => feedbackController.createFeedback(req, res, next)));
router.get('/feedback/my', authenticate, asyncHandler((req, res, next) => feedbackController.getMyFeedback(req, res, next)));
router.get('/feedback/:referenceId', authenticate, asyncHandler((req, res, next) => feedbackController.getFeedbackByReferenceId(req, res, next)));
router.post('/feedback/:referenceId/messages', authenticate, apiLimiter, asyncHandler((req, res, next) => feedbackController.addMessage(req, res, next)));
router.post('/feedback/:referenceId/reopen', authenticate, apiLimiter, asyncHandler((req, res, next) => feedbackController.reopenTicket(req, res, next)));
router.get('/feedback/:referenceId/attachments/:attachmentId', authenticate, asyncHandler((req, res, next) => feedbackController.getAttachment(req, res, next)));

// Admin Support Queue & Dashboard endpoints
router.get('/admin/tickets', authenticate, authorize('admin'), asyncHandler((req, res, next) => feedbackController.getAdminTickets(req, res, next)));
router.get('/admin/dashboard', authenticate, authorize('admin'), asyncHandler((req, res, next) => feedbackController.getAdminDashboardMetrics(req, res, next)));
router.patch('/admin/tickets/:referenceId/status', authenticate, authorize('admin'), asyncHandler((req, res, next) => feedbackController.updateTicketStatus(req, res, next)));
router.patch('/admin/tickets/:referenceId/assign', authenticate, authorize('admin'), asyncHandler((req, res, next) => feedbackController.assignTicket(req, res, next)));

export default router;
