import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../services/api';
import AttentionActionCenter from './AttentionActionCenter';
import AssignWorkModal from './AssignWorkModal';

import { useRealtime } from '../hooks/useRealtime';

interface ChildTeamProgress {
  total: number;
  completed: number;
  percent: number | null;
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
  task_progress: ChildTeamProgress | null;
  needs_attention: boolean;
}

export interface ContextDashboardSummary {
  total_teams: number;
  submitted_today_count: number;
  blocked_count: number;
  needs_attention_count: number;
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

  return (
    <div className="space-y-6" data-testid="classroom-coordinator-dashboard">
      {/* Header */}
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

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAssignModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5"
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
            <div className="text-[11px] text-gray-500 mt-0.5">Active teams</div>
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
            <div className="text-[11px] text-gray-500 mt-0.5">Requires resolution</div>
          </div>

          <div className="bg-slate-50 border border-gray-200 rounded-xl p-4 col-span-2 md:col-span-1">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Class Progress</div>
            <div className="text-2xl font-black text-emerald-600 mt-1">{overallCompletionRate}%</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Completion rate</div>
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
                />
                <div
                  className="bg-indigo-400 h-full transition-all duration-300"
                  style={{ width: `${(remainingTasks / totalTasks) * 100}%` }}
                />
              </>
            ) : (
              <div className="w-full bg-gray-200 h-full" />
            )}
          </div>
        </div>
      </div>

      {/* Teams Grid / Cards */}
      <div className="pro-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Class Teams ({teams.length})</h3>
            <p className="text-xs text-gray-500">Real authorized team performance metrics. Click any team card to drill down.</p>
          </div>
        </div>

        {teams.length === 0 ? (
          <div className="text-center py-12 bg-white border border-gray-200 rounded-2xl p-6" data-testid="classroom-dashboard-empty">
            <span className="text-3xl block mb-2">🏫</span>
            <h3 className="font-bold text-gray-900 text-base">No Sub-Teams in Classroom Context</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
              There are currently no active sub-teams registered under this classroom context.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => {
              const taskTotal = team.task_progress?.total || 0;
              const taskCompleted = team.task_progress?.completed || 0;
              const taskPercent = team.task_progress?.percent ?? (taskTotal > 0 ? Math.round((taskCompleted / taskTotal) * 100) : 0);

              let statusBadge = '🟢 On Track';
              let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';

              if (taskTotal === 0 && team.member_count === 0) {
                statusBadge = '⚪ No Active Work';
                badgeClass = 'bg-gray-100 text-gray-700 border-gray-200';
              } else if (team.open_blocker_count > 1) {
                statusBadge = '🔴 At Risk';
                badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
              } else if (team.open_blocker_count > 0 || !team.submitted_today || team.needs_attention) {
                statusBadge = '🟡 Needs Attention';
                badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
              }

              return (
                <div
                  key={team.team_id}
                  onClick={() => {
                    if (onSelectTeam) {
                      onSelectTeam(team.team_id, team.team_name);
                    } else {
                      navigate(`/classrooms/${contextTeamId}/teams/${team.team_id}`);
                    }
                  }}
                  className="pro-card-hover p-5 border border-gray-200 rounded-xl space-y-4 cursor-pointer hover:border-indigo-400 transition-all"
                  data-testid={`team-row-${team.team_id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-gray-900 text-base">{team.team_name}</h4>
                      <p className="text-xs text-gray-500 line-clamp-1">{team.description || 'No description'}</p>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${badgeClass}`}>
                      {statusBadge}
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

                  <div className="pt-2 flex items-center justify-end">
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
    </div>
  );
}
