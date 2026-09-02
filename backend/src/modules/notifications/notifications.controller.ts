import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok } from '../../common/http/respond';
import { notificationsService } from './notifications.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const getMyNotifications = async (req: AuthRequest, res: Response) => {
  const limit = Math.min(parseInt((req.query.limit as string) || String(DEFAULT_LIMIT), 10), MAX_LIMIT);
  const offset = parseInt((req.query.offset as string) || '0', 10);
  const result = await notificationsService.getMyNotifications(req.user!.userId, limit, offset);
  ok(res, result);
};

export const markNotificationRead = async (req: AuthRequest, res: Response) => {
  const notification = await notificationsService.markAsRead(req.user!.userId, req.params.notificationId);
  ok(res, notification, 'Notification marked as read');
};

export const markAllNotificationsRead = async (req: AuthRequest, res: Response) => {
  const result = await notificationsService.markAllAsRead(req.user!.userId);
  ok(res, result, 'All notifications marked as read');
};

export const getNotificationPreferences = async (req: AuthRequest, res: Response) => {
  const preferences = await notificationsService.getPreferences(req.user!.userId);
  ok(res, preferences);
};

export const updateNotificationPreferences = async (req: AuthRequest, res: Response) => {
  const preferences = await notificationsService.updatePreferences(req.user!.userId, req.body);
  ok(res, preferences, 'Notification preferences updated');
};
