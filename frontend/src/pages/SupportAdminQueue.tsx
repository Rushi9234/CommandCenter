import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../services/api';
import TicketDetailDrawer from '../components/TicketDetailDrawer';

export interface AdminTicketRecord {
  reference_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  report_type: 'bug' | 'complaint' | 'feature' | 'suggestion' | 'support';
  subject: string;
  description: string;
  affected_page?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'submitted' | 'under_review' | 'in_progress' | 'waiting_for_user' | 'resolved' | 'reopened' | 'closed';
  delivery_status?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  created_at: string;
  updated_at: string;
}

export default function SupportAdminQueue() {
  const [searchParams, setSearchParams] = useSearchParams();
  const ticketParam = searchParams.get('ticket');

  const [tickets, setTickets] = useState<AdminTicketRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search state
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('');
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

  const fetchAdminTickets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminTickets({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        severity: severityFilter || undefined,
        search: searchQuery || undefined,
        limit: 50,
      });
      if (res.data?.data) {
        setTickets(res.data.data);
        setTotalCount(res.data.total || res.data.data.length);
        if (!ticketParam && !selectedRefId && res.data.data.length > 0) {
          setSelectedRefId(res.data.data[0].reference_id);
        }
      }
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError('Access Denied: Support Administrator privileges are required to access this queue.');
      } else {
        setError(err.response?.data?.error || 'Failed to load support admin queue.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminTickets();
  }, [statusFilter, severityFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAdminTickets();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">Resolved</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800">In Progress</span>;
      case 'waiting_for_user':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">Waiting for User</span>;
      case 'reopened':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800">Reopened</span>;
      case 'closed':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-700">Closed</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">New</span>;
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'critical':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">Critical</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">High</span>;
      case 'low':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">Low</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">Medium</span>;
    }
  };

  const getCategoryBadge = (type: string) => {
    switch (type) {
      case 'bug':
        return <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">Bug Report</span>;
      case 'feature':
        return <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">Feature Request</span>;
      case 'complaint':
        return <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Complaint</span>;
      case 'support':
        return <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">Support</span>;
      default:
        return <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">Suggestion</span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
            Admin / Support Queue
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Support Tickets</h1>
          <p className="text-xs text-slate-600 mt-1">
            Manage user feedback, issue reports, and support requests across the platform.
          </p>
        </div>
      </div>

      {/* Filter Tabs Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setStatusFilter('submitted')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'submitted' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            New
          </button>
          <button
            onClick={() => setStatusFilter('in_progress')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'in_progress' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            In Progress
          </button>
          <button
            onClick={() => setStatusFilter('waiting_for_user')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'waiting_for_user' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Waiting for User
          </button>
          <button
            onClick={() => setStatusFilter('resolved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'resolved' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Resolved
          </button>
          <button
            onClick={() => setStatusFilter('reopened')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'reopened' ? 'bg-purple-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Reopened
          </button>
          <button
            onClick={() => setStatusFilter('closed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'closed' ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Closed
          </button>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="input-field text-xs py-1.5 bg-slate-50 border border-slate-300 rounded-lg"
          >
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ticket ID, subject, or description..."
            className="input-field text-xs w-64 py-1.5 bg-slate-50"
          />
          <button type="submit" className="btn-secondary text-xs px-3 py-1.5">
            Search
          </button>
        </form>
      </div>

      {error && error.includes('Access Denied') ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-red-200 p-8 space-y-4 max-w-lg mx-auto my-6 shadow-sm">
          <div className="text-4xl">🔒</div>
          <h3 className="text-xl font-bold text-slate-900">Access Restricted</h3>
          <p className="text-xs text-slate-600 leading-relaxed">{error}</p>
          <div className="pt-2">
            <a href="/pulse" className="btn-primary text-xs px-4 py-2 inline-block">
              Return to Dashboard
            </a>
          </div>
        </div>
      ) : error ? (
        <div className="alert alert-error bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-xs">
          {error}
        </div>
      ) : null}

      {/* Main Grid View */}
      {loading ? (
        <div className="space-y-3 py-6">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="pro-card p-4 animate-pulse h-16 bg-slate-200 rounded-xl"></div>
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
          <div className="text-4xl">📥</div>
          <h3 className="text-lg font-bold text-slate-900">No support tickets found</h3>
          <p className="text-xs text-slate-500">There are no tickets matching the current filter parameters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ticket List Panel */}
          <div className="lg:col-span-1 space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            {tickets.map((ticket) => (
              <div
                key={ticket.reference_id}
                onClick={() => handleOpenTicket(ticket.reference_id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                  selectedRefId === ticket.reference_id
                    ? 'bg-blue-50/70 border-blue-500 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-slate-900">{ticket.reference_id}</span>
                  <div>{getStatusBadge(ticket.status)}</div>
                </div>

                <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{ticket.subject}</h4>

                <div className="flex flex-wrap items-center gap-1.5">
                  {getCategoryBadge(ticket.report_type)}
                  {getSeverityBadge(ticket.severity)}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-medium text-slate-700">{ticket.user_name || 'Reporter'}</span>
                  <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Ticket Details Panel / Drawer Trigger */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-2xs flex flex-col justify-between">
            {selectedRefId ? (
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <div>
                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {selectedRefId}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 mt-1">
                      {tickets.find((t) => t.reference_id === selectedRefId)?.subject}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedRefId(selectedRefId)}
                    className="btn-primary text-xs px-4 py-2"
                  >
                    Open Full Support Thread & Management Drawer →
                  </button>
                </div>

                <div className="py-6 space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-800 space-y-2">
                    <div className="font-semibold text-slate-900 uppercase text-[10px] text-slate-500 tracking-wider">
                      Initial Complaint Description
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {tickets.find((t) => t.reference_id === selectedRefId)?.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-slate-600 pt-2">
                    <div>Reporter: <span className="font-semibold text-slate-800">{tickets.find((t) => t.reference_id === selectedRefId)?.user_name || 'User'}</span></div>
                    <div>Severity: <span className="font-semibold text-slate-800">{tickets.find((t) => t.reference_id === selectedRefId)?.severity}</span></div>
                    <div>Page: <code className="bg-slate-100 font-mono text-[11px] px-1.5 py-0.5 rounded">{tickets.find((t) => t.reference_id === selectedRefId)?.affected_page || 'N/A'}</code></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-slate-400 text-xs">
                Select a support ticket from the queue list on the left to review conversation details.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ticket Detail Drawer with Admin Controls */}
      <TicketDetailDrawer
        referenceId={selectedRefId}
        isOpen={!!selectedRefId}
        onClose={handleCloseDrawer}
        isAdmin={true}
        onUpdated={fetchAdminTickets}
      />
    </div>
  );
}
