import { feedbackService } from '../src/modules/feedback/feedback.service';
import { feedbackController } from '../src/modules/feedback/feedback.controller';

describe('Feedback & Support Module', () => {
  it('creates feedback report and assigns unique reference ID', async () => {
    const userId = 'user-123-abc';
    const report = await feedbackService.createFeedback(userId, {
      report_type: 'bug',
      subject: 'UI alignment issue on goals page',
      description: 'The progress bar overlaps with the status badge when viewed on mobile screens.',
      affected_page: '/goals',
      severity: 'medium',
      contact_preference: 'in_app',
    });

    expect(report.reference_id).toMatch(/^FB-[A-F0-9]{8}$/);
    expect(report.user_id).toBe(userId);
    expect(report.subject).toBe('UI alignment issue on goals page');
    expect(report.status).toBe('submitted');
  });

  it('rejects creation if subject is missing or description is too short', async () => {
    const userId = 'user-123-abc';
    await expect(
      feedbackService.createFeedback(userId, {
        report_type: 'bug',
        subject: 'Hi',
        description: 'Short',
      })
    ).rejects.toThrow('Subject must be at least 3 characters long');
  });

  it('restricts getUserFeedback to only the authenticated user reports', async () => {
    const userA = 'user-aaaa-1111';
    const userB = 'user-bbbb-2222';

    const reportA = await feedbackService.createFeedback(userA, {
      report_type: 'feature',
      subject: 'Dark mode support request',
      description: 'Would love to have an official dark theme option for late night work logs.',
    });

    await feedbackService.createFeedback(userB, {
      report_type: 'complaint',
      subject: 'Notification frequency',
      description: 'Receiving too many email updates when team members edit task descriptions.',
    });

    const userAReports = await feedbackService.getUserFeedback(userA);
    expect(userAReports.length).toBeGreaterThanOrEqual(1);
    expect(userAReports.every((r) => r.user_id === userA)).toBe(true);
    expect(userAReports.some((r) => r.reference_id === reportA.reference_id)).toBe(true);
  });

  it('feedbackController.createFeedback returns 201 with reference ID data', async () => {
    const req = {
      user: { userId: 'user-controller-test' },
      body: {
        report_type: 'suggestion',
        subject: 'Keyboard shortcut for quick search',
        description: 'Pressing Cmd+K or Ctrl+K should open the global search modal.',
      },
    } as any;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const next = jest.fn();

    await feedbackController.createFeedback(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          reference_id: expect.stringMatching(/^FB-[A-F0-9]{8}$/),
        }),
      })
    );
  });

  it('creates feedback report with valid PNG attachment', async () => {
    const userId = 'user-attachment-test';
    const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const report = await feedbackService.createFeedback(userId, {
      report_type: 'complaint',
      subject: 'Issue with dashboard layout rendering',
      description: 'The layout overflows on small mobile screens as shown in attached screenshot.',
      attachment: {
        filename: 'screenshot_bug.png',
        content: samplePngBase64,
        contentType: 'image/png',
        size: 1024,
      },
    });

    expect(report.reference_id).toMatch(/^FB-[A-F0-9]{8}$/);
    expect(report.attachment_url).toBe('screenshot_bug.png');
    expect(report.delivery_status).toBe('saved_locally');
  });

  it('creates feedback report with valid PDF attachment', async () => {
    const userId = 'user-pdf-test';
    const samplePdfBase64 = 'JVBERi0xLjQKJSDi48vTQnJv...';
    const report = await feedbackService.createFeedback(userId, {
      report_type: 'support',
      subject: 'Billing query PDF document',
      description: 'Attached invoice copy for review and confirmation.',
      attachment: {
        filename: 'invoice_2026.pdf',
        content: samplePdfBase64,
        contentType: 'application/pdf',
        size: 2048,
      },
    });

    expect(report.reference_id).toMatch(/^FB-[A-F0-9]{8}$/);
    expect(report.attachment_url).toBe('invoice_2026.pdf');
  });

  it('rejects unsupported attachment file types', async () => {
    const userId = 'user-err-test';
    await expect(
      feedbackService.createFeedback(userId, {
        report_type: 'bug',
        subject: 'Malware script test',
        description: 'Attempting to attach unsupported script file.',
        attachment: {
          filename: 'script.exe',
          content: 'cGxhaW50ZXh0',
          contentType: 'application/x-msdownload',
          size: 500,
        },
      })
    ).rejects.toThrow('Unsupported attachment file type. Allowed types: PNG, JPEG, WEBP, PDF');
  });

  it('rejects attachment file size exceeding 5 MB', async () => {
    const userId = 'user-oversize-test';
    await expect(
      feedbackService.createFeedback(userId, {
        report_type: 'bug',
        subject: 'Oversized file attachment',
        description: 'Attempting to attach a file larger than 5 MB.',
        attachment: {
          filename: 'large_video.png',
          content: 'dGVzdA==',
          contentType: 'image/png',
          size: 6000000,
        },
      })
    ).rejects.toThrow('Attachment file size exceeds maximum limit of 5 MB');
  });

  it('enforces ticket ownership and prevents IDOR access', async () => {
    const userOwner = 'user-owner-999';
    const userAttacker = 'user-attacker-888';

    const report = await feedbackService.createFeedback(userOwner, {
      report_type: 'bug',
      subject: 'Confidential security ticket',
      description: 'Private report detailing account configuration issue.',
    });

    // Attacker tries to read owner ticket -> expects NotFoundError (access denied)
    await expect(
      feedbackService.getFeedbackByReferenceId(userAttacker, report.reference_id, false)
    ).rejects.toThrow('Feedback report not found or access denied');
  });

  it('filters out internal notes when non-admin views ticket details', async () => {
    const user = 'user-thread-owner';
    const admin = 'admin-staff-123';

    const report = await feedbackService.createFeedback(user, {
      report_type: 'support',
      subject: 'Account setup inquiry',
      description: 'Need assistance setting up custom team permissions.',
    });

    // Admin adds internal support note
    await feedbackService.addMessage(admin, report.reference_id, 'Internal note: Verify user subscription history', true, true);

    // Admin adds public reply
    await feedbackService.addMessage(admin, report.reference_id, 'Hello, we have updated your permission configuration.', false, true);

    // Non-admin user views ticket -> internal note must be omitted
    const userView = await feedbackService.getFeedbackByReferenceId(user, report.reference_id, false);
    expect(userView.messages).toBeDefined();
    expect(userView.messages?.some((m) => m.is_internal)).toBe(false);
    expect(userView.messages?.length).toBe(1);
    expect(userView.messages![0].message).toBe('Hello, we have updated your permission configuration.');

    // Admin user views ticket -> internal note included
    const adminView = await feedbackService.getFeedbackByReferenceId(admin, report.reference_id, true);
    expect(adminView.messages?.some((m) => m.is_internal)).toBe(true);
    expect(adminView.messages?.length).toBe(2);
  });

  it('enforces admin authorization for ticket assignment and admin metrics', async () => {
    const regularUser = 'user-regular-777';

    await expect(
      feedbackService.assignTicket(regularUser, 'FB-12345678', 'admin-id', false)
    ).rejects.toThrow('Only support administrators can assign tickets');

    await expect(
      feedbackService.getAdminDashboardMetrics(regularUser, false)
    ).rejects.toThrow('Only support administrators can access admin dashboard metrics');

    await expect(
      feedbackService.getAdminTickets(regularUser, {}, false)
    ).rejects.toThrow('Only support administrators can access the admin support queue');
  });

  it('enforces resolution notes when admin marks ticket resolved and allows reopening within 14 days', async () => {
    const user = 'user-reopen-test';
    const admin = 'admin-reopen-test';

    const report = await feedbackService.createFeedback(user, {
      report_type: 'bug',
      subject: 'Feature glitch on goal review page',
      description: 'Review modal closes unexpectedly when typing a comment.',
    });

    // Resolving without resolution notes fails
    await expect(
      feedbackService.updateTicketStatus(admin, report.reference_id, 'resolved', '', undefined, true)
    ).rejects.toThrow('Resolution notes are required and must be at least 10 characters long when marking a ticket resolved');

    // Resolving with proper resolution notes succeeds
    const resolvedTicket = await feedbackService.updateTicketStatus(
      admin,
      report.reference_id,
      'resolved',
      'Resolved modal trigger issue in release v2.4.1',
      undefined,
      true
    );
    expect(resolvedTicket.status).toBe('resolved');
    expect(resolvedTicket.resolution_notes).toBe('Resolved modal trigger issue in release v2.4.1');

    // User reopens ticket
    const reopenedTicket = await feedbackService.updateTicketStatus(
      user,
      report.reference_id,
      'reopened',
      undefined,
      'Issue reproduced on Chrome mobile',
      false
    );
    expect(reopenedTicket.status).toBe('reopened');
  });

  it('supports user and admin replies with image and PDF attachments', async () => {
    const user = 'user-reply-att-test';
    const admin = 'admin-reply-att-test';

    const report = await feedbackService.createFeedback(user, {
      report_type: 'support',
      subject: 'Reply attachment test inquiry',
      description: 'Testing reply attachments for both user and support staff.',
    });

    // 1. User replies with PNG attachment
    const userMsg = await feedbackService.addMessage(
      user,
      report.reference_id,
      'Here is the requested screenshot for review.',
      false,
      false,
      {
        filename: 'reply_screenshot.png',
        content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        contentType: 'image/png',
        size: 512,
      }
    );
    expect(userMsg.message_id).toBeDefined();
    expect(userMsg.sender_type).toBe('user');

    // 2. Admin replies with PDF document attachment
    const adminMsg = await feedbackService.addMessage(
      admin,
      report.reference_id,
      'Attached official troubleshooting guide PDF.',
      false,
      true,
      {
        filename: 'troubleshooting_guide.pdf',
        content: 'JVBERi0xLjQKJSDi48vTQnJv...',
        contentType: 'application/pdf',
        size: 1024,
      }
    );
    expect(adminMsg.message_id).toBeDefined();
    expect(adminMsg.sender_type).toBe('support');

    // 3. Verify ticket details contain the reply attachments
    const details = await feedbackService.getFeedbackByReferenceId(user, report.reference_id, false);
    expect(details.messages?.length).toBe(2);
    expect(details.attachments?.some((a) => a.filename === 'reply_screenshot.png')).toBe(true);
    expect(details.attachments?.some((a) => a.filename === 'troubleshooting_guide.pdf')).toBe(true);
  });

  it('admin metrics and admin support queue return metrics data', async () => {
    const admin = 'admin-dashboard-user';

    const metrics = await feedbackService.getAdminDashboardMetrics(admin, true);
    expect(metrics.total_users).toBeGreaterThanOrEqual(1);

    const queue = await feedbackService.getAdminTickets(admin, {}, true);
    expect(queue.reports).toBeDefined();
    expect(typeof queue.total).toBe('number');
  });
});
