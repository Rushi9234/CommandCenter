import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { feedbackService } from './feedback.service';

export class FeedbackController {
  async createFeedback(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const report = await feedbackService.createFeedback(userId, req.body);
      res.status(201).json({
        success: true,
        message: 'Feedback submitted successfully',
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyFeedback(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const reports = await feedbackService.getUserFeedback(userId);
      res.status(200).json({
        success: true,
        data: reports,
      });
    } catch (error) {
      next(error);
    }
  }

  async getFeedbackByReferenceId(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const isAdmin = req.user!.role === 'admin';
      const { referenceId } = req.params;
      const report = await feedbackService.getFeedbackByReferenceId(userId, referenceId, isAdmin);
      res.status(200).json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  async addMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const isAdmin = req.user!.role === 'admin';
      const { referenceId } = req.params;
      const { message, is_internal, attachment } = req.body;

      const newMsg = await feedbackService.addMessage(
        userId,
        referenceId,
        message,
        !!is_internal,
        isAdmin,
        attachment
      );

      res.status(201).json({
        success: true,
        message: 'Message added to ticket',
        data: newMsg,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateTicketStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const isAdmin = req.user!.role === 'admin';
      const { referenceId } = req.params;
      const { status, resolution_notes, change_reason } = req.body;

      const report = await feedbackService.updateTicketStatus(
        userId,
        referenceId,
        status,
        resolution_notes,
        change_reason,
        isAdmin
      );

      res.status(200).json({
        success: true,
        message: 'Ticket status updated successfully',
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  async reopenTicket(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const isAdmin = req.user!.role === 'admin';
      const { referenceId } = req.params;
      const { reason } = req.body;

      const report = await feedbackService.updateTicketStatus(
        userId,
        referenceId,
        'reopened',
        undefined,
        reason || 'Reopened by user',
        isAdmin
      );

      res.status(200).json({
        success: true,
        message: 'Ticket reopened successfully',
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  async assignTicket(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const isAdmin = req.user!.role === 'admin';
      const { referenceId } = req.params;
      const { assigned_to } = req.body;

      const report = await feedbackService.assignTicket(userId, referenceId, assigned_to, isAdmin);

      res.status(200).json({
        success: true,
        message: 'Ticket assigned successfully',
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAttachment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const isAdmin = req.user!.role === 'admin';
      const { attachmentId } = req.params;

      const attachment = await feedbackService.getAttachment(userId, attachmentId, isAdmin);

      res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${attachment.filename}"`);
      res.send(attachment.file_data);
    } catch (error) {
      next(error);
    }
  }

  async getAdminTickets(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const isAdmin = req.user!.role === 'admin';
      const { status, severity, report_type, search, page, limit } = req.query;

      const result = await feedbackService.getAdminTickets(
        userId,
        {
          status: status as string,
          severity: severity as string,
          reportType: report_type as string,
          search: search as string,
          page: page ? parseInt(page as string, 10) : 1,
          limit: limit ? parseInt(limit as string, 10) : 20,
        },
        isAdmin
      );

      res.status(200).json({
        success: true,
        data: result.reports,
        total: result.total,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAdminDashboardMetrics(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const isAdmin = req.user!.role === 'admin';

      const metrics = await feedbackService.getAdminDashboardMetrics(userId, isAdmin);

      res.status(200).json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const feedbackController = new FeedbackController();
