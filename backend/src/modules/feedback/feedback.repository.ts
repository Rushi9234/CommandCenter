import crypto from 'crypto';
import { pgPool } from '../../utils/database';
import { ServiceUnavailableError } from '../../common/errors';

export type FeedbackStatus = 'submitted' | 'under_review' | 'in_progress' | 'waiting_for_user' | 'resolved' | 'reopened' | 'closed';

export interface FeedbackReport {
  reference_id: string;
  user_id: string;
  report_type: 'bug' | 'complaint' | 'feature' | 'suggestion' | 'support';
  subject: string;
  description: string;
  affected_page?: string;
  expected_behavior?: string;
  actual_behavior?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  contact_preference: 'email' | 'in_app' | 'none';
  attachment_url?: string;
  status: FeedbackStatus;
  delivery_status?: 'email_delivered' | 'saved_locally' | 'delivery_failed';
  assigned_to?: string;
  assigned_to_name?: string;
  assigned_to_email?: string;
  resolution_notes?: string;
  resolved_at?: string;
  resolved_by?: string;
  closed_at?: string;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_email?: string;
  messages?: FeedbackMessage[];
  attachments?: FeedbackAttachmentMeta[];
  audit_logs?: FeedbackAuditLog[];
}

export interface FeedbackMessage {
  message_id: string;
  reference_id: string;
  sender_id: string;
  sender_type: 'user' | 'support' | 'system';
  message: string;
  is_internal: boolean;
  created_at: string;
  sender_name?: string;
  sender_email?: string;
}

