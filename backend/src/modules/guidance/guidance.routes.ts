import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validate, validateUuidParams } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { guidanceController, createGuidanceSchema, listGuidanceQuerySchema, updateGuidanceStatusSchema } from './guidance.controller';

const router = Router();

router.post(
  '/guidance',
  authenticate,
  validate(createGuidanceSchema),
  asyncHandler((req, res, next) => guidanceController.createGuidance(req, res, next))
);

router.get(
  '/guidance',
  authenticate,
  validate(listGuidanceQuerySchema, 'query'),
  asyncHandler((req, res, next) => guidanceController.listGuidance(req, res, next))
);

router.get(
  '/guidance/:guidanceId',
  authenticate,
  validateUuidParams('guidanceId'),
  asyncHandler((req, res, next) => guidanceController.getGuidanceById(req, res, next))
);

router.patch(
  '/guidance/:guidanceId/status',
  authenticate,
  validateUuidParams('guidanceId'),
  validate(updateGuidanceStatusSchema),
  asyncHandler((req, res, next) => guidanceController.updateGuidanceStatus(req, res, next))
);

export default router;
