import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { guidanceService } from './guidance.service';
import { z } from 'zod';

export const createGuidanceSchema = z.object({
  contextType: z.enum(['task', 'goal', 'blocker']),
  contextId: z.string().uuid('Invalid contextId format'),
  teamId: z.string().uuid('Invalid teamId format').optional(),
  recipientId: z.string().uuid('Invalid recipientId format').nullable().optional(),
  message: z.string().min(3, 'Message must be at least 3 characters').max(2000, 'Message cannot exceed 2000 characters'),
});

export const listGuidanceQuerySchema = z.object({
  teamId: z.string().uuid('Invalid teamId format'),
  contextType: z.enum(['task', 'goal', 'blocker']).optional(),
  contextId: z.string().uuid('Invalid contextId format').optional(),
  recipientId: z.string().uuid('Invalid recipientId format').optional(),
  status: z.enum(['open', 'acknowledged', 'resolved']).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
});

export const updateGuidanceStatusSchema = z.object({
  status: z.enum(['acknowledged', 'resolved']),
});

export class GuidanceController {
  async createGuidance(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const body = req.body;
      const item = await guidanceService.createGuidance({
        authorId: req.user!.userId,
        contextType: body.contextType,
        contextId: body.contextId,
        teamId: body.teamId,
        recipientId: body.recipientId,
        message: body.message,
      });
      res.status(201).json({ data: item });
    } catch (error) {
      next(error);
    }
  }

  async listGuidance(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const query = req.query as any;
      const limit = query.limit ? parseInt(query.limit, 10) : 50;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      const result = await guidanceService.listGuidance(req.user!.userId, {
        teamId: query.teamId,
        contextType: query.contextType,
        contextId: query.contextId,
        recipientId: query.recipientId,
        status: query.status,
        limit,
        offset,
      });

      res.status(200).json({ data: result.items, total: result.total, limit, offset });
    } catch (error) {
      next(error);
    }
  }

  async getGuidanceById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { guidanceId } = req.params;
      const item = await guidanceService.getGuidanceById(req.user!.userId, guidanceId);
      res.status(200).json({ data: item });
    } catch (error) {
      next(error);
    }
  }

  async updateGuidanceStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { guidanceId } = req.params;
      const { status } = req.body;
      const item = await guidanceService.updateGuidanceStatus(
        req.user!.userId,
        guidanceId,
        status
      );
      res.status(200).json({ data: item });
    } catch (error) {
      next(error);
    }
  }
}

export const guidanceController = new GuidanceController();