export interface FeedbackAttachmentMeta {
  attachment_id: string;
  reference_id: string;
  message_id?: string;
  filename: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

export interface FeedbackAttachmentRecord extends FeedbackAttachmentMeta {
  file_data: Buffer;
}

export interface FeedbackAuditLog {
  log_id: string;
  reference_id: string;
  actor_id: string;
  previous_status?: string;
  new_status: string;
  change_reason?: string;
  created_at: string;
  actor_name?: string;
}

export interface CategoryBreakdown {
  bug: number;
  feature: number;
  complaint: number;
  suggestion: number;
  support: number;
  other: number;
}

export interface PriorityBreakdown {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface TicketTrendPoint {
  date: string;
  created: number;
  resolved: number;
}

export interface AdminActivityEvent {
  log_id: string;
  reference_id: string;
  actor_id: string;
  actor_name?: string;
  previous_status?: string;
  new_status: string;
  change_reason?: string;
  created_at: string;
  subject?: string;
}

export interface AdminDashboardMetrics {
  total_users: number;
  active_users_24h: number;
  total_teams: number;
  total_projects: number;
  total_tasks: number;
  open_tickets: number;
  in_progress_tickets: number;
  waiting_user_tickets: number;
  resolved_tickets: number;
  reopened_tickets: number;
  closed_tickets: number;
  by_category: CategoryBreakdown;
  by_priority: PriorityBreakdown;
  ticket_trends: TicketTrendPoint[];
  recent_activity: AdminActivityEvent[];
}

// In-memory fallback stores for unit test & demo environments without DB migrations
const inMemoryFeedbackStore: FeedbackReport[] = [];
const inMemoryMessageStore: FeedbackMessage[] = [];
const inMemoryAttachmentStore: FeedbackAttachmentRecord[] = [];
const inMemoryAuditStore: FeedbackAuditLog[] = [];

export class FeedbackRepository {
  public generateReferenceId(): string {
    return `FB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  public generateUuid(): string {
    return crypto.randomUUID();
  }

  async createFeedback(
    report: Omit<FeedbackReport, 'reference_id' | 'status' | 'created_at' | 'updated_at'>,
    attachmentPayload?: { filename: string; contentType: string; size: number; content: Buffer }
  ): Promise<FeedbackReport> {
    const reference_id = this.generateReferenceId();
    const now = new Date().toISOString();

    const record: FeedbackReport = {
      ...report,
      reference_id,
      status: 'submitted',
      delivery_status: report.delivery_status || 'saved_locally',
      created_at: now,
      updated_at: now,
    };

    let savedAttachmentMeta: FeedbackAttachmentMeta | undefined;

    try {
      const query = `
        INSERT INTO feedback_reports (
          reference_id, user_id, report_type, subject, description,
          affected_page, expected_behavior, actual_behavior, severity,
          contact_preference, attachment_url, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;
      const values = [
        record.reference_id,
        record.user_id,
        record.report_type,
        record.subject,
        record.description,
        record.affected_page || null,
        record.expected_behavior || null,
        record.actual_behavior || null,
        record.severity,
        record.contact_preference,
        record.attachment_url || null,
        record.status,
        record.created_at,
        record.updated_at,
      ];

      const res = await pgPool.query(query, values);
      let insertedReport = res.rows[0] as FeedbackReport;

      // Save binary attachment into feedback_attachments table if table exists
      if (attachmentPayload) {
        try {
          const attId = this.generateUuid();
          const attQuery = `
            INSERT INTO feedback_attachments (attachment_id, reference_id, filename, mime_type, file_size, file_data, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING attachment_id, reference_id, filename, mime_type, file_size, created_at
          `;
          const attRes = await pgPool.query(attQuery, [
            attId,
            reference_id,
            attachmentPayload.filename,
            attachmentPayload.contentType,
            attachmentPayload.size,
            attachmentPayload.content,
            now,
          ]);
          savedAttachmentMeta = attRes.rows[0];
        } catch (attErr: any) {
          if (process.env.NODE_ENV !== 'test') {
            throw new ServiceUnavailableError(attErr?.message || 'Failed to save attachment binary data');
          }
        }
      }

      // Record initial audit log
      try {
        await pgPool.query(
          `INSERT INTO feedback_audit_logs (log_id, reference_id, actor_id, previous_status, new_status, change_reason, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [this.generateUuid(), reference_id, record.user_id, null, 'submitted', 'Ticket created', now]
        );
      } catch (auditErr: any) {
        if (process.env.NODE_ENV !== 'test') {
          throw new ServiceUnavailableError(auditErr?.message || 'Failed to save ticket audit log');
        }
      }

      if (savedAttachmentMeta) {
        insertedReport.attachments = [savedAttachmentMeta];
      }
      return insertedReport;
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'test') {
        throw new ServiceUnavailableError(
          err?.code === '42P01'
            ? 'Support ticket database tables are unavailable'
            : (err?.message || 'Database query failed')
        );
      }
    }

    if (attachmentPayload) {
      const attRecord: FeedbackAttachmentRecord = {
        attachment_id: this.generateUuid(),
        reference_id,
        filename: attachmentPayload.filename,
        mime_type: attachmentPayload.contentType,
        file_size: attachmentPayload.size,
        file_data: attachmentPayload.content,
        created_at: now,
      };
      inMemoryAttachmentStore.unshift(attRecord);
      savedAttachmentMeta = {
        attachment_id: attRecord.attachment_id,
        reference_id: attRecord.reference_id,
        filename: attRecord.filename,
        mime_type: attRecord.mime_type,
        file_size: attRecord.file_size,
        created_at: attRecord.created_at,
      };
      record.attachments = [savedAttachmentMeta];
    }

    inMemoryAuditStore.unshift({
      log_id: this.generateUuid(),
      reference_id,
      actor_id: record.user_id,
      previous_status: undefined,
      new_status: 'submitted',
      change_reason: 'Ticket created',
      created_at: now,
    });

    inMemoryFeedbackStore.unshift(record);
    return record;
  }

  async getUserFeedback(userId: string): Promise<FeedbackReport[]> {
    try {
      const query = `
        SELECT f.*, u.full_name as user_name, u.email as user_email
        FROM feedback_reports f
        LEFT JOIN users u ON f.user_id = u.user_id
        WHERE f.user_id = $1
        ORDER BY f.created_at DESC
      `;
      const res = await pgPool.query(query, [userId]);
      return res.rows;
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'test') {
        throw new ServiceUnavailableError(
          err?.code === '42P01'
            ? 'Support ticket database tables are unavailable'
            : (err?.message || 'Database query failed')
        );
      }
    }

    return inMemoryFeedbackStore.filter((r) => r.user_id === userId);
  }

  async getFeedbackByReferenceId(
    referenceId: string,
    callerUserId?: string,
    isAdmin = false
  ): Promise<FeedbackReport | null> {
    let report: FeedbackReport | null = null;
    let isFromMemory = false;

    try {
      const query = `
        SELECT f.*,
               u.full_name as user_name, u.email as user_email,
               a.full_name as assigned_to_name, a.email as assigned_to_email
        FROM feedback_reports f
        LEFT JOIN users u ON f.user_id = u.user_id
        LEFT JOIN users a ON f.assigned_to = a.user_id
        WHERE f.reference_id = $1
      `;
      const res = await pgPool.query(query, [referenceId]);
      if (res.rows.length > 0) {
        report = res.rows[0];
      } else {
        if (process.env.NODE_ENV === 'test') {
          isFromMemory = true;
          const found = inMemoryFeedbackStore.find((r) => r.reference_id === referenceId);
          if (found) {
            report = { ...found };
          }
        }
      }
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'test') {
        throw new ServiceUnavailableError(
          err?.code === '42P01'
            ? 'Support ticket database tables are unavailable'
            : (err?.message || 'Database query failed')
        );
      }
      isFromMemory = true;
      const found = inMemoryFeedbackStore.find((r) => r.reference_id === referenceId);
      if (found) {
        report = { ...found };
      }
    }

    if (!report) return null;

    // Ownership Enforcement: Non-admins can ONLY view their own tickets
    if (!isAdmin && callerUserId && report.user_id !== callerUserId) {
      return null;
    }

    if (isFromMemory) {
      let memMsgs = inMemoryMessageStore.filter((m) => m.reference_id === referenceId);
      if (!isAdmin) {
        memMsgs = memMsgs.filter((m) => !m.is_internal);
      }
      report.messages = memMsgs;
      report.attachments = inMemoryAttachmentStore
        .filter((a) => a.reference_id === referenceId)
        .map(({ file_data, ...meta }) => meta);
      if (isAdmin) {
        report.audit_logs = inMemoryAuditStore.filter((a) => a.reference_id === referenceId);
      }
      return report;
    }

    // Fetch Messages - Internal Notes ALWAYS filtered out for non-admins
    try {
      let msgQuery = `
        SELECT m.message_id, m.reference_id, m.sender_id, m.sender_type, m.message, m.is_internal, m.created_at,
               u.full_name as sender_name, u.email as sender_email
        FROM feedback_messages m
        LEFT JOIN users u ON m.sender_id = u.user_id
        WHERE m.reference_id = $1
      `;
      if (!isAdmin) {
        msgQuery += ` AND m.is_internal = FALSE`;
      }
      msgQuery += ` ORDER BY m.created_at ASC`;

      const msgRes = await pgPool.query(msgQuery, [referenceId]);
      report.messages = msgRes.rows;
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'test') {
        throw new ServiceUnavailableError(err?.message || 'Database query failed');
      }
      let memMsgs = inMemoryMessageStore.filter((m) => m.reference_id === referenceId);
      if (!isAdmin) {
        memMsgs = memMsgs.filter((m) => !m.is_internal);
      }
      report.messages = memMsgs;
    }

    // Fetch Attachments Metadata (omitting raw file_data bytea buffer)
    try {
      const attQuery = `
        SELECT attachment_id, reference_id, message_id, filename, mime_type, file_size, created_at
        FROM feedback_attachments
        WHERE reference_id = $1
        ORDER BY created_at ASC
      `;
      const attRes = await pgPool.query(attQuery, [referenceId]);
      report.attachments = attRes.rows;
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'test') {
        throw new ServiceUnavailableError(err?.message || 'Database query failed');
      }
      report.attachments = inMemoryAttachmentStore
        .filter((a) => a.reference_id === referenceId)
        .map(({ file_data, ...meta }) => meta);
    }

    // Fetch Audit Logs (Admin only or system events)
    if (isAdmin) {
      try {
        const auditQuery = `
          SELECT a.log_id, a.reference_id, a.actor_id, a.previous_status, a.new_status, a.change_reason, a.created_at,
                 u.full_name as actor_name
          FROM feedback_audit_logs a
          LEFT JOIN users u ON a.actor_id = u.user_id
          WHERE a.reference_id = $1
          ORDER BY a.created_at DESC
        `;
        const auditRes = await pgPool.query(auditQuery, [referenceId]);
        report.audit_logs = auditRes.rows;
      } catch (err: any) {
        if (process.env.NODE_ENV !== 'test') {
          throw new ServiceUnavailableError(err?.message || 'Database query failed');
        }
        report.audit_logs = inMemoryAuditStore.filter((a) => a.reference_id === referenceId);
      }
    }

    return report;
  }

  async addMessage(
    referenceId: string,
    senderId: string,
    senderType: 'user' | 'support' | 'system',
    message: string,
    isInternal = false,
    attachmentPayload?: { filename: string; contentType: string; size: number; content: Buffer }
  ): Promise<FeedbackMessage> {
    const message_id = this.generateUuid();
    const now = new Date().toISOString();

    const messageRecord: FeedbackMessage = {
      message_id,
      reference_id: referenceId,
      sender_id: senderId,
      sender_type: senderType,
      message,
      is_internal: isInternal,
      created_at: now,
    };

    try {
      const query = `
        INSERT INTO feedback_messages (message_id, reference_id, sender_id, sender_type, message, is_internal, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      const res = await pgPool.query(query, [
        message_id,
        referenceId,
        senderId,
        senderType,
        message,
        isInternal,
        now,
      ]);
      const insertedMsg = res.rows[0] as FeedbackMessage;

      if (attachmentPayload) {
        try {
          const attQuery = `
            INSERT INTO feedback_attachments (attachment_id, reference_id, message_id, filename, mime_type, file_size, file_data, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `;
          await pgPool.query(attQuery, [
            this.generateUuid(),
            referenceId,
            message_id,
            attachmentPayload.filename,
            attachmentPayload.contentType,
            attachmentPayload.size,
            attachmentPayload.content,
            now,
          ]);
        } catch (attErr: any) {
          if (process.env.NODE_ENV !== 'test') {
            throw new ServiceUnavailableError(attErr?.message || 'Failed to save message attachment data');
          }
        }
      }

      return insertedMsg;
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'test') {
        throw new ServiceUnavailableError(
          err?.code === '42P01'
            ? 'Support ticket database tables are unavailable'
            : (err?.message || 'Database query failed')
        );
      }
    }

    if (attachmentPayload) {
      inMemoryAttachmentStore.unshift({
        attachment_id: this.generateUuid(),
        reference_id: referenceId,
        message_id,
        filename: attachmentPayload.filename,
        mime_type: attachmentPayload.contentType,
        file_size: attachmentPayload.size,
        file_data: attachmentPayload.content,
        created_at: now,
      });
    }

    inMemoryMessageStore.push(messageRecord);
    return messageRecord;
  }

  async updateTicketStatus(
    referenceId: string,
    actorId: string,
    newStatus: FeedbackStatus,
    resolutionNotes?: string,
    changeReason?: string
  ): Promise<FeedbackReport | null> {
    const now = new Date().toISOString();
    let prevStatus: string | undefined;

    // Transactional DB update
    let client;
    try {
      client = await pgPool.connect();
      await client.query('BEGIN');

      const selectRes = await client.query(`SELECT * FROM feedback_reports WHERE reference_id = $1 FOR UPDATE`, [referenceId]);
      if (selectRes.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return null;
      }

      const current = selectRes.rows[0] as FeedbackReport;
      prevStatus = current.status;

      let updateQuery = `
        UPDATE feedback_reports
        SET status = $1, updated_at = $2
      `;
      const updateValues: any[] = [newStatus, now];

      if (newStatus === 'resolved') {
        updateQuery += `, resolution_notes = $3, resolved_at = $4, resolved_by = $5 WHERE reference_id = $6 RETURNING *`;
        updateValues.push(resolutionNotes || null, now, actorId, referenceId);
      } else if (newStatus === 'closed') {
        updateQuery += `, closed_at = $3 WHERE reference_id = $4 RETURNING *`;
        updateValues.push(now, referenceId);
      } else {
        updateQuery += ` WHERE reference_id = $3 RETURNING *`;
        updateValues.push(referenceId);
      }

      const updateRes = await client.query(updateQuery, updateValues);
      const updatedReport = updateRes.rows[0];

      // Audit Log insertion inside same transaction
      await client.query(
        `INSERT INTO feedback_audit_logs (log_id, reference_id, actor_id, previous_status, new_status, change_reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [this.generateUuid(), referenceId, actorId, prevStatus, newStatus, changeReason || 'Status update', now]
      );

      await client.query('COMMIT');
      client.release();
      return updatedReport;
    } catch (err: any) {
      if (client) {
        try {
          await client.query('ROLLBACK');
          client.release();
        } catch {
          // ignore
        }
      }
      if (process.env.NODE_ENV !== 'test') {
        throw new ServiceUnavailableError(
          err?.code === '42P01'
            ? 'Support ticket database tables are unavailable'
            : (err?.message || 'Database query failed')
        );
      }
    }

    // In-memory fallback update
    const ticket = inMemoryFeedbackStore.find((r) => r.reference_id === referenceId);
    if (!ticket) return null;

    prevStatus = ticket.status;
    ticket.status = newStatus;
    ticket.updated_at = now;
    if (newStatus === 'resolved') {
      ticket.resolution_notes = resolutionNotes;
      ticket.resolved_at = now;
      ticket.resolved_by = actorId;
    } else if (newStatus === 'closed') {
      ticket.closed_at = now;
    }

    inMemoryAuditStore.unshift({
      log_id: this.generateUuid(),
      reference_id: referenceId,
      actor_id: actorId,
      previous_status: prevStatus,
      new_status: newStatus,
      change_reason: changeReason || 'Status update',
      created_at: now,
    });

    return ticket;
  }

  async assignTicket(referenceId: string, actorId: string, assignedToId: string): Promise<FeedbackReport | null> {
    const now = new Date().toISOString();
    try {
      const res = await pgPool.query(
        `UPDATE feedback_reports SET assigned_to = $1, status = 'in_progress', updated_at = $2 WHERE reference_id = $3 RETURNING *`,
        [assignedToId, now, referenceId]
      );
      if (res.rows.length > 0) {
        try {
          await pgPool.query(
            `INSERT INTO feedback_audit_logs (log_id, reference_id, actor_id, previous_status, new_status, change_reason, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [this.generateUuid(), referenceId, actorId, 'submitted', 'in_progress', `Assigned to ${assignedToId}`, now]
          );
        } catch {
          // ignore
        }
        return res.rows[0];
      }
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'test') {
        throw new ServiceUnavailableError(
          err?.code === '42P01'
            ? 'Support ticket database tables are unavailable'
            : (err?.message || 'Database query failed')
        );
      }
    }

    const ticket = inMemoryFeedbackStore.find((r) => r.reference_id === referenceId);
    if (!ticket) return null;
    ticket.assigned_to = assignedToId;
    ticket.status = 'in_progress';
    ticket.updated_at = now;
    return ticket;
  }

