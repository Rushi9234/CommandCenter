import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../services/api';
import AttentionActionCenter from './AttentionActionCenter';
import AssignWorkModal from './AssignWorkModal';
import AuditReportModal from './AuditReportModal';
import { useRealtime } from '../hooks/useRealtime';

interface ChildTeamProgress {
  total: number;
  completed: number;
  in_progress?: number;
  review?: number;
  todo?: number;
  completed_recent?: number;
  percent: number | null;
}

interface TeamBurndown {
  total: number;
  completed: number;
  in_progress: number;
  review: number;
  todo: number;
  blocked: number;
}

interface TeamVelocity {
  completed_this_week: number;
  score: number;
  label: 'HIGH' | 'STEADY' | 'LOW' | 'STALLED' | 'IDLE';
}

interface TeamHealth {
  status: 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK';
  score: number;
  risks: string[];
}

export interface ContextChildTeam {
  team_id: string;
  team_name: string;
  description: string | null;
  team_type: string;
  is_public: boolean;
  member_count: number;
  submitted_today: boolean;
  open_blocker_count: number;
  critical_blocker_count?: number;
  stale_blocker_count?: number;
  task_progress: ChildTeamProgress | null;
  burndown?: TeamBurndown;
  velocity?: TeamVelocity;
  health?: TeamHealth;
  needs_attention: boolean;
}

export interface ContextDashboardSummary {
  total_teams: number;
  submitted_today_count: number;
  blocked_count: number;
  needs_attention_count: number;
  healthy_teams_count?: number;
  at_risk_teams_count?: number;
  total_tasks_completed_this_week?: number;
  average_velocity?: number;
}

export interface ContextTeamData {
  team_id: string;
  team_name: string;
  team_type: string;
  description: string | null;
}

export interface ContextDashboardData {
  context: ContextTeamData;
  teams: ContextChildTeam[];
  summary: ContextDashboardSummary;
}

interface ClassroomCoordinatorDashboardProps {
  contextTeamId: string;
  contextTeamName?: string;
  onSelectTeam?: (teamId: string, teamName: string) => void;
}

type ViewMode = 'matrix' | 'cards';
type FilterStatus = 'ALL' | 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK';
type SortOption = 'velocity' | 'health' | 'progress' | 'blockers' | 'name';

