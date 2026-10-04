import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../services/api';
import TicketDetailDrawer from '../components/TicketDetailDrawer';
import { formatRelativeTime } from '../utils/dateUtils';

interface PlatformKPIs {
  total_users: number;
  active_users_24h: number;
  active_users_7d: number;
  active_users_30d: number;
  total_classes: number;
  total_teams: number;
  personal_teams: number;
  class_associated_teams: number;
  total_projects: number;
  solo_projects: number;
  team_projects: number;
  class_linked_projects: number;
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  overdue_tasks: number;
}

interface TrendPoint {
  date: string;
  count?: number;
  created?: number;
  completed?: number;
  resolved?: number;
  pending?: number;
  reopened?: number;
  registrations?: number;
  active?: number;
}

interface PlatformAnalyticsData {
  kpis: PlatformKPIs;
  trends: {
    teams_created: TrendPoint[];
    classes_created: TrendPoint[];
    projects_created: TrendPoint[];
    task_activity: TrendPoint[];
    user_registrations: TrendPoint[];
    support_tickets: TrendPoint[];
  };
  breakdowns: {
    team_types: { personal: number; class_associated: number; classroom_containers: number };
    project_types: { solo: number; team: number; class_linked: number };
    task_statuses: { done: number; in_progress: number; review: number; todo: number };
  };
}

