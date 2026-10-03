import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { adminAnalyticsService } from './adminAnalytics.service';

export class AdminAnalyticsController {
  async getPlatformAnalytics(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const isAdmin = req.user!.role === 'admin';
      const { period, startDate, endDate } = req.query;

      const analytics = await adminAnalyticsService.getPlatformAnalytics(
        userId,
        period as string,
        startDate as string,
        endDate as string,
        isAdmin
      );

      res.status(200).json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const adminAnalyticsController = new AdminAnalyticsController();