export default function ClassroomCoordinatorDashboard({
  contextTeamId,
  contextTeamName,
  onSelectTeam,
}: ClassroomCoordinatorDashboardProps) {
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState<ContextDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState<boolean>(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isAuditReportOpen, setIsAuditReportOpen] = useState(false);

  // Matrix Filter & View States
  const [viewMode, setViewMode] = useState<ViewMode>('matrix');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('health');

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    setIsForbidden(false);

    try {
      const res = await api.getContextDashboard(contextTeamId);
      setDashboardData(res.data.data);
    } catch (err: any) {
      console.error('Failed to load classroom dashboard:', err);
      if (err?.response?.status === 403) {
        setIsForbidden(true);
      } else {
        setError(err?.response?.data?.message || 'Failed to load classroom work transparency data.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (contextTeamId) {
      fetchDashboard();
    }
  }, [contextTeamId]);

  useRealtime(() => {
    if (contextTeamId) {
      fetchDashboard();
    }
  });

  // Filtered & Sorted Teams
  const processedTeams = useMemo(() => {
    if (!dashboardData?.teams) return [];
    let list = [...dashboardData.teams];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.team_name.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q))
      );
    }

    // Health filter
    if (filterStatus !== 'ALL') {
      list = list.filter((t) => {
        const status = t.health?.status || (t.open_blocker_count > 1 ? 'AT_RISK' : t.needs_attention ? 'NEEDS_ATTENTION' : 'HEALTHY');
        return status === filterStatus;
      });
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'velocity') {
        const velA = a.velocity?.score ?? (a.task_progress?.completed ?? 0);
        const velB = b.velocity?.score ?? (b.task_progress?.completed ?? 0);
        return velB - velA;
      }
      if (sortBy === 'health') {
        const scoreA = a.health?.score ?? (a.open_blocker_count > 1 ? 40 : a.needs_attention ? 65 : 90);
        const scoreB = b.health?.score ?? (b.open_blocker_count > 1 ? 40 : b.needs_attention ? 65 : 90);
        return scoreA - scoreB; // Ascending: lowest score (needs attention first)
      }
      if (sortBy === 'progress') {
        const pctA = a.task_progress?.percent ?? 0;
        const pctB = b.task_progress?.percent ?? 0;
        return pctB - pctA;
      }
      if (sortBy === 'blockers') {
        return b.open_blocker_count - a.open_blocker_count;
      }
      if (sortBy === 'name') {
        return a.team_name.localeCompare(b.team_name);
      }
      return 0;
    });

    return list;
  }, [dashboardData?.teams, searchQuery, filterStatus, sortBy]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse" data-testid="classroom-dashboard-loading">
        <div className="pro-card p-6">
          <div className="h-6 w-48 bg-gray-200 rounded mb-4"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isForbidden) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-900" data-testid="classroom-dashboard-forbidden">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">🔒</span>
          <h3 className="text-lg font-bold">Coordinator Access Restricted</h3>
        </div>
        <p className="text-sm text-amber-800">
          Classroom aggregate transparency is available to authorized classroom coordinators and team leads.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-900" data-testid="classroom-dashboard-error">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">Unable to load classroom transparency data</h3>
            <p className="text-sm text-rose-700 mt-1">{error}</p>
          </div>
          <button
            onClick={fetchDashboard}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!dashboardData) return null;

  const { context, teams, summary } = dashboardData;

  const totalTasks = teams.reduce((acc, t) => acc + (t.task_progress?.total || 0), 0);
  const completedTasks = teams.reduce((acc, t) => acc + (t.task_progress?.completed || 0), 0);
  const remainingTasks = Math.max(0, totalTasks - completedTasks);
  const totalOpenBlockers = teams.reduce((acc, t) => acc + (t.open_blocker_count || 0), 0);
  const totalMembers = teams.reduce((acc, t) => acc + (t.member_count || 0), 0);
  const overallCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const healthyCount = teams.filter((t) => (t.health?.status || (t.open_blocker_count === 0 && !t.needs_attention ? 'HEALTHY' : '')) === 'HEALTHY').length;
  const attentionCount = teams.filter((t) => (t.health?.status || (t.needs_attention && t.open_blocker_count <= 1 ? 'NEEDS_ATTENTION' : '')) === 'NEEDS_ATTENTION').length;
  const atRiskCount = teams.filter((t) => (t.health?.status || (t.open_blocker_count > 1 ? 'AT_RISK' : '')) === 'AT_RISK').length;

  const atRiskTeams = teams.filter((t) => (t.health?.status || (t.open_blocker_count > 1 ? 'AT_RISK' : '')) === 'AT_RISK');

  const handleRowClick = (teamId: string, teamName: string) => {
    if (onSelectTeam) {
      onSelectTeam(teamId, teamName);
    } else {
      navigate(`/classrooms/${contextTeamId}/teams/${teamId}`);
    }
  };

  return (
    <div className="space-y-6" data-testid="classroom-coordinator-dashboard">
      {/* Header Card */}
      <div className="pro-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl">🎓</span>
              <h1 className="text-2xl font-bold text-gray-900">{contextTeamName || context.team_name}</h1>
              <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-0.5 rounded-full font-bold">
                Classroom Coordinator Console
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Classroom Overview • Aggregate work transparency across {summary.total_teams} teams and {totalMembers} members
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => setIsAuditReportOpen(true)}
              className="flex-1 sm:flex-initial justify-center px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-xl border border-slate-300 shadow-2xs hover:border-slate-400 transition-all flex items-center gap-1.5"
              data-testid="open-audit-report-btn"
            >
              <span>📥</span>
              <span>Export Audit</span>
            </button>

            <button
              onClick={() => setIsAssignModalOpen(true)}
              className="flex-1 sm:flex-initial justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5"
            >
              <span>+ Assign Work</span>
            </button>
          </div>
        </div>

        {/* Attention Action Center */}
        <AttentionActionCenter scope="CLASSROOM" teamId={contextTeamId} />

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-slate-50 border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Sub-Teams</div>
            <div className="text-2xl font-black text-gray-900 mt-1">{summary.total_teams}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              <span className="text-emerald-600 font-bold">{healthyCount} healthy</span> • {atRiskCount} at risk
            </div>
          </div>

          <div className="bg-slate-50 border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Total Members</div>
            <div className="text-2xl font-black text-gray-900 mt-1">{totalMembers}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Enrolled students</div>
          </div>

          <div className="bg-slate-50 border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Class Tasks</div>
            <div className="text-2xl font-black text-indigo-600 mt-1">{totalTasks}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              <span className="text-emerald-600 font-bold">{completedTasks} done</span> • {remainingTasks} open
            </div>
          </div>

          <div className="bg-slate-50 border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Open Blockers</div>
            <div className={`text-2xl font-black mt-1 ${totalOpenBlockers > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {totalOpenBlockers}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {totalOpenBlockers > 0 ? 'Requires coordinator attention' : 'Zero blockers active'}
            </div>
          </div>

          <div className="bg-slate-50 border border-gray-200 rounded-xl p-4 col-span-2 md:col-span-1">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Class Progress</div>
            <div className="text-2xl font-black text-emerald-600 mt-1">{overallCompletionRate}%</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {completedTasks} / {totalTasks} tasks done
            </div>
          </div>
        </div>

        {/* Task Distribution Visual Bar */}
        <div className="pt-4 border-t border-gray-100 space-y-2" data-testid="classroom-work-distribution-visual">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-gray-700">Classroom Task Distribution Across All Teams</span>
            <span className="font-semibold text-indigo-600">{completedTasks} / {totalTasks} Tasks Completed</span>
          </div>

          <div className="w-full bg-gray-100 h-3 rounded-full flex overflow-hidden border border-gray-200">
            {totalTasks > 0 ? (
              <>
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${(completedTasks / totalTasks) * 100}%` }}
                  title={`Completed: ${completedTasks}`}
                />
                <div
                  className="bg-indigo-400 h-full transition-all duration-300"
                  style={{ width: `${(remainingTasks / totalTasks) * 100}%` }}
                  title={`Remaining: ${remainingTasks}`}
                />
              </>
            ) : (
              <div className="w-full bg-gray-200 h-full" />
            )}
          </div>
        </div>
      </div>

      {/* Early Warning Signal Card (if any teams at risk) */}
      {atRiskTeams.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-rose-950 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🚨</span>
              <div>
                <h3 className="font-bold text-sm text-rose-900">
                  Coordinator Intervention Recommended ({atRiskTeams.length} {atRiskTeams.length === 1 ? 'Team' : 'Teams'} At Risk)
                </h3>
                <p className="text-xs text-rose-700 mt-0.5">
                  Early warning telemetry detected critical blockers or stalled sprint velocity.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {atRiskTeams.map((t) => (
                    <button
                      key={t.team_id}
                      onClick={() => handleRowClick(t.team_id, t.team_name)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-rose-100 border border-rose-300 rounded-lg text-xs font-semibold text-rose-800 transition-colors shadow-xs"
                    >
                      <span>{t.team_name}</span>
                      <span className="text-[10px] bg-rose-200 px-1.5 py-0.2 rounded font-bold">
                        {t.open_blocker_count} {t.open_blocker_count === 1 ? 'blocker' : 'blockers'}
                      </span>
                      <span>→</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => setFilterStatus('AT_RISK')}
              className="text-xs font-bold text-rose-700 hover:text-rose-900 underline whitespace-nowrap"
            >
              Filter At Risk
            </button>
          </div>
        </div>
      )}

      {/* Multi-Team Velocity & Health Matrix Section */}
      <div className="pro-card p-6 space-y-5">
        {/* Controls Bar: Search, Filters, Sorters, View Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span>Classroom Multi-Team Velocity & Health Matrix</span>
              <span className="text-xs font-normal text-gray-500">({processedTeams.length} of {teams.length} teams)</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Side-by-side comparative sprint burndown, velocity indices, and automated risk diagnostics.
            </p>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl bg-gray-100 p-1 border border-gray-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('matrix')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  viewMode === 'matrix' ? 'bg-white text-indigo-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>📊</span>
                <span>Matrix View</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  viewMode === 'cards' ? 'bg-white text-indigo-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>🃏</span>
                <span>Team Cards</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterStatus === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Teams ({teams.length})
            </button>
            <button
              onClick={() => setFilterStatus('HEALTHY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                filterStatus === 'HEALTHY'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              <span>🟢</span> Healthy ({healthyCount})
            </button>
            <button
              onClick={() => setFilterStatus('NEEDS_ATTENTION')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                filterStatus === 'NEEDS_ATTENTION'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              <span>🟡</span> Attention ({attentionCount})
            </button>
            <button
              onClick={() => setFilterStatus('AT_RISK')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                filterStatus === 'AT_RISK'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              <span>🔴</span> At Risk ({atRiskCount})
            </button>
          </div>

          {/* Search & Sort Dropdown */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search sub-team..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-44"
            />

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-700 w-full sm:w-auto"
            >
              <option value="health">Sort: Risk / Attention First</option>
              <option value="velocity">Sort: Highest Velocity</option>
              <option value="progress">Sort: Task Completion %</option>
              <option value="blockers">Sort: Most Blockers</option>
              <option value="name">Sort: Team Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Empty State */}
        {teams.length === 0 ? (
          <div className="text-center py-12 bg-white border border-gray-200 rounded-2xl p-6" data-testid="classroom-dashboard-empty">
            <span className="text-3xl block mb-2">🏫</span>
            <h3 className="font-bold text-gray-900 text-base">No Sub-Teams in Classroom Context</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
              There are currently no active sub-teams registered under this classroom context.
            </p>
          </div>
        ) : processedTeams.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 border border-gray-200 rounded-xl p-6">
            <p className="text-xs text-gray-500">No teams matched your current filter criteria.</p>
            <button
              onClick={() => {
                setFilterStatus('ALL');
                setSearchQuery('');
              }}
              className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800"
            >
              Reset Filters
            </button>
          </div>
        ) : viewMode === 'matrix' ? (
          /* Multi-Team Matrix View */
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 text-gray-700 font-bold uppercase tracking-wider text-[11px] border-b border-gray-200">
                  <th className="py-3 px-4">Sub-Team</th>
                  <th className="py-3 px-4">Health Status</th>
                  <th className="py-3 px-4">Velocity</th>
                  <th className="py-3 px-4 min-w-[220px]">Sprint Burndown</th>
                  <th className="py-3 px-4 text-center">Standup</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {processedTeams.map((team) => {
                  const taskTotal = team.task_progress?.total || 0;
                  const taskCompleted = team.task_progress?.completed || 0;
                  const taskInProgress = team.task_progress?.in_progress || 0;
                  const taskReview = team.task_progress?.review || 0;
                  const taskPercent = team.task_progress?.percent ?? (taskTotal > 0 ? Math.round((taskCompleted / taskTotal) * 100) : 0);

                  const healthStatus = team.health?.status || (team.open_blocker_count > 1 ? 'AT_RISK' : team.needs_attention ? 'NEEDS_ATTENTION' : 'HEALTHY');
                  const healthScore = team.health?.score ?? (healthStatus === 'AT_RISK' ? 45 : healthStatus === 'NEEDS_ATTENTION' ? 70 : 92);
                  const risks = team.health?.risks || [];

                  const velocityScore = team.velocity?.score ?? (team.task_progress?.completed_recent || 0);
                  const velocityLabel = team.velocity?.label ?? (velocityScore >= 3 ? 'HIGH' : velocityScore >= 1 ? 'STEADY' : 'LOW');

                  let healthBadgeLabel = '🟢 On Track';
                  let healthBadgeCls = 'bg-emerald-50 text-emerald-700 border-emerald-200';

                  if (taskTotal === 0 && team.member_count === 0) {
                    healthBadgeLabel = '⚪ No Active Work';
                    healthBadgeCls = 'bg-gray-100 text-gray-700 border-gray-200';
                  } else if (team.open_blocker_count > 1 || healthStatus === 'AT_RISK') {
                    healthBadgeLabel = '🔴 At Risk';
                    healthBadgeCls = 'bg-rose-50 text-rose-700 border-rose-200';
                  } else if (team.open_blocker_count > 0 || !team.submitted_today || team.needs_attention || healthStatus === 'NEEDS_ATTENTION') {
                    healthBadgeLabel = '🟡 Needs Attention';
                    healthBadgeCls = 'bg-amber-50 text-amber-700 border-amber-200';
                  }

                  const velocityBadgeConfig = {
                    HIGH: { label: '⚡ High', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
                    STEADY: { label: '⚡ Steady', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
                    LOW: { label: '⏳ Low', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
                    STALLED: { label: '🛑 Stalled', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
                    IDLE: { label: '⚪ Idle', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
                  }[velocityLabel];

                  return (
                    <tr
                      key={team.team_id}
                      onClick={() => handleRowClick(team.team_id, team.team_name)}
                      className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                      data-testid={`team-row-${team.team_id}`}
                    >
                      {/* Sub-Team Column */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                          <span>{team.team_name}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono font-normal">
                            {team.member_count} {team.member_count === 1 ? 'member' : 'members'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5">
                          {team.description || 'No description provided'}
                        </p>
                      </td>

                      {/* Health Status Column */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${healthBadgeCls}`}>
                            {healthBadgeLabel}
                          </span>
                          <span className="text-[10px] text-gray-500 font-mono">
                            {healthScore}%
                          </span>
                        </div>
                        {risks.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {risks.slice(0, 2).map((r, rIdx) => (
                              <span key={rIdx} className="text-[10px] text-rose-700 bg-rose-50/80 px-1.5 py-0.2 rounded border border-rose-100">
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Velocity Column */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${velocityBadgeConfig.cls}`}>
                          {velocityBadgeConfig.label}
                        </span>
                        <div className="text-[10px] text-gray-500 mt-1">
                          {team.velocity?.completed_this_week ?? taskCompleted} done / 7d ({velocityScore}/m)
                        </div>
                      </td>

                      {/* Multi-Team Burndown Bar Column */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-between text-[11px] mb-1 font-semibold text-gray-700">
                          <span>{taskPercent}% Complete</span>
                          <span className="text-gray-500 font-mono text-[10px]">
                            {taskCompleted}/{taskTotal} tasks
                          </span>
                        </div>

                        {/* Stacked Proportional Burndown Bar */}
                        <div className="w-full bg-gray-100 h-2.5 rounded-full flex overflow-hidden border border-gray-200">
                          {taskTotal > 0 ? (
                            <>
                              <div
                                className="bg-emerald-500 h-full transition-all duration-300"
                                style={{ width: `${(taskCompleted / taskTotal) * 100}%` }}
                                title={`Completed: ${taskCompleted}`}
                              />
                              <div
                                className="bg-indigo-500 h-full transition-all duration-300"
                                style={{ width: `${(taskInProgress / taskTotal) * 100}%` }}
                                title={`In Progress: ${taskInProgress}`}
                              />
                              <div
                                className="bg-amber-400 h-full transition-all duration-300"
                                style={{ width: `${(taskReview / taskTotal) * 100}%` }}
                                title={`In Review: ${taskReview}`}
                              />
                              <div
                                className="bg-slate-300 h-full transition-all duration-300"
                                style={{
                                  width: `${(Math.max(0, taskTotal - taskCompleted - taskInProgress - taskReview) / taskTotal) * 100}%`,
                                }}
                                title="Todo"
                              />
                            </>
                          ) : (
                            <div className="w-full bg-gray-200 h-full" />
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-1">
                          <span className="text-emerald-700 font-semibold">{taskCompleted} done</span>
                          {taskInProgress > 0 && <span>• {taskInProgress} in progress</span>}
                          {team.open_blocker_count > 0 && (
                            <span className="text-rose-600 font-bold">• {team.open_blocker_count} blocked</span>
                          )}
                        </div>
                      </td>

                      {/* Standup Submission Column */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {team.submitted_today ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            ✓ Submitted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Action Column */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                          View Team →
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Team Cards Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {processedTeams.map((team) => {
              const taskTotal = team.task_progress?.total || 0;
              const taskCompleted = team.task_progress?.completed || 0;
              const taskPercent = team.task_progress?.percent ?? (taskTotal > 0 ? Math.round((taskCompleted / taskTotal) * 100) : 0);

              const healthStatus = team.health?.status || (team.open_blocker_count > 1 ? 'AT_RISK' : team.needs_attention ? 'NEEDS_ATTENTION' : 'HEALTHY');
              const healthScore = team.health?.score ?? (healthStatus === 'AT_RISK' ? 45 : healthStatus === 'NEEDS_ATTENTION' ? 70 : 92);

              let healthBadgeLabel = '🟢 On Track';
              let healthBadgeCls = 'bg-emerald-50 text-emerald-700 border-emerald-200';

              if (taskTotal === 0 && team.member_count === 0) {
                healthBadgeLabel = '⚪ No Active Work';
                healthBadgeCls = 'bg-gray-100 text-gray-700 border-gray-200';
              } else if (team.open_blocker_count > 1 || healthStatus === 'AT_RISK') {
                healthBadgeLabel = '🔴 At Risk';
                healthBadgeCls = 'bg-rose-50 text-rose-700 border-rose-200';
              } else if (team.open_blocker_count > 0 || !team.submitted_today || team.needs_attention || healthStatus === 'NEEDS_ATTENTION') {
                healthBadgeLabel = '🟡 Needs Attention';
                healthBadgeCls = 'bg-amber-50 text-amber-700 border-amber-200';
              }

              return (
                <div
                  key={team.team_id}
                  onClick={() => handleRowClick(team.team_id, team.team_name)}
                  className="pro-card-hover p-5 border border-gray-200 rounded-xl space-y-4 cursor-pointer hover:border-indigo-400 transition-all"
                  data-testid={`team-row-${team.team_id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-gray-900 text-base">{team.team_name}</h4>
                      <p className="text-xs text-gray-500 line-clamp-1">{team.description || 'No description'}</p>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${healthBadgeCls}`}>
                      {healthBadgeLabel}
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span>Completion Progress</span>
                      <span className="font-bold text-gray-900">{taskPercent}%</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${taskPercent}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs border-t border-gray-100">
                    <div className="bg-gray-50 p-2 rounded-lg">
                      <div className="text-gray-500 text-[10px]">Members</div>
                      <div className="font-bold text-gray-900 mt-0.5">{team.member_count}</div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded-lg">
                      <div className="text-gray-500 text-[10px]">Done</div>
                      <div className="font-bold text-emerald-600 mt-0.5">{taskCompleted}/{taskTotal}</div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded-lg">
                      <div className="text-gray-500 text-[10px]">Blockers</div>
                      <div className={`font-bold mt-0.5 ${team.open_blocker_count > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {team.open_blocker_count}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 font-mono">
                      Health: {healthScore}%
                    </span>
                    <span className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                      View Team →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assign Work Modal */}
      <AssignWorkModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        onSuccess={fetchDashboard}
        classId={contextTeamId}
        teams={teams}
      />

      {/* Audit & Activity Report Exporter Modal */}
      <AuditReportModal
        isOpen={isAuditReportOpen}
        onClose={() => setIsAuditReportOpen(false)}
        teamId={contextTeamId}
        teamName={contextTeamName || context?.team_name || 'Classroom'}
      />
    </div>
  );
}
