import { adminAnalyticsRepository, PlatformAnalyticsResponse } from './adminAnalytics.repository';
import { ForbiddenError, BadRequestError } from '../../common/errors';

export class AdminAnalyticsService {
  async getPlatformAnalytics(
    userId: string,
    period: string = '30days',
    startDate?: string,
    endDate?: string,
    isAdmin = false
  ): Promise<PlatformAnalyticsResponse> {
    if (!isAdmin) {
      throw new ForbiddenError('Only system administrators can access platform analytics');
    }

    const validPeriods = ['7days', '30days', '90days', '12months', 'custom'];
    if (!validPeriods.includes(period)) {
      throw new BadRequestError('Invalid analytics time period specified');
    }

    if (period === 'custom') {
      if (!startDate || !endDate) {
        throw new BadRequestError('Start date and end date are required for custom period');
      }
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new BadRequestError('Invalid start date or end date format');
      }
      if (start > end) {
        throw new BadRequestError('Start date cannot be after end date');
      }
    }

    return adminAnalyticsRepository.getPlatformAnalytics(period, startDate, endDate);
  }
}

export const adminAnalyticsService = new AdminAnalyticsService();