export default function AdminDashboard() {
  const [platformData, setPlatformData] = useState<PlatformAnalyticsData | null>(null);
  const [recentTickets, setRecentTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Period controls
  const [period, setPeriod] = useState<string>('30days');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Drawer
  const [selectedTicketRef, setSelectedTicketRef] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);

    const params: any = { period };
    if (period === 'custom' && startDate && endDate) {
      params.startDate = startDate;
      params.endDate = endDate;
    }

    try {
      const analyticsRes = await api.getPlatformAnalytics(params);
      if (analyticsRes.data?.data) {
        setPlatformData(analyticsRes.data.data);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to load platform-wide admin analytics. Please check authorization or server state.';
      setError(errMsg);
      setPlatformData(null);
    }

    try {
      const ticketsRes = await api.getAdminTickets({ limit: 5 });
      if (ticketsRes.data?.data) {
        setRecentTickets(ticketsRes.data.data);
      }
    } catch (err) {
      console.error('Non-critical support queue fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [period]);

  const handleCustomDateApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (startDate && endDate) {
      fetchDashboardData();
    }
  };

  const kpis = platformData?.kpis;
  const trends = platformData?.trends;

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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
            Global Admin Platform Analytics
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Platform-Wide Overview</h1>
          <p className="text-xs text-slate-600 mt-1">
            Realtime database analytics across users, classes, teams, projects, tasks, and support tickets.
          </p>
        </div>

        {/* Analytics Controls (Part E) */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 px-3 py-2 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="7days">📅 Last 7 days</option>
            <option value="30days">📅 Last 30 days</option>
            <option value="90days">📅 Last 90 days</option>
            <option value="12months">📅 Last 12 months</option>
            <option value="custom">📅 Custom Date Range</option>
          </select>

          {period === 'custom' && (
            <form onSubmit={handleCustomDateApply} className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg text-xs p-1.5 shadow-2xs"
                required
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg text-xs p-1.5 shadow-2xs"
                required
              />
              <button
                type="submit"
                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Apply
              </button>
            </form>
          )}

          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-blue-600 bg-white border border-slate-200 hover:border-blue-300 rounded-lg shadow-2xs transition-all flex items-center gap-1 text-xs font-semibold"
            title="Refresh Platform Analytics"
          >
            <span className={loading ? 'animate-spin' : ''}>🔄</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Explicit Error State Banner (Safeguard) */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-xs flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span className="font-medium">{error}</span>
          </div>
          <button onClick={fetchDashboardData} className="px-3 py-1 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 transition-colors">
            Retry Request
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-28 bg-slate-200 rounded-xl"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="h-64 bg-slate-200 rounded-xl lg:col-span-2"></div>
            <div className="h-64 bg-slate-200 rounded-xl"></div>
          </div>
        </div>
      ) : kpis ? (
        <>
          {/* Part C — Platform-Wide KPI Cards (Row 1: Users, Active Users, Classes, Teams) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Users</span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                  👥
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">{kpis.total_users}</div>
              <div className="text-[11px] text-slate-500 font-medium">
                Verified platform accounts
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Users (24h / 7d / 30d)</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm">
                  ⚡
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">{kpis.active_users_24h}</div>
              <div className="text-[11px] text-emerald-600 font-medium">
                7d: {kpis.active_users_7d} • 30d: {kpis.active_users_30d} active users
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Classes</span>
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-sm">
                  🎓
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">{kpis.total_classes}</div>
              <div className="text-[11px] text-purple-600 font-medium">
                Educational classroom containers
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Teams</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm">
                  🏢
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">{kpis.total_teams}</div>
              <div className="text-[11px] text-slate-500 font-medium">
                {kpis.personal_teams} Personal • {kpis.class_associated_teams} Class-linked
              </div>
            </div>
          </div>

          {/* Part C — KPI Cards (Row 2: Projects & Tasks Breakdown) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Projects</span>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm">
                  📁
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">{kpis.total_projects}</div>
              <div className="text-[11px] text-indigo-600 font-medium">
                {kpis.solo_projects} Solo • {kpis.team_projects} Team • {kpis.class_linked_projects} Class
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Tasks</span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                  ✅
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">{kpis.total_tasks}</div>
              <div className="text-[11px] text-blue-600 font-medium">
                {kpis.completed_tasks} Completed • {kpis.pending_tasks} Pending
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">In Progress & Review</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm">
                  🔄
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">{kpis.in_progress_tasks}</div>
              <div className="text-[11px] text-amber-600 font-medium">
                Active work & peer review tasks
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Overdue Tasks</span>
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-sm">
                  ⏰
                </div>
              </div>
              <div className="text-2xl font-extrabold text-rose-600">{kpis.overdue_tasks}</div>
              <div className="text-[11px] text-rose-600 font-medium">
                Requires immediate instructor review
              </div>
            </div>
          </div>

          {/* Part D — Rich Visual Analytics Charts (Middle Section) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 1. Team & Project Category Breakdowns */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-3">
                Team & Project Category Breakdown
              </h3>
              
              <div className="space-y-4">
                {/* Personal vs Class-Associated Teams Bar Comparison */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span>Teams Distribution</span>
                    <span className="text-slate-500 font-normal">Total: {kpis.total_teams}</span>
                  </div>
                  <div className="space-y-1.5">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                        <span>Personal Teams</span>
                        <span className="font-bold">{kpis.personal_teams}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-amber-500 h-full rounded-full"
                          style={{ width: `${kpis.total_teams > 0 ? (kpis.personal_teams / kpis.total_teams) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                        <span>Class-Associated Teams</span>
                        <span className="font-bold">{kpis.class_associated_teams}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-500 h-full rounded-full"
                          style={{ width: `${kpis.total_teams > 0 ? (kpis.class_associated_teams / kpis.total_teams) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                        <span>Classroom Containers</span>
                        <span className="font-bold">{kpis.total_classes}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-purple-500 h-full rounded-full"
                          style={{ width: `${kpis.total_teams > 0 ? (kpis.total_classes / kpis.total_teams) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Solo vs Team Projects Comparison */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span>Projects Distribution</span>
                    <span className="text-slate-500 font-normal">Total: {kpis.total_projects}</span>
                  </div>
                  <div className="space-y-1.5">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                        <span>Solo Projects</span>
                        <span className="font-bold">{kpis.solo_projects}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full"
                          style={{ width: `${kpis.total_projects > 0 ? (kpis.solo_projects / kpis.total_projects) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                        <span>Team Projects</span>
                        <span className="font-bold">{kpis.team_projects}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-full"
                          style={{ width: `${kpis.total_projects > 0 ? (kpis.team_projects / kpis.total_projects) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Task Creation vs Completion Trend Chart */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Task Creation vs Completion Trend</h3>
                  <p className="text-[11px] text-slate-500">Daily tasks created vs completed over selected period.</p>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-semibold">
                  <span className="flex items-center gap-1 text-blue-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span> Created
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Completed
                  </span>
                </div>
              </div>

              {trends?.task_activity && trends.task_activity.length > 0 ? (
                <div className="h-48 w-full flex items-end gap-1.5 pt-4 pb-2 border-b border-slate-100">
                  {trends.task_activity.map((pt, idx) => {
                    const maxVal = Math.max(
                      ...trends.task_activity.map((t) => Math.max(t.created || 0, t.completed || 0)),
                      5
                    );
                    const createdH = Math.min(100, Math.max(10, ((pt.created || 0) / maxVal) * 100));
                    const completedH = Math.min(100, Math.max(10, ((pt.completed || 0) / maxVal) * 100));

                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div className="w-full flex items-end justify-center gap-0.5 h-40">
                          <div
                            style={{ height: `${createdH}%` }}
                            className="w-2 bg-blue-500 rounded-t transition-all group-hover:bg-blue-600"
                          ></div>
                          <div
                            style={{ height: `${completedH}%` }}
                            className="w-2 bg-emerald-500 rounded-t transition-all group-hover:bg-emerald-600"
                          ></div>
                        </div>
                        {idx % Math.ceil(trends.task_activity.length / 8) === 0 && (
                          <span className="text-[9px] text-slate-400 font-mono truncate w-full text-center">
                            {pt.date.slice(5)}
                          </span>
                        )}
                        {/* Interactive Tooltip (Part E) */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col bg-slate-900 text-white text-[10px] p-1.5 rounded shadow-lg z-20 whitespace-nowrap">
                          <span>{pt.date}</span>
                          <span>Created: {pt.created || 0} • Completed: {pt.completed || 0}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-xs text-slate-400">
                  No task activity trends recorded for selected timeframe.
                </div>
              )}
            </div>
          </div>

          {/* Part D — User Engagement & Support Ticket Trends (Row 4) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* User Registration & Active Engagement Trend */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-bold text-slate-900">User Registrations Over Time</h3>
                <span className="text-xs font-semibold text-slate-500">Period: {period}</span>
              </div>

              {trends?.user_registrations && trends.user_registrations.length > 0 ? (
                <div className="h-44 w-full flex items-end gap-1.5 pt-4 pb-2 border-b border-slate-100">
                  {trends.user_registrations.map((pt, idx) => {
                    const maxVal = Math.max(...trends.user_registrations.map((t) => t.registrations || 0), 4);
                    const h = Math.min(100, Math.max(10, ((pt.registrations || 0) / maxVal) * 100));

                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div className="w-full flex items-end justify-center h-36">
                          <div
                            style={{ height: `${h}%` }}
                            className="w-3 bg-purple-500 rounded-t transition-all group-hover:bg-purple-600"
                          ></div>
                        </div>
                        {idx % Math.ceil(trends.user_registrations.length / 8) === 0 && (
                          <span className="text-[9px] text-slate-400 font-mono truncate w-full text-center">
                            {pt.date.slice(5)}
                          </span>
                        )}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col bg-slate-900 text-white text-[10px] p-1.5 rounded shadow-lg z-20 whitespace-nowrap">
                          <span>{pt.date}</span>
                          <span>New Users: {pt.registrations || 0}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-44 flex items-center justify-center text-xs text-slate-400">
                  No registration data available for this timeframe.
                </div>
              )}
            </div>

            {/* Support Ticket Trends */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Support Ticket Trends</h3>
                <div className="flex items-center gap-2 text-[10px] font-semibold">
                  <span className="text-blue-600">● Created</span>
                  <span className="text-emerald-600">● Resolved</span>
                  <span className="text-purple-600">● Reopened</span>
                </div>
              </div>

              {trends?.support_tickets && trends.support_tickets.length > 0 ? (
                <div className="h-44 w-full flex items-end gap-1.5 pt-4 pb-2 border-b border-slate-100">
                  {trends.support_tickets.map((pt, idx) => {
                    const maxVal = Math.max(
                      ...trends.support_tickets.map((t) => Math.max(t.created || 0, t.resolved || 0)),
                      4
                    );
                    const createdH = Math.min(100, Math.max(10, ((pt.created || 0) / maxVal) * 100));
                    const resolvedH = Math.min(100, Math.max(10, ((pt.resolved || 0) / maxVal) * 100));

                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div className="w-full flex items-end justify-center gap-0.5 h-36">
                          <div style={{ height: `${createdH}%` }} className="w-2 bg-blue-500 rounded-t"></div>
                          <div style={{ height: `${resolvedH}%` }} className="w-2 bg-emerald-500 rounded-t"></div>
                        </div>
                        {idx % Math.ceil(trends.support_tickets.length / 8) === 0 && (
                          <span className="text-[9px] text-slate-400 font-mono truncate w-full text-center">
                            {pt.date.slice(5)}
                          </span>
                        )}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col bg-slate-900 text-white text-[10px] p-1.5 rounded shadow-lg z-20 whitespace-nowrap">
                          <span>{pt.date}</span>
                          <span>Created: {pt.created || 0} • Resolved: {pt.resolved || 0}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-44 flex items-center justify-center text-xs text-slate-400">
                  No support ticket activity recorded for this timeframe.
                </div>
              )}
            </div>
          </div>

          {/* Row 5: Recent Tickets Queue Table & Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Recent Support Queue</h3>
                  <p className="text-[11px] text-slate-500">Click any row to open ticket detail drawer.</p>
                </div>
                <Link to="/admin/tickets" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                  View Full Support Queue →
                </Link>
              </div>

              {recentTickets.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No support tickets found in system.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-semibold text-[11px]">
                        <th className="py-2.5 px-3">Ref ID</th>
                        <th className="py-2.5 px-3">Subject</th>
                        <th className="py-2.5 px-3">Priority</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Reporter</th>
                        <th className="py-2.5 px-3">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recentTickets.map((t) => (
                        <tr
                          key={t.reference_id}
                          onClick={() => {
                            setSelectedTicketRef(t.reference_id);
                            setIsDrawerOpen(true);
                          }}
                          className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                        >
                          <td className="py-3 px-3 font-mono font-bold text-blue-600 group-hover:underline">
                            {t.reference_id}
                          </td>
                          <td className="py-3 px-3 font-medium text-slate-900 truncate max-w-[180px]" title={t.subject}>
                            {t.subject}
                          </td>
                          <td className="py-3 px-3">{getSeverityBadge(t.severity)}</td>
                          <td className="py-3 px-3">{getStatusBadge(t.status)}</td>
                          <td className="py-3 px-3 font-medium text-slate-700 truncate max-w-[120px]">
                            {t.user_name || 'User'}
                          </td>
                          <td className="py-3 px-3 text-slate-500 font-medium whitespace-nowrap">
                            {formatRelativeTime(t.updated_at || t.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Navigation & Quick Actions */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-3">Quick Navigation</h3>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  to="/admin/tickets"
                  className="p-3 bg-slate-50 border border-slate-200 hover:border-blue-400 rounded-xl text-center space-y-1 hover:bg-blue-50/50 transition-all group"
                >
                  <div className="text-xl">🎧</div>
                  <div className="text-xs font-bold text-slate-800 group-hover:text-blue-600">Support Queue</div>
                </Link>

                <Link
                  to="/teams"
                  className="p-3 bg-slate-50 border border-slate-200 hover:border-blue-400 rounded-xl text-center space-y-1 hover:bg-blue-50/50 transition-all group"
                >
                  <div className="text-xl">🏢</div>
                  <div className="text-xs font-bold text-slate-800 group-hover:text-blue-600">Manage Teams</div>
                </Link>

                <Link
                  to="/analytics"
                  className="p-3 bg-slate-50 border border-slate-200 hover:border-blue-400 rounded-xl text-center space-y-1 hover:bg-blue-50/50 transition-all group"
                >
                  <div className="text-xl">📊</div>
                  <div className="text-xs font-bold text-slate-800 group-hover:text-blue-600">Class Analytics</div>
                </Link>

                <Link
                  to="/help-center"
                  className="p-3 bg-slate-50 border border-slate-200 hover:border-blue-400 rounded-xl text-center space-y-1 hover:bg-blue-50/50 transition-all group"
                >
                  <div className="text-xl">📚</div>
                  <div className="text-xs font-bold text-slate-800 group-hover:text-blue-600">Help Center</div>
                </Link>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* Ticket Detail Drawer Integration */}
      <TicketDetailDrawer
        referenceId={selectedTicketRef}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        isAdmin={true}
        onUpdated={fetchDashboardData}
      />
    </div>
  );
}
