import React, { useState, useEffect } from 'react';
import * as api from '../services/api';

export interface AuditReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  teamName: string;
}

export const AuditReportModal: React.FC<AuditReportModalProps> = ({
  isOpen,
  onClose,
  teamId,
  teamName,
}) => {
  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  useEffect(() => {
    if (isOpen && teamId) {
      loadReport();
    }
  }, [isOpen, teamId]);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAuditReport(teamId);
      setReport(res.data.data);
    } catch (err: any) {
      console.error('Failed to load audit report:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load audit report');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCsv = async () => {
    setIsExportingCsv(true);
    try {
      await api.downloadAuditReportCsv(teamId, teamName);
    } catch (err) {
      console.error('CSV export failed:', err);
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const summary = report?.summary;
  const context = report?.context;
  const teams = report?.teams || [];
  const blockers = report?.blockers || [];

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto print:bg-white print:static print:inset-auto print:p-0 print:block print:overflow-visible print:z-auto"
      data-testid="audit-report-modal"
    >
      <style>{`
        @media print {
          @page {
            margin: 10mm 12mm 10mm 12mm;
            size: A4 portrait;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          body {
            background: white !important;
            color: #111827 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden;
          }
          [data-testid="audit-report-modal"],
          [data-testid="audit-report-modal"] * {
            visibility: visible;
          }
          [data-testid="audit-report-modal"] {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
          }
          aside, nav, header, [role="navigation"], .no-print {
            display: none !important;
          }
          thead {
            display: table-header-group;
          }
          tr {
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className="bg-white border border-gray-200 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden print:max-h-none print:shadow-none print:border-none print:rounded-none">
        {/* Modal Header & Action Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 p-4 sm:p-5 bg-slate-50/70 gap-3.5 print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📋</span>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Audit & Activity Report Exporter
              </h2>
              <p className="text-xs text-gray-500">
                Compliance, sprint velocity, and blocker governance audit for {teamName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end w-full sm:w-auto">
            <button
              onClick={handleDownloadCsv}
              disabled={loading || isExportingCsv}
              className="flex-1 sm:flex-initial px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              data-testid="download-csv-btn"
            >
              <span>📊</span>
              <span>{isExportingCsv ? 'Exporting...' : 'Export CSV'}</span>
            </button>

            <button
              onClick={handlePrint}
              disabled={loading}
              className="flex-1 sm:flex-initial px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs shadow-indigo-600/20 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              data-testid="print-report-btn"
            >
              <span>🖨️</span>
              <span>Print / PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors ml-1"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content / Printable Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 print:p-0 print:overflow-visible">
          {loading ? (
            <div className="py-16 text-center text-gray-500 space-y-3" data-testid="report-loading">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-medium">Compiling audit metrics and blocker history...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
              Failed to generate audit report: {error}
            </div>
          ) : report ? (
            <div className="space-y-6" data-testid="report-content">
              {/* Document Header (Print Header) */}
              <div className="border-b border-gray-200 pb-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                      CommandCenter • Governance & Activity Audit
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight mt-1">
                      {context?.team_name || teamName}
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                      Scope: {context?.team_type === 'classroom' ? 'Classroom Multi-Team Context' : 'Team Workspace'} • Generated: {new Date(context?.generated_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <span className="font-semibold text-gray-700 block">Auditor:</span>
                    <span>{context?.generated_by || 'Coordinator'}</span>
                  </div>
                </div>
              </div>

              {/* Executive Summary Metrics */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                  Executive KPI Overview
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 border border-gray-200 rounded-xl p-3.5">
                    <div className="text-[10px] uppercase font-bold text-gray-500">Sub-Teams</div>
                    <div className="text-xl font-black text-gray-900 mt-0.5">{summary?.total_teams || 0}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {summary?.healthy_teams_count || 0} healthy • {summary?.at_risk_teams_count || 0} at risk
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-gray-200 rounded-xl p-3.5">
                    <div className="text-[10px] uppercase font-bold text-gray-500">Class Progress</div>
                    <div className="text-xl font-black text-indigo-600 mt-0.5">{summary?.completion_rate || 0}%</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {summary?.completed_tasks || 0} / {summary?.total_tasks || 0} tasks done
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-gray-200 rounded-xl p-3.5">
                    <div className="text-[10px] uppercase font-bold text-gray-500">Weekly Velocity</div>
                    <div className="text-xl font-black text-emerald-600 mt-0.5">{summary?.average_velocity || 0}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {summary?.total_tasks_completed_this_week || 0} tasks closed in 7d
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-gray-200 rounded-xl p-3.5">
                    <div className="text-[10px] uppercase font-bold text-gray-500">Blockers Health</div>
                    <div className="text-xl font-black text-rose-600 mt-0.5">{summary?.open_blockers || 0} Open</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {summary?.resolved_blockers || 0} successfully resolved
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub-Teams Telemetry & Sprint Burndown Table */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                  Sub-Teams Sprint Progress & Health
                </h3>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-gray-700 font-bold uppercase text-[10px] border-b border-gray-200">
                        <th className="py-2.5 px-3">Sub-Team</th>
                        <th className="py-2.5 px-3">Health</th>
                        <th className="py-2.5 px-3">Velocity</th>
                        <th className="py-2.5 px-3">Task Completion</th>
                        <th className="py-2.5 px-3 text-center">Standup</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {teams.map((t: any) => {
                        const comp = t.task_progress?.completed ?? 0;
                        const tot = t.task_progress?.total ?? 0;
                        const pct = t.task_progress?.percent ?? 0;
                        return (
                          <tr key={t.team_id}>
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-gray-900">{t.team_name}</span>
                              <span className="text-[10px] text-gray-500 ml-1.5">({t.member_count} members)</span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${
                                t.health?.status === 'AT_RISK'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : t.health?.status === 'NEEDS_ATTENTION'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}>
                                {t.health?.status || 'HEALTHY'} ({t.health?.score || 100}%)
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-semibold text-gray-700">{t.velocity?.label || 'IDLE'}</span>
                              <span className="text-[10px] text-gray-500 ml-1">({t.velocity?.completed_this_week || 0}/wk)</span>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-20 bg-gray-200 h-2 rounded-full overflow-hidden">
                                  <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="font-mono text-[11px] text-gray-700 font-semibold">{comp}/{tot} ({pct}%)</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                t.submitted_today ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {t.submitted_today ? 'Submitted' : 'Pending'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Institutional Blockers Audit Log */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                  Institutional Blockers & Risk History ({blockers.length})
                </h3>
                {blockers.length === 0 ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 font-medium">
                    <span>✅</span>
                    <span>No active or unresolved blockers on record across any teams.</span>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-gray-700 font-bold uppercase text-[10px] border-b border-gray-200">
                          <th className="py-2.5 px-3">Severity</th>
                          <th className="py-2.5 px-3">Sub-Team</th>
                          <th className="py-2.5 px-3">Description</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Reported</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {blockers.map((b: any) => (
                          <tr key={b.blocker_id}>
                            <td className="py-2.5 px-3">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                b.severity === 'critical' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {b.severity}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-gray-900">{b.team_name}</td>
                            <td className="py-2.5 px-3 text-gray-700">{b.description}</td>
                            <td className="py-2.5 px-3">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize ${
                                b.status === 'resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {b.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-gray-500 font-mono text-[10px]">
                              {b.created_at ? new Date(b.created_at).toLocaleDateString() : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Privacy & Governance Footer Notice */}
              <div className="border-t border-gray-200 pt-4 text-[10px] text-gray-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span>
                  CommandCenter Governance Engine • Factual Work Transparency with Encapsulation
                </span>
                <span>
                  Strict Privacy Enforced: No surveillance metrics or private member chat logs.
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AuditReportModal;
