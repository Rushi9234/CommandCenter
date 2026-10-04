import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import * as api from '../services/api';
import TicketDetailDrawer from '../components/TicketDetailDrawer';

export interface FeedbackRecord {
  reference_id: string;
  user_id: string;
  report_type: 'bug' | 'complaint' | 'feature' | 'suggestion' | 'support';
  subject: string;
  description: string;
  affected_page?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'submitted' | 'under_review' | 'in_progress' | 'waiting_for_user' | 'resolved' | 'reopened' | 'closed';
  delivery_status?: 'email_delivered' | 'saved_locally' | 'delivery_failed';
  created_at: string;
}

export default function MyFeedback() {
  const [searchParams, setSearchParams] = useSearchParams();
  const ticketParam = searchParams.get('ticket');

  const [reports, setReports] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter & Search state
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'waiting' | 'resolved' | 'closed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRefId, setSelectedRefId] = useState<string | null>(ticketParam);

  useEffect(() => {
    if (ticketParam) {
      setSelectedRefId(ticketParam);
    }
  }, [ticketParam]);

  const handleOpenTicket = (refId: string) => {
    setSelectedRefId(refId);
    setSearchParams({ ticket: refId }, { replace: true });
  };

  const handleCloseDrawer = () => {
    setSelectedRefId(null);
    if (searchParams.has('ticket')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('ticket');
      setSearchParams(nextParams, { replace: true });
    }
  };

  const fetchMyFeedback = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getMyFeedback();
      if (res.data?.data) {
        setReports(res.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load your support reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyFeedback();
  }, []);

  const handleCopy = (refId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(refId);
    setCopiedId(refId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Resolved</span>;
      case 'in_progress':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">In Progress</span>;
      case 'waiting_for_user':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">Waiting for Me</span>;
      case 'reopened':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">Reopened</span>;
      case 'closed':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700 border border-slate-300">Closed</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">Submitted</span>;
    }
  };

  const getDeliveryBadge = (status?: string) => {
    switch (status) {
      case 'email_delivered':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">📧 Email Delivered</span>;
      case 'delivery_failed':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">⚠️ Email Failed</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">💾 Saved Locally</span>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'bug':
        return <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">🐛 Bug</span>;
      case 'feature':
        return <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">💡 Feature</span>;
      case 'complaint':
        return <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">⚠️ Complaint</span>;
      case 'support':
        return <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">🎧 Support</span>;
      default:
        return <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">💭 Suggestion</span>;
    }
  };

  // Filter & Search Logic
  const filteredReports = reports.filter((report) => {
    // Status Filter
    if (statusFilter === 'open' && !['submitted', 'under_review', 'in_progress', 'reopened'].includes(report.status)) {
      return false;
    }
    if (statusFilter === 'waiting' && report.status !== 'waiting_for_user') {
      return false;
    }
    if (statusFilter === 'resolved' && report.status !== 'resolved') {
      return false;
    }
    if (statusFilter === 'closed' && report.status !== 'closed') {
      return false;
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSub = report.subject.toLowerCase().includes(q);
      const matchRef = report.reference_id.toLowerCase().includes(q);
      const matchDesc = report.description.toLowerCase().includes(q);
      return matchSub || matchRef || matchDesc;
    }

    return true;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">My Support & Feedback Reports</h1>
          <p className="text-xs text-slate-600 mt-1">
            Track the status of bug reports, feature suggestions, and support requests you have submitted.
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All ({reports.length})
          </button>
          <button
            onClick={() => setStatusFilter('open')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'open'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Open ({reports.filter((r) => ['submitted', 'under_review', 'in_progress', 'reopened'].includes(r.status)).length})
          </button>
          <button
            onClick={() => setStatusFilter('waiting')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'waiting'
                ? 'bg-amber-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Waiting for Me ({reports.filter((r) => r.status === 'waiting_for_user').length})
          </button>
          <button
            onClick={() => setStatusFilter('resolved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'resolved'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Resolved ({reports.filter((r) => r.status === 'resolved').length})
          </button>
          <button
            onClick={() => setStatusFilter('closed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'closed'
                ? 'bg-slate-700 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Closed ({reports.filter((r) => r.status === 'closed').length})
          </button>
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets by subject or ID..."
            className="input-field text-xs w-full py-1.5 bg-slate-50"
          />
        </div>
      </div>

      {error && (
        <div className="alert alert-error bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* Ticket List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="pro-card p-4 animate-pulse space-y-2">
              <div className="h-4 bg-slate-200 rounded w-1/4"></div>
              <div className="h-5 bg-slate-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
          <div className="text-4xl">📥</div>
          <h3 className="text-lg font-bold text-slate-900">No submitted reports found</h3>
          <p className="text-xs text-slate-500">
            {searchQuery || statusFilter !== 'all'
              ? 'No tickets match the selected filter criteria.'
              : 'You have not submitted any support tickets or feedback reports yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReports.map((report) => (
            <motion.div
              key={report.reference_id}
              whileHover={{ y: -2 }}
              onClick={() => handleOpenTicket(report.reference_id)}
              className="pro-card p-5 border border-slate-200 hover:border-blue-400 transition-all shadow-xs space-y-3 cursor-pointer group bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2 py-1 rounded">
                    {report.reference_id}
                  </span>
                  <button
                    onClick={(e) => handleCopy(report.reference_id, e)}
                    className="text-xs text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition-colors"
                    title="Copy Reference ID"
                  >
                    {copiedId === report.reference_id ? '✓ Copied' : '📋 Copy'}
                  </button>
                  {getTypeBadge(report.report_type)}
                  {getDeliveryBadge(report.delivery_status)}
                </div>
                <div>{getStatusBadge(report.status)}</div>
              </div>

              <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                {report.subject}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{report.description}</p>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                <div>Submitted on {new Date(report.created_at).toLocaleDateString()}</div>
                <div className="flex items-center gap-3">
                  {report.affected_page && (
                    <div>
                      Page: <span className="font-mono text-slate-600">{report.affected_page}</span>
                    </div>
                  )}
                  <span className="text-blue-600 font-semibold text-xs group-hover:underline">
                    View Conversation & Details →
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Ticket Detail Drawer */}
      <TicketDetailDrawer
        referenceId={selectedRefId}
        isOpen={!!selectedRefId}
        onClose={handleCloseDrawer}
        isAdmin={false}
        onUpdated={fetchMyFeedback}
      />
    </div>
  );
}