  async getAttachmentById(attachmentId: string): Promise<FeedbackAttachmentRecord | null> {
    try {
      const res = await pgPool.query(
        `SELECT attachment_id, reference_id, message_id, filename, mime_type, file_size, file_data, created_at
         FROM feedback_attachments WHERE attachment_id = $1`,
        [attachmentId]
      );
      if (res.rows.length > 0) {
        return res.rows[0];
      }
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'test') {
        throw new ServiceUnavailableError(
          err?.code === '42P01'
            ? 'Support ticket database tables are unavailable'
            : (err?.message || 'Database query failed')
        );
      }
    }

    const found = inMemoryAttachmentStore.find((a) => a.attachment_id === attachmentId);
    return found || null;
  }

  async getAdminTickets(options: {
    status?: string;
    severity?: string;
    reportType?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ reports: FeedbackReport[]; total: number }> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 20;
    const offset = (page - 1) * limit;

    try {
      let baseQuery = `
        FROM feedback_reports f
        LEFT JOIN users u ON f.user_id = u.user_id
        LEFT JOIN users a ON f.assigned_to = a.user_id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (options.status) {
        params.push(options.status);
        baseQuery += ` AND f.status = $${params.length}`;
      }
      if (options.severity) {
        params.push(options.severity);
        baseQuery += ` AND f.severity = $${params.length}`;
      }
      if (options.reportType) {
        params.push(options.reportType);
        baseQuery += ` AND f.report_type = $${params.length}`;
      }
      if (options.search) {
        params.push(`%${options.search}%`);
        baseQuery += ` AND (f.subject ILIKE $${params.length} OR f.description ILIKE $${params.length} OR f.reference_id ILIKE $${params.length})`;
      }

      const countRes = await pgPool.query(`SELECT COUNT(*) ${baseQuery}`, params);
      const total = parseInt(countRes.rows[0].count, 10);

      params.push(limit, offset);
      const selectQuery = `
        SELECT f.*, u.full_name as user_name, u.email as user_email,
               a.full_name as assigned_to_name, a.email as assigned_to_email
        ${baseQuery}
        ORDER BY f.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `;

      const dataRes = await pgPool.query(selectQuery, params);
      return { reports: dataRes.rows, total };
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'test') {
        throw new ServiceUnavailableError(
          err?.code === '42P01'
            ? 'Support ticket database tables are unavailable'
            : (err?.message || 'Database query failed')
        );
      }
    }

    let filtered = [...inMemoryFeedbackStore];
    if (options.status) filtered = filtered.filter((r) => r.status === options.status);
    if (options.severity) filtered = filtered.filter((r) => r.severity === options.severity);
    if (options.reportType) filtered = filtered.filter((r) => r.report_type === options.reportType);
    if (options.search) {
      const q = options.search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.subject.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.reference_id.toLowerCase().includes(q)
      );
    }
    const total = filtered.length;
    const reports = filtered.slice(offset, offset + limit);
    return { reports, total };
  }

  async getAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
    const defaultMetrics: AdminDashboardMetrics = {
      total_users: 0,
      active_users_24h: 0,
      total_teams: 0,
      total_projects: 0,
      total_tasks: 0,
      open_tickets: 0,
      in_progress_tickets: 0,
      waiting_user_tickets: 0,
      resolved_tickets: 0,
      reopened_tickets: 0,
      closed_tickets: 0,
      by_category: { bug: 0, feature: 0, complaint: 0, suggestion: 0, support: 0, other: 0 },
      by_priority: { critical: 0, high: 0, medium: 0, low: 0 },
      ticket_trends: [],
      recent_activity: [],
    };

    try {
      const userRes = await pgPool.query(`SELECT COUNT(*) FROM users`);
      defaultMetrics.total_users = parseInt(userRes.rows[0].count, 10);

      const activeRes = await pgPool.query(`
        SELECT COUNT(DISTINCT user_id) FROM (
          SELECT user_id FROM daily_logs WHERE created_at >= NOW() - INTERVAL '24 hours'
          UNION
          SELECT user_id FROM daily_work_submissions WHERE created_at >= NOW() - INTERVAL '24 hours'
          UNION
          SELECT sender_user_id AS user_id FROM chat_messages WHERE created_at >= NOW() - INTERVAL '24 hours'
        ) active_users
      `);
      defaultMetrics.active_users_24h = parseInt(activeRes.rows[0].count, 10);

      const teamRes = await pgPool.query(`SELECT COUNT(*) FROM teams`);
      defaultMetrics.total_teams = parseInt(teamRes.rows[0].count, 10);

      const projRes = await pgPool.query(`SELECT COUNT(*) FROM projects`);
      defaultMetrics.total_projects = parseInt(projRes.rows[0].count, 10);

      const taskRes = await pgPool.query(`SELECT COUNT(*) FROM tasks`);
      defaultMetrics.total_tasks = parseInt(taskRes.rows[0].count, 10);

      const ticketCountsRes = await pgPool.query(`
        SELECT status, COUNT(*) AS count
        FROM feedback_reports
        GROUP BY status
      `);

      for (const row of ticketCountsRes.rows) {
        const c = parseInt(row.count, 10);
        if (row.status === 'submitted' || row.status === 'under_review') {
          defaultMetrics.open_tickets += c;
        } else if (row.status === 'in_progress') {
          defaultMetrics.in_progress_tickets += c;
        } else if (row.status === 'waiting_for_user') {
          defaultMetrics.waiting_user_tickets += c;
        } else if (row.status === 'resolved') {
          defaultMetrics.resolved_tickets += c;
        } else if (row.status === 'reopened') {
          defaultMetrics.reopened_tickets += c;
        } else if (row.status === 'closed') {
          defaultMetrics.closed_tickets += c;
        }
      }

      // Category breakdown
      const catRes = await pgPool.query(`
        SELECT report_type, COUNT(*) AS count
        FROM feedback_reports
        GROUP BY report_type
      `);
      for (const row of catRes.rows) {
        const c = parseInt(row.count, 10);
        if (row.report_type in defaultMetrics.by_category) {
          (defaultMetrics.by_category as any)[row.report_type] = c;
        } else {
          defaultMetrics.by_category.other += c;
        }
      }

      // Priority breakdown
      const prioRes = await pgPool.query(`
        SELECT severity, COUNT(*) AS count
        FROM feedback_reports
        GROUP BY severity
      `);
      for (const row of prioRes.rows) {
        const c = parseInt(row.count, 10);
        if (row.severity in defaultMetrics.by_priority) {
          (defaultMetrics.by_priority as any)[row.severity] = c;
        }
      }

      // Ticket trends (last 14 days)
      const trendRes = await pgPool.query(`
        SELECT
          d::date::text AS date,
          COALESCE(c.created_count, 0)::int AS created,
          COALESCE(r.resolved_count, 0)::int AS resolved
        FROM generate_series(
          CURRENT_DATE - INTERVAL '13 days',
          CURRENT_DATE,
          INTERVAL '1 day'
        ) d
        LEFT JOIN (
          SELECT created_at::date AS date, COUNT(*) AS created_count
          FROM feedback_reports
          WHERE created_at >= CURRENT_DATE - INTERVAL '13 days'
          GROUP BY created_at::date
        ) c ON d::date = c.date
        LEFT JOIN (
          SELECT resolved_at::date AS date, COUNT(*) AS resolved_count
          FROM feedback_reports
          WHERE resolved_at IS NOT NULL AND resolved_at >= CURRENT_DATE - INTERVAL '13 days'
          GROUP BY resolved_at::date
        ) r ON d::date = r.date
        ORDER BY d::date ASC
      `);
      defaultMetrics.ticket_trends = trendRes.rows.map((row) => ({
        date: row.date,
        created: parseInt(row.created, 10),
        resolved: parseInt(row.resolved, 10),
      }));

      // Recent activity from audit logs
      const activityRes = await pgPool.query(`
        SELECT
          a.log_id,
          a.reference_id,
          a.actor_id,
          COALESCE(u.full_name, 'System') AS actor_name,
          a.previous_status,
          a.new_status,
          a.change_reason,
          a.created_at,
          r.subject
        FROM feedback_audit_logs a
        LEFT JOIN users u ON a.actor_id = u.user_id
        LEFT JOIN feedback_reports r ON a.reference_id = r.reference_id
        ORDER BY a.created_at DESC
        LIMIT 10
      `);
      defaultMetrics.recent_activity = activityRes.rows;

      return defaultMetrics;
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'test') {
        throw new ServiceUnavailableError(
          err?.code === '42P01'
            ? 'Support ticket database tables are unavailable'
            : (err?.message || 'Database query failed')
        );
      }
    }

    defaultMetrics.total_users = 1;
    defaultMetrics.active_users_24h = 1;
    defaultMetrics.total_teams = 1;
    defaultMetrics.total_projects = 1;
    defaultMetrics.total_tasks = 1;
    defaultMetrics.open_tickets = inMemoryFeedbackStore.filter((r) => r.status === 'submitted' || r.status === 'under_review').length;
    defaultMetrics.in_progress_tickets = inMemoryFeedbackStore.filter((r) => r.status === 'in_progress').length;
    defaultMetrics.waiting_user_tickets = inMemoryFeedbackStore.filter((r) => r.status === 'waiting_for_user').length;
    defaultMetrics.resolved_tickets = inMemoryFeedbackStore.filter((r) => r.status === 'resolved').length;
    defaultMetrics.reopened_tickets = inMemoryFeedbackStore.filter((r) => r.status === 'reopened').length;
    defaultMetrics.closed_tickets = inMemoryFeedbackStore.filter((r) => r.status === 'closed').length;

    for (const r of inMemoryFeedbackStore) {
      if (r.report_type in defaultMetrics.by_category) {
        (defaultMetrics.by_category as any)[r.report_type] += 1;
      } else {
        defaultMetrics.by_category.other += 1;
      }
      if (r.severity in defaultMetrics.by_priority) {
        (defaultMetrics.by_priority as any)[r.severity] += 1;
      }
    }

    const days: TicketTrendPoint[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      const createdCount = inMemoryFeedbackStore.filter((r) => r.created_at.startsWith(dateStr)).length;
      const resolvedCount = inMemoryFeedbackStore.filter((r) => r.resolved_at && r.resolved_at.startsWith(dateStr)).length;

      days.push({
        date: dateStr,
        created: createdCount,
        resolved: resolvedCount,
      });
    }
    defaultMetrics.ticket_trends = days;

    defaultMetrics.recent_activity = inMemoryAuditStore.slice(0, 10).map((log) => {
      const parentReport = inMemoryFeedbackStore.find((r) => r.reference_id === log.reference_id);
      return {
        log_id: log.log_id,
        reference_id: log.reference_id,
        actor_id: log.actor_id,
        actor_name: log.actor_name || 'Admin User',
        previous_status: log.previous_status,
        new_status: log.new_status,
        change_reason: log.change_reason,
        created_at: log.created_at,
        subject: parentReport?.subject || 'Support Ticket',
      };
    });

    return defaultMetrics;
  }
}

export const feedbackRepository = new FeedbackRepository();
