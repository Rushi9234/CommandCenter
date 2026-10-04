import { feedbackRepository, FeedbackReport, FeedbackStatus, FeedbackMessage, FeedbackAttachmentRecord, AdminDashboardMetrics } from './feedback.repository';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../common/errors';
import { sendSupportNotificationEmail } from '../../services/emailService';
import { authRepository } from '../auth/auth.repository';
import { usersRepository } from '../users/users.repository';
import { notificationsService } from '../notifications/notifications.service';
import { env } from '../../config/env';

export interface FeedbackAttachmentDTO {
  filename: string;
  content: string; // Base64 encoded string
  contentType: string;
  size: number;
}

export interface CreateFeedbackDTO {
  report_type: 'bug' | 'complaint' | 'feature' | 'suggestion' | 'support';
  subject: string;
  description: string;
  affected_page?: string;
  expected_behavior?: string;
  actual_behavior?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  contact_preference?: 'email' | 'in_app' | 'none';
  attachment_url?: string;
  attachment?: FeedbackAttachmentDTO;
}

export class FeedbackService {
  private async notifySupportStaff(
    actorUserId: string,
    category: string,
    title: string,
    message: string,
    assignedUserId?: string
  ): Promise<void> {
    try {
      const recipients = new Set<string>();
      if (assignedUserId && assignedUserId !== actorUserId) {
        recipients.add(assignedUserId);
      } else {
        const staffList = await usersRepository.getSupportStaffUsers();
        for (const staff of staffList) {
          if (staff.user_id && staff.user_id !== actorUserId) {
            recipients.add(staff.user_id);
          }
        }
      }

      for (const recipientUserId of recipients) {
        await notificationsService.notifyUser({
          recipientUserId,
          category,
          preferenceGroup: 'support_ticket',
          title,
          message,
        });
      }
    } catch {
      // Best-effort notification dispatch
    }
  }

