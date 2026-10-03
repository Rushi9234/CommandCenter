import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '../services/api';

interface TicketDetailDrawerProps {
  referenceId: string | null;
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  onUpdated?: () => void;
}

export default function TicketDetailDrawer({
  referenceId,
  isOpen,
  onClose,
  isAdmin = false,
  onUpdated,
}: TicketDetailDrawerProps) {
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Composer State
  const [replyMessage, setReplyMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [selectedReplyFile, setSelectedReplyFile] = useState<File | null>(null);
  const [replyFileError, setReplyFileError] = useState<string | null>(null);

  // Attachment Download State
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Admin Controls State
  const [targetStatus, setTargetStatus] = useState<string>('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Admin Assignment State
  const [usersList, setUsersList] = useState<any[]>([]);
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Reopen State (User)
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);
  const [showReopenInput, setShowReopenInput] = useState(false);

  // Fetch Ticket Data & Staff List
  const fetchTicketDetails = async () => {
    if (!referenceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getFeedbackByReferenceId(referenceId);
      if (res.data?.data) {
        setTicket(res.data.data);
        setTargetStatus(res.data.data.status);
        setAssignedTo(res.data.data.assigned_to || '');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load support ticket details.');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    if (!isAdmin) return;
    try {
      const res = await api.getAllUsers();
      if (res.data?.data) {
        setUsersList(res.data.data);
      }
    } catch {
      // Ignore user list fetch error silently in partial state
    }
  };

  useEffect(() => {
    if (isOpen && referenceId) {
      fetchTicketDetails();
      if (isAdmin) {
        fetchUsers();
      }
      setReplyMessage('');
      setReplyError(null);
      setSelectedReplyFile(null);
      setReplyFileError(null);
      setShowReopenInput(false);
      setReopenReason('');
      setStatusError(null);
      setAssignError(null);
      setDownloadError(null);
    }
  }, [isOpen, referenceId, isAdmin]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1] || '';
        resolve(base64Data);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const handleReplyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setReplyFileError(null);
    setReplyError(null);
    if (!file) {
      setSelectedReplyFile(null);
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setReplyFileError('Unsupported file format. Please attach a PNG, JPEG, WEBP, or PDF file.');
      setSelectedReplyFile(null);
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_SIZE) {
      setReplyFileError('File size exceeds the maximum limit of 5 MB.');
      setSelectedReplyFile(null);
      return;
    }

    setSelectedReplyFile(file);
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referenceId || !replyMessage.trim()) return;
    if (replyFileError) {
      setReplyError(replyFileError);
      return;
    }

    setSending(true);
    setReplyError(null);
    try {
      let attachmentPayload: { filename: string; content: string; contentType: string; size: number } | undefined;
      if (selectedReplyFile) {
        const base64Content = await fileToBase64(selectedReplyFile);
        attachmentPayload = {
          filename: selectedReplyFile.name,
          content: base64Content,
          contentType: selectedReplyFile.type,
          size: selectedReplyFile.size,
        };
      }

      await api.addFeedbackMessage(referenceId, replyMessage.trim(), isInternalNote, attachmentPayload);
      setReplyMessage('');
      setSelectedReplyFile(null);
      fetchTicketDetails();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setReplyError(err.response?.data?.error || 'Failed to post message.');
    } finally {
      setSending(false);
    }
  };

  const handleDownloadAttachment = async (attachmentId: string, filename: string, mimeType: string) => {
    if (!referenceId || !attachmentId) return;
    setDownloadingId(attachmentId);
    setDownloadError(null);
    try {
      const res = await api.downloadAttachment(referenceId, attachmentId);
      const blob = new Blob([res.data], { type: mimeType || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename || 'attachment');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      const status = err.response?.status;
      let msg = 'Failed to download attachment.';
      if (status === 401) msg = 'Session expired. Please log in to download attachments.';
      else if (status === 403) msg = 'Access denied. You do not have permission to download this attachment.';
      else if (status === 404) msg = 'Attachment file not found.';
      setDownloadError(msg);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleStatusUpdate = async () => {
    if (!referenceId || !targetStatus) return;

    if (targetStatus === 'resolved' && resolutionNotes.trim().length < 10) {
      setStatusError('Resolution notes are required and must be at least 10 characters long.');
      return;
    }

    setStatusUpdating(true);
    setStatusError(null);
    try {
      await api.updateTicketStatus(referenceId, targetStatus, resolutionNotes.trim());
      fetchTicketDetails();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setStatusError(err.response?.data?.error || 'Failed to update ticket status.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAssignTicket = async () => {
    if (!referenceId || !assignedTo) return;

    setAssigning(true);
    setAssignError(null);
    try {
      await api.assignTicket(referenceId, assignedTo);
      fetchTicketDetails();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setAssignError(err.response?.data?.error || 'Failed to assign ticket.');
    } finally {
      setAssigning(false);
    }
  };

  const handleReopenTicket = async () => {
    if (!referenceId) return;
    setReopening(true);
    setStatusError(null);
    try {
      await api.reopenTicket(referenceId, reopenReason.trim() || 'Reopened by user');
      setShowReopenInput(false);
      setReopenReason('');
      fetchTicketDetails();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setStatusError(err.response?.data?.error || 'Failed to reopen ticket.');
    } finally {
      setReopening(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Resolved</span>;
      case 'in_progress':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">In Progress</span>;
      case 'waiting_for_user':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">Waiting for User</span>;
      case 'reopened':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">Reopened</span>;
      case 'closed':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-200 text-slate-700 border border-slate-300">Closed</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">Submitted</span>;
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'critical':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">Critical</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">High</span>;
      case 'low':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">Low</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800">Medium</span>;
    }
  };

  const getCategoryBadge = (type: string) => {
    switch (type) {
      case 'bug':
        return <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">🐛 Bug Report</span>;
      case 'feature':
        return <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">💡 Feature Request</span>;
      case 'complaint':
        return <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">⚠️ Complaint</span>;
      case 'support':
        return <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">🎧 Support</span>;
      default:
        return <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">💭 Suggestion</span>;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bg-white w-full max-w-3xl h-full shadow-2xl flex flex-col border-l border-slate-200"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-mono text-sm font-bold bg-blue-100 text-blue-900 px-2.5 py-1 rounded-md">
                    {ticket?.reference_id || referenceId}
                  </span>
                  {ticket?.report_type && getCategoryBadge(ticket.report_type)}
                  {ticket?.severity && getSeverityBadge(ticket.severity)}
                  {ticket?.status && getStatusBadge(ticket.status)}
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  {ticket?.subject || 'Loading Support Ticket...'}
                </h2>
                {ticket?.created_at && (
                  <p className="text-xs text-slate-500 mt-1">
                    Submitted on {new Date(ticket.created_at).toLocaleString()} by{' '}
                    <span className="font-semibold text-slate-700">{ticket.user_name || 'User'}</span>
                    {ticket.user_email && <span className="text-slate-400"> ({ticket.user_email})</span>}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-200 transition-colors text-lg font-bold"
                aria-label="Close detail drawer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
              {loading ? (
                <div className="space-y-4 py-8">
                  <div className="h-6 bg-slate-200 rounded w-3/4 animate-pulse"></div>
                  <div className="h-20 bg-slate-200 rounded w-full animate-pulse"></div>
                </div>
              ) : error ? (
                <div className="alert alert-error bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-xs">
                  {error}
                </div>
              ) : ticket ? (
                <>
                  {/* Initial Report Details */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Initial Description</h3>
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{ticket.description}</p>

                    {ticket.affected_page && (
                      <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center gap-2">
                        <span>Affected Page:</span>
                        <code className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-mono text-[11px]">
                          {ticket.affected_page}
                        </code>
                      </div>
                    )}

                    {ticket.expected_behavior && (
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                        <span className="font-semibold text-slate-700 block">Expected vs Actual Behavior</span>
                        <div className="text-slate-600">Expected: {ticket.expected_behavior}</div>
                        <div className="text-slate-600">Actual: {ticket.actual_behavior}</div>
                      </div>
                    )}
                  </div>

                  {/* Resolution Notes Banner if resolved */}
                  {ticket.status === 'resolved' && ticket.resolution_notes && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-sm text-emerald-800">
                        <span>✓</span> Ticket Resolved
                      </div>
                      <p className="text-emerald-800 leading-relaxed">{ticket.resolution_notes}</p>
                      {ticket.resolved_at && (
                        <div className="text-[11px] text-emerald-600 pt-1">
                          Resolved on {new Date(ticket.resolved_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Attachments List */}
                  {ticket.attachments && ticket.attachments.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3">
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <span>📎 Attached Files ({ticket.attachments.length})</span>
                      </h3>
                      {downloadError && (
                        <div className="alert alert-error bg-red-50 border border-red-200 text-red-800 p-2.5 rounded-lg text-xs">
                          {downloadError}
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {ticket.attachments.map((att: any) => (
                          <div
                            key={att.attachment_id}
                            className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                          >
                            <div className="truncate pr-2">
                              <div className="font-semibold text-slate-800 truncate">{att.filename}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {(att.file_size / (1024 * 1024)).toFixed(2)} MB • {att.mime_type}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDownloadAttachment(att.attachment_id, att.filename, att.mime_type)}
                              disabled={downloadingId === att.attachment_id}
                              className="btn-secondary text-[11px] px-2.5 py-1.5 whitespace-nowrap disabled:opacity-50"
                            >
                              {downloadingId === att.attachment_id ? '⏳ Downloading...' : '⬇ Download'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Conversation Timeline */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Conversation History</h3>
                    {!ticket.messages || ticket.messages.length === 0 ? (
                      <div className="text-center py-6 bg-white rounded-xl border border-slate-200 text-xs text-slate-500">
                        No messages in conversation yet.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {ticket.messages.map((msg: any) => {
                          const isSupport = msg.sender_type === 'support';
                          const isInternal = msg.is_internal;

                          return (
                            <div
                              key={msg.message_id}
                              className={`flex flex-col ${
                                isInternal
                                  ? 'items-stretch'
                                  : isSupport
                                  ? 'items-start'
                                  : 'items-end'
                              }`}
                            >
                              <div
                                className={`max-w-[85%] rounded-2xl p-4 shadow-2xs border text-xs space-y-1.5 ${
                                  isInternal
                                    ? 'bg-amber-50 border-amber-300 text-amber-950 w-full'
                                    : isSupport
                                    ? 'bg-white border-slate-200 text-slate-800'
                                    : 'bg-blue-600 border-blue-600 text-white'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-4 border-b pb-1 mb-1 border-slate-200/40 text-[11px] opacity-80">
                                  <span className="font-bold">
                                    {isInternal ? '🔒 Internal Note' : isSupport ? '🎧 Support Staff' : msg.sender_name || 'User'}
                                  </span>
                                  <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Reopen Action for Resolved Ticket (User View) */}
                  {!isAdmin && ticket.status === 'resolved' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-amber-900">Is your issue still unresolved?</h4>
                          <p className="text-[11px] text-amber-700">You can reopen this ticket within 14 days of resolution.</p>
                        </div>
                        {!showReopenInput && (
                          <button
                            onClick={() => setShowReopenInput(true)}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors"
                          >
                            Reopen Ticket
                          </button>
                        )}
                      </div>

                      {showReopenInput && (
                        <div className="space-y-2 pt-2 border-t border-amber-200">
                          <textarea
                            value={reopenReason}
                            onChange={(e) => setReopenReason(e.target.value)}
                            placeholder="Explain why the issue persists..."
                            rows={2}
                            className="input-field text-xs w-full bg-white"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setShowReopenInput(false)}
                              className="text-xs text-amber-800 hover:text-amber-950 font-medium px-3 py-1"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleReopenTicket}
                              disabled={reopening}
                              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-1.5 rounded-lg text-xs"
                            >
                              {reopening ? 'Reopening...' : 'Confirm Reopen'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Admin Controls (Status Change & Staff Assignment) */}
                  {isAdmin && (
                    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Admin Support Management Controls</h3>

                      {statusError && (
                        <div className="alert alert-error bg-red-50 border border-red-200 text-red-800 p-2.5 rounded-lg text-xs">
                          {statusError}
                        </div>
                      )}
                      {assignError && (
                        <div className="alert alert-error bg-red-50 border border-red-200 text-red-800 p-2.5 rounded-lg text-xs">
                          {assignError}
                        </div>
                      )}

                      {/* Staff Assignment Section */}
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                        <label className="block text-xs font-bold text-slate-800">
                          Assign Support Staff
                        </label>
                        <div className="flex items-center gap-2">
                          <select
                            value={assignedTo}
                            onChange={(e) => setAssignedTo(e.target.value)}
                            className="flex-1 input-field text-xs py-2 bg-white border border-slate-300 rounded-lg"
                          >
                            <option value="">-- Select Staff Member --</option>
                            {usersList.map((u: any) => (
                              <option key={u.user_id} value={u.user_id}>
                                {u.full_name || u.username || u.email} ({u.role || 'user'})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={handleAssignTicket}
                            disabled={assigning || !assignedTo}
                            className="btn-secondary text-xs px-4 py-2 disabled:opacity-50"
                          >
                            {assigning ? 'Assigning...' : 'Assign Staff'}
                          </button>
                        </div>
                        {ticket.assigned_to_name && (
                          <div className="text-[11px] text-slate-600 pt-1">
                            Currently Assigned to: <span className="font-semibold text-slate-900">{ticket.assigned_to_name}</span> ({ticket.assigned_to_email || 'N/A'})
                          </div>
                        )}
                      </div>

                      {/* Status Transition Section */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Update Status</label>
                          <select
                            value={targetStatus}
                            onChange={(e) => setTargetStatus(e.target.value)}
                            className="w-full input-field text-xs py-2 bg-white border border-slate-300 rounded-lg"
                          >
                            <option value="submitted">Submitted</option>
                            <option value="under_review">Under Review</option>
                            <option value="in_progress">In Progress</option>
                            <option value="waiting_for_user">Waiting for User</option>
                            <option value="resolved">Resolved</option>
                            <option value="reopened">Reopened</option>
                            <option value="closed">Closed</option>
                          </select>
                        </div>
                        {targetStatus === 'resolved' && (
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Mandatory Resolution Summary <span className="text-red-500">*</span>
                            </label>
                            <textarea
                              value={resolutionNotes}
                              onChange={(e) => setResolutionNotes(e.target.value)}
                              placeholder="Explain how the issue was resolved..."
                              rows={2}
                              className="input-field text-xs w-full"
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={handleStatusUpdate}
                          disabled={statusUpdating}
                          className="btn-primary text-xs px-5 py-2"
                        >
                          {statusUpdating ? 'Saving...' : 'Apply Status Change'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Reply / Internal Note Composer */}
                  {ticket.status !== 'closed' && (
                    <form onSubmit={handleSendReply} className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <span>Post Message</span>
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isInternalNote}
                                onChange={(e) => setIsInternalNote(e.target.checked)}
                                className="rounded text-blue-600 focus:ring-blue-500"
                              />
                              <span>Internal Staff Note Only</span>
                            </label>
                          </div>
                        )}
                      </div>

                      {replyError && (
                        <div className="alert alert-error bg-red-50 border border-red-200 text-red-800 p-2.5 rounded-lg text-xs">
                          {replyError}
                        </div>
                      )}

                      <textarea
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder={
                          isInternalNote
                            ? 'Type internal note (visible only to support team)...'
                            : 'Type your reply message here...'
                        }
                        rows={3}
                        className="input-field text-xs w-full"
                        required
                      />

                      {/* Reply Attachment File Input (P1 Requirement) */}
                      <div className="pt-2 border-t border-slate-100">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Attach Supporting File (Optional)
                        </label>
                        {selectedReplyFile ? (
                          <div className="flex items-center justify-between p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs">
                            <div className="flex items-center gap-2 truncate">
                              <span>📎</span>
                              <span className="font-semibold text-slate-800 truncate">{selectedReplyFile.name}</span>
                              <span className="text-slate-500 font-mono">({(selectedReplyFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedReplyFile(null);
                                setReplyFileError(null);
                              }}
                              className="text-rose-600 hover:text-rose-800 font-bold px-2 py-0.5 rounded hover:bg-rose-50 transition-colors text-[11px]"
                            >
                              ✕ Remove
                            </button>
                          </div>
                        ) : (
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,application/pdf"
                            onChange={handleReplyFileChange}
                            className="block w-full text-[11px] text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[11px] file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                          />
                        )}
                        {replyFileError && (
                          <p className="text-[11px] text-rose-600 mt-1">{replyFileError}</p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-0.5">Formats: PNG, JPEG, WEBP, PDF (Max 5 MB)</p>
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          type="submit"
                          disabled={sending}
                          className={`btn-primary text-xs px-6 py-2 ${
                            isInternalNote ? 'bg-amber-600 hover:bg-amber-700 border-amber-600' : ''
                          }`}
                        >
                          {sending ? 'Posting Message...' : isInternalNote ? 'Save Internal Note' : 'Send Reply'}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              ) : null}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