  private validateAttachment(attachment?: FeedbackAttachmentDTO): { filename: string; contentType: string; size: number; content: Buffer } | undefined {
    if (!attachment) return undefined;

    const { filename, content, contentType, size } = attachment;
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (size > MAX_SIZE) {
      throw new BadRequestError('Attachment file size exceeds maximum limit of 5 MB');
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    if (!contentType || !allowedTypes.includes(contentType.toLowerCase())) {
      throw new BadRequestError('Unsupported attachment file type. Allowed types: PNG, JPEG, WEBP, PDF');
    }

    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileBuffer = Buffer.from(content, 'base64');

    return {
      filename: sanitizedFilename,
      contentType,
      size,
      content: fileBuffer,
    };
  }

  async createFeedback(userId: string, dto: CreateFeedbackDTO): Promise<FeedbackReport> {
    if (!userId) {
      throw new BadRequestError('User identity is required');
    }

    if (!dto.subject || dto.subject.trim().length < 3) {
      throw new BadRequestError('Subject must be at least 3 characters long');
    }

    if (!dto.description || dto.description.trim().length < 10) {
      throw new BadRequestError('Description must be at least 10 characters long');
    }

    const validTypes = ['bug', 'complaint', 'feature', 'suggestion', 'support'];
    if (!validTypes.includes(dto.report_type)) {
      throw new BadRequestError('Invalid report type selected');
    }

    const severity = dto.severity && ['low', 'medium', 'high', 'critical'].includes(dto.severity) ? dto.severity : 'medium';
    const contact_preference = dto.contact_preference && ['email', 'in_app', 'none'].includes(dto.contact_preference) ? dto.contact_preference : 'in_app';

    const attachmentParsed = this.validateAttachment(dto.attachment);

    let userName = 'Authenticated User';
    let userEmail = 'user@commandcenter.local';
    try {
      const user = await authRepository.getUserById(userId);
      if (user) {
        userName = user.full_name || user.username || userName;
        userEmail = user.email || userEmail;
      }
    } catch {
      // Ignore user fetch errors if db unavailable
    }

    const report = await feedbackRepository.createFeedback(
      {
        user_id: userId,
        report_type: dto.report_type,
        subject: dto.subject.trim(),
        description: dto.description.trim(),
        affected_page: dto.affected_page?.trim(),
        expected_behavior: dto.expected_behavior?.trim(),
        actual_behavior: dto.actual_behavior?.trim(),
        severity,
        contact_preference,
        attachment_url: dto.attachment ? dto.attachment.filename : dto.attachment_url?.trim(),
        user_name: userName,
        user_email: userEmail,
        delivery_status: 'saved_locally',
      },
      attachmentParsed
    );

    const emailSent = await sendSupportNotificationEmail({
      referenceId: report.reference_id,
      reportType: report.report_type,
      subject: report.subject,
      description: report.description,
      userName,
      userEmail,
      severity: report.severity,
      affectedPage: report.affected_page,
      expectedBehavior: report.expected_behavior,
      actualBehavior: report.actual_behavior,
      attachment: attachmentParsed
        ? {
            filename: attachmentParsed.filename,
            content: attachmentParsed.content,
            contentType: attachmentParsed.contentType,
          }
        : undefined,
    });

    const isRealProvider = env.emailProvider === 'resend' || env.emailProvider === 'smtp';
    const isSupportConfigured = !!env.supportEmail && !env.supportEmail.endsWith('@commandcenter.local');
    if (isRealProvider && isSupportConfigured) {
      report.delivery_status = emailSent ? 'email_delivered' : 'delivery_failed';
    } else {
      report.delivery_status = 'saved_locally';
    }

    // Notify support staff of new ticket submission
    void this.notifySupportStaff(
      userId,
      'support.submitted',
      'New Support Ticket Submitted',
      `[${report.reference_id}] ${dto.report_type.toUpperCase()}: ${dto.subject.trim()}`
    );

    return report;
  }

  async getUserFeedback(userId: string): Promise<FeedbackReport[]> {
    if (!userId) {
      throw new BadRequestError('User identity is required');
    }
    return feedbackRepository.getUserFeedback(userId);
  }

  async getFeedbackByReferenceId(userId: string, referenceId: string, isAdmin = false): Promise<FeedbackReport> {
    if (!userId || !referenceId) {
      throw new BadRequestError('User identity and reference ID are required');
    }

    const report = await feedbackRepository.getFeedbackByReferenceId(referenceId, userId, isAdmin);
    if (!report) {
      throw new NotFoundError('Feedback report not found or access denied');
    }

    // Lazy Auto-Closure Policy: Auto-close tickets resolved >14 days ago
    if (report.status === 'resolved' && report.resolved_at) {
      const resolvedDate = new Date(report.resolved_at).getTime();
      const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
      if (Date.now() - resolvedDate > fourteenDaysMs) {
        await feedbackRepository.updateTicketStatus(referenceId, userId, 'closed', undefined, 'Auto-closed after 14 days');
        report.status = 'closed';
        report.closed_at = new Date().toISOString();
      }
    }

    return report;
  }

  async addMessage(
    userId: string,
    referenceId: string,
    messageText: string,
    isInternal = false,
    isAdmin = false,
    attachmentDTO?: FeedbackAttachmentDTO
  ): Promise<FeedbackMessage> {
    if (!userId || !referenceId) {
      throw new BadRequestError('User identity and reference ID are required');
    }

    if (!messageText || messageText.trim().length === 0) {
      throw new BadRequestError('Message content cannot be empty');
    }

    const report = await feedbackRepository.getFeedbackByReferenceId(referenceId, userId, isAdmin);
    if (!report) {
      throw new NotFoundError('Feedback report not found or access denied');
    }

    // Permission Enforcement
    if (!isAdmin) {
      if (report.user_id !== userId) {
        throw new ForbiddenError('You can only reply to your own support tickets');
      }
      if (isInternal) {
        throw new ForbiddenError('Regular users cannot create internal support notes');
      }
    }

    const attachmentParsed = this.validateAttachment(attachmentDTO);
    const senderType = isAdmin ? 'support' : 'user';

    const message = await feedbackRepository.addMessage(
      referenceId,
      userId,
      senderType,
      messageText.trim(),
      isInternal,
      attachmentParsed
    );

    // Auto status update on reply
    if (!isInternal) {
      if (isAdmin && report.status !== 'resolved' && report.status !== 'closed') {
        await feedbackRepository.updateTicketStatus(referenceId, userId, 'waiting_for_user', undefined, 'Support staff replied');
      } else if (!isAdmin && report.status === 'waiting_for_user') {
        await feedbackRepository.updateTicketStatus(referenceId, userId, 'in_progress', undefined, 'User replied');
      }
    }

    // Notification dispatches
    if (isInternal) {
      void this.notifySupportStaff(
        userId,
        'support.internal_note',
        'Internal Support Note Added',
        `[${referenceId}] Internal staff note added to ticket`,
        report.assigned_to
      );
    } else if (isAdmin) {
      if (report.user_id && report.user_id !== userId) {
        void notificationsService.notifyUser({
          recipientUserId: report.user_id,
          category: 'support.reply',
          preferenceGroup: 'support_ticket',
          title: 'New Reply from Support',
          message: `Support staff replied to your ticket [${referenceId}]`,
        });
      }
    } else {
      void this.notifySupportStaff(
        userId,
        'support.user_reply',
        'User Replied to Ticket',
        `[${referenceId}] User replied to support ticket`,
        report.assigned_to
      );
    }

    return message;
  }

  async updateTicketStatus(
    userId: string,
    referenceId: string,
    newStatus: FeedbackStatus,
    resolutionNotes?: string,
    changeReason?: string,
    isAdmin = false
  ): Promise<FeedbackReport> {
    if (!userId || !referenceId) {
      throw new BadRequestError('User identity and reference ID are required');
    }

    const validStatuses: FeedbackStatus[] = ['submitted', 'under_review', 'in_progress', 'waiting_for_user', 'resolved', 'reopened', 'closed'];
    if (!validStatuses.includes(newStatus)) {
      throw new BadRequestError('Invalid ticket status specified');
    }

    const report = await feedbackRepository.getFeedbackByReferenceId(referenceId, userId, isAdmin);
    if (!report) {
      throw new NotFoundError('Feedback report not found or access denied');
    }

    // User Reopen Check
    if (!isAdmin) {
      if (report.user_id !== userId) {
        throw new ForbiddenError('You can only update status on your own tickets');
      }
      if (newStatus !== 'reopened') {
        throw new ForbiddenError('Regular users are only permitted to reopen resolved tickets');
      }
      if (report.status !== 'resolved') {
        throw new BadRequestError('Only resolved tickets can be reopened');
      }
      if (report.resolved_at) {
        const resolvedDate = new Date(report.resolved_at).getTime();
        const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
        if (Date.now() - resolvedDate > fourteenDaysMs) {
          throw new BadRequestError('Tickets can only be reopened within 14 days of resolution');
        }
      }
    }

    if (newStatus === 'resolved') {
      if (!resolutionNotes || resolutionNotes.trim().length < 10) {
        throw new BadRequestError('Resolution notes are required and must be at least 10 characters long when marking a ticket resolved');
      }
    }

    const updated = await feedbackRepository.updateTicketStatus(
      referenceId,
      userId,
      newStatus,
      resolutionNotes?.trim(),
      changeReason?.trim() || (newStatus === 'reopened' ? 'Reopened by user' : 'Status changed')
    );

    if (!updated) {
      throw new BadRequestError('Failed to update ticket status');
    }

    // Status change notification dispatches
    if (newStatus === 'in_progress') {
      if (report.user_id && report.user_id !== userId) {
        void notificationsService.notifyUser({
          recipientUserId: report.user_id,
          category: 'support.status_changed',
          preferenceGroup: 'support_ticket',
          title: 'Support Ticket In Progress',
          message: `Your ticket [${referenceId}] is now in progress`,
        });
      }
    } else if (newStatus === 'waiting_for_user') {
      if (report.user_id && report.user_id !== userId) {
        void notificationsService.notifyUser({
          recipientUserId: report.user_id,
          category: 'support.status_changed',
          preferenceGroup: 'support_ticket',
          title: 'Action Needed on Support Ticket',
          message: `Support staff is waiting for your response on ticket [${referenceId}]`,
        });
      }
    } else if (newStatus === 'resolved') {
      if (report.user_id && report.user_id !== userId) {
        void notificationsService.notifyUser({
          recipientUserId: report.user_id,
          category: 'support.resolved',
          preferenceGroup: 'support_ticket',
          title: 'Support Ticket Resolved',
          message: `Your support ticket [${referenceId}] has been resolved`,
        });
      }
    } else if (newStatus === 'reopened') {
      void this.notifySupportStaff(
        userId,
        'support.reopened',
        'Support Ticket Reopened',
        `[${referenceId}] User reopened support ticket`,
        report.assigned_to
      );
    } else if (newStatus === 'closed') {
      if (report.user_id && report.user_id !== userId) {
        void notificationsService.notifyUser({
          recipientUserId: report.user_id,
          category: 'support.closed',
          preferenceGroup: 'support_ticket',
          title: 'Support Ticket Closed',
          message: `Your support ticket [${referenceId}] has been closed`,
        });
      }
    }

    return updated;
  }

  async assignTicket(userId: string, referenceId: string, assignedToId: string, isAdmin = false): Promise<FeedbackReport> {
    if (!isAdmin) {
      throw new ForbiddenError('Only support administrators can assign tickets');
    }

    if (!assignedToId) {
      throw new BadRequestError('Assigned user ID is required');
    }

    const report = await feedbackRepository.getFeedbackByReferenceId(referenceId, userId, true);
    const previousAssignedTo = report?.assigned_to;

    const updated = await feedbackRepository.assignTicket(referenceId, userId, assignedToId);
    if (!updated) {
      throw new NotFoundError('Ticket not found or assignment failed');
    }

    if (assignedToId && assignedToId !== userId) {
      void notificationsService.notifyUser({
        recipientUserId: assignedToId,
        category: 'support.assigned',
        preferenceGroup: 'support_ticket',
        title: 'Support Ticket Assigned',
        message: `You have been assigned to support ticket [${referenceId}]`,
      });
    }

    if (previousAssignedTo && previousAssignedTo !== assignedToId && previousAssignedTo !== userId) {
      void notificationsService.notifyUser({
        recipientUserId: previousAssignedTo,
        category: 'support.reassigned',
        preferenceGroup: 'support_ticket',
        title: 'Support Ticket Reassigned',
        message: `Support ticket [${referenceId}] has been reassigned to another staff member`,
      });
    }

    return updated;
  }

  async getAttachment(userId: string, attachmentId: string, isAdmin = false): Promise<FeedbackAttachmentRecord> {
    if (!attachmentId) {
      throw new BadRequestError('Attachment ID is required');
    }

    const attachment = await feedbackRepository.getAttachmentById(attachmentId);
    if (!attachment) {
      throw new NotFoundError('Attachment file not found');
    }

    // IDOR Check: Ensure user owns the ticket associated with this attachment
    if (!isAdmin) {
      const ticket = await feedbackRepository.getFeedbackByReferenceId(attachment.reference_id, userId, false);
      if (!ticket) {
        throw new ForbiddenError('Access denied to requested attachment');
      }
    }

    return attachment;
  }

  async getAdminTickets(
    userId: string,
    options: { status?: string; severity?: string; reportType?: string; search?: string; page?: number; limit?: number },
    isAdmin = false
  ): Promise<{ reports: FeedbackReport[]; total: number }> {
    if (!isAdmin) {
      throw new ForbiddenError('Only support administrators can access the admin support queue');
    }

    return feedbackRepository.getAdminTickets(options);
  }

  async getAdminDashboardMetrics(userId: string, isAdmin = false): Promise<AdminDashboardMetrics> {
    if (!isAdmin) {
      throw new ForbiddenError('Only support administrators can access admin dashboard metrics');
    }

    return feedbackRepository.getAdminDashboardMetrics();
  }
}

export const feedbackService = new FeedbackService();
