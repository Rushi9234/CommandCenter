import { useState, useEffect, useRef } from 'react';
import * as api from '../services/api';
import AttentionActionCenter from './AttentionActionCenter';
import Avatar from './common/Avatar';
import StatusBadge from './common/StatusBadge';
import MemberDetailView from './MemberDetailView';
import AssignWorkModal from './AssignWorkModal';
import ReviewWorkModal from './ReviewWorkModal';
import { useRealtime } from '../hooks/useRealtime';
import LineChart from './charts/LineChart';
import DonutChart from './charts/DonutChart';
import BarChart from './charts/BarChart';
import ProgressBar from './charts/ProgressBar';

interface MemberSummary {
  user_id: string;
  full_name: string;
  username: string;
  role: string;
  avatar_key?: string | null;
  tasks: {
    assigned: number;
    in_progress: number;
    completed: number;
    remaining: number;
  };
}

interface TaskItem {
  task_id: string;
  project_id: string;
  project_name: string;
  title: string;
  description: string | null;
  owner: string | null;
  owner_name: string | null;
  contributors: string[];
  reviewer: string | null;
  status: string;
  priority: string;
  created_at: string;
  completed_at: string | null;
}

interface GoalItem {
  goal_id: string;
  title: string;
  description: string | null;
  goal_type: string | null;
  status: string;
  progress: number;
  created_by: string;
  created_by_name: string | null;
  target_date: string | null;
  created_at: string;
}

interface DailySubmissionItem {
  submission_id: string;
  user_id: string;
  user_full_name: string;
  user_username: string;
  work_date: string;
  confirmed_summary: string;
  confirmed_at: string;
}

interface BlockerItem {
  blocker_id: string;
  title: string;
  description: string | null;
  urgency: string | null;
  status: string;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
}

interface WorklogData {
  team_id: string;
  team_name: string;
  team_summary: {
    tasks: {
      assigned: number;
      in_progress: number;
      completed: number;
      remaining: number;
    };
    goals: {
      total: number;
      active: number;
      completed: number;
      avg_progress: number;
    };
    daily_work: {
      submissions_today: number;
      total_submissions: number;
    };
    blockers: {
      open: number;
      in_progress: number;
      resolved: number;
      total: number;
    };
  };
  member_summary: MemberSummary[];
  work_items: {
    tasks: TaskItem[];
    goals: GoalItem[];
    daily_work_submissions: DailySubmissionItem[];
    blockers: BlockerItem[];
  };
}

interface TeamLeaderWorklogDashboardProps {
  teamId: string;
  teamName?: string;
  isLeader?: boolean;
  parentTeamName?: string;
  initialMemberId?: string;
  onBackToClassroom?: () => void;
  onSelectMember?: (memberId: string | null) => void;
}

export default function TeamLeaderWorklogDashboard({
  teamId,
  teamName,
  parentTeamName,
  initialMemberId,
  onBackToClassroom,
  onSelectMember,
}: TeamLeaderWorklogDashboardProps) {
  const [worklog, setWorklog] = useState<WorklogData | null>(null);
  const [attention, setAttention] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(initialMemberId || null);
  const [activeTab, setActiveTab] = useState<'all' | 'tasks' | 'goals' | 'daily_work' | 'blockers'>('all');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [reviewingTask, setReviewingTask] = useState<any | null>(null);

  const requestSeq = useRef(0);

  const fetchWorklog = async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getWorklog(teamId);
      if (seq === requestSeq.current) {
        setWorklog(res.data.data);
      }
      try {
        const attRes = await api.getAttention(teamId);
        if (seq === requestSeq.current && attRes?.data?.data) {
          const attData = attRes.data.data;
          setAttention(attData?.team || attData);
        }
      } catch {
        // Non-blocking attention fetch
      }
    } catch (err: any) {
      if (seq === requestSeq.current) {
        if (err.response?.status === 403) {
          setError('Access Denied: You must be an authorized team member or team leader to view this worklog.');
        } else if (err.response?.status === 404) {
          setError('Team not found.');
        } else {
          setError(err.response?.data?.error || 'Failed to load Team Worklog.');
        }
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchWorklog();
  }, [teamId]);

  useRealtime(() => {
    if (teamId) {
      fetchWorklog();
    }
  });

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse" data-testid="worklog-loading">
        {onBackToClassroom && (
          <div className="h-10 bg-indigo-900/30 rounded-xl mb-4"></div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-gray-200 rounded-2xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-800" data-testid="worklog-error">
        {onBackToClassroom && (
          <button
            onClick={onBackToClassroom}
            className="mb-4 text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            ← Back to Classroom Overview
          </button>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-rose-900">Worklog Authorization Error</h3>
            <p className="text-sm mt-1 text-rose-700">{error}</p>
          </div>
          <button
            onClick={fetchWorklog}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!worklog) {
    return null;
  }

  const { team_summary, member_summary, work_items } = worklog;

  // Aggregate Calculations
  const taskTotal = team_summary.tasks.assigned;
  const taskDone = team_summary.tasks.completed;
  const taskPercent = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;

  const goalTotal = team_summary.goals.total;
  const goalAvgProgress = team_summary.goals.avg_progress || 0;

  let overallProgress = 0;
  if (taskTotal > 0 && goalTotal > 0) {
    overallProgress = Math.round(0.5 * taskPercent + 0.5 * goalAvgProgress);
  } else if (taskTotal > 0) {
    overallProgress = taskPercent;
  } else if (goalTotal > 0) {
    overallProgress = goalAvgProgress;
  }

  // Factual Attention / Status Indicators
  const openBlockers = team_summary.blockers.open;

  let statusBadge = '🟢 On Track';
  let statusMessage = 'Team work is progressing normally with active contributions.';
  let statusBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';

  if (taskTotal === 0 && goalTotal === 0) {
    statusBadge = '⚪ No Active Work';
    statusMessage = 'No tasks or goals currently assigned to this team.';
    statusBadgeClass = 'bg-gray-100 text-gray-700 border-gray-300';
  } else if (openBlockers > 2) {
    statusBadge = '🔴 At Risk';
    statusMessage = `Multiple open blockers (${openBlockers}) require immediate leader support.`;
    statusBadgeClass = 'bg-rose-100 text-rose-800 border-rose-300';
  } else if (openBlockers > 0 || team_summary.tasks.remaining > team_summary.tasks.completed) {
    statusBadge = '🟡 Needs Attention';
    statusMessage = openBlockers > 0
      ? `${openBlockers} open blocker needs resolution.`
      : `${team_summary.tasks.remaining} remaining tasks pending completion.`;
    statusBadgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
  }

  const selectedMember = member_summary.find((m) => m.user_id === selectedMemberId);

  // Filtered Work Items for Drilldown
  const selectedMemberTasks = selectedMember
    ? work_items.tasks.filter((t) => t.owner === selectedMember.user_id || (Array.isArray(t.contributors) && t.contributors.includes(selectedMember.user_id)))
    : [];

  const selectedMemberSubmissions = selectedMember
    ? work_items.daily_work_submissions.filter((s) => s.user_id === selectedMember.user_id)
    : [];

  const selectedMemberBlockers = selectedMember
    ? work_items.blockers.filter((b) => b.created_by === selectedMember.user_id)
    : [];

  const hasZeroWork = taskTotal === 0 && goalTotal === 0 && work_items.daily_work_submissions.length === 0 && team_summary.blockers.total === 0;

  if (selectedMember) {
    return (
      <MemberDetailView
        member={selectedMember}
        teamName={worklog.team_name || teamName || 'Team View'}
        parentTeamName={parentTeamName}
        tasks={selectedMemberTasks}
        dailySubmissions={selectedMemberSubmissions}
        blockers={selectedMemberBlockers}
        onBackToTeam={() => {
          setSelectedMemberId(null);
          if (onSelectMember) onSelectMember(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="team-worklog-dashboard">
      {/* BREADCRUMB HEADER FOR CLASSROOM DRILLDOWN */}
      {onBackToClassroom && (
        <div className="flex items-center justify-between bg-indigo-950/60 border border-indigo-700/60 rounded-2xl p-4 shadow-lg" data-testid="classroom-breadcrumb">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-base">🏫</span>
            <span className="font-semibold text-indigo-300">Classroom:</span>
            <span className="text-white font-bold bg-indigo-900/60 px-2.5 py-0.5 rounded-lg border border-indigo-700/50">
              {parentTeamName || 'Classroom Context'}
            </span>
            <span className="text-indigo-400 font-mono">›</span>
            <span className="font-semibold text-indigo-300">Team:</span>
            <span className="text-white font-bold bg-indigo-900/60 px-2.5 py-0.5 rounded-lg border border-indigo-700/50">
              {teamName || 'Team View'}
            </span>
          </div>
          <button
            onClick={onBackToClassroom}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
          >
            ⬅️ Back to Classroom Overview
          </button>
        </div>
      )}

      {/* Header Banner & Privacy Callout */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900">Work Transparency Dashboard</h2>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusBadgeClass}`}>
              {statusBadge}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">{statusMessage}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5"
          >
            <span>+ Assign Work</span>
          </button>
          <div className="hidden md:block text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 max-w-xs">
            🛡️ <span className="font-semibold text-gray-700">Work Transparency:</span> Zero surveillance tracking.
          </div>
        </div>
      </div>

      {/* SECTION A: SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Progress */}
        <div className="pro-card p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Overall Progress</span>
            <span className="text-lg">🎯</span>
          </div>
          <div className="text-3xl font-extrabold text-gray-900">{overallProgress}%</div>
          <div className="w-full bg-gray-100 rounded-full h-2 mt-3 overflow-hidden">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {taskDone} of {taskTotal} tasks done ({taskPercent}%)
          </p>
        </div>

        {/* Task Completion Breakdown */}
        <div className="pro-card p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tasks Summary</span>
            <span className="text-lg">📋</span>
          </div>
          <div className="text-3xl font-extrabold text-gray-900">{taskTotal}</div>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">
              ✅ {team_summary.tasks.completed} Done
            </span>
            <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-medium">
              ⚡ {team_summary.tasks.in_progress} Active
            </span>
            <span className="text-gray-700 bg-gray-100 px-2 py-0.5 rounded font-medium">
              ⏳ {team_summary.tasks.remaining} Open
            </span>
          </div>
        </div>

        {/* Goals Progress */}
        <div className="pro-card p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Team Goals</span>
            <span className="text-lg">🚀</span>
          </div>
          <div className="text-3xl font-extrabold text-gray-900">{team_summary.goals.total}</div>
          <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
            <span>Active: <strong>{team_summary.goals.active}</strong></span>
            <span>Completed: <strong>{team_summary.goals.completed}</strong></span>
            <span>Avg: <strong>{goalAvgProgress}%</strong></span>
          </div>
        </div>

        {/* Daily Work & Blockers */}
        <div className="pro-card p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Daily Work & SOS</span>
            <span className="text-lg">📝</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold text-gray-900">
              {team_summary.daily_work.submissions_today} <span className="text-xs font-normal text-gray-500">submitted today</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className={`px-2.5 py-1 rounded-md font-semibold ${
              openBlockers > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-50 text-emerald-700'
            }`}>
              {openBlockers > 0 ? `🚨 ${openBlockers} Open SOS Blocker${openBlockers > 1 ? 's' : ''}` : '✅ Zero Open Blockers'}
            </span>
          </div>
        </div>
      </div>

      {/* TASK #1: Team Scope Attention / Action Center */}
      <AttentionActionCenter scope="TEAM" teamId={teamId} />

      {/* SECTION A.0: EXPLAINABLE ATTENTION & DECISION SUPPORT CARD */}

      {attention && (
        <div className="pro-card p-6 bg-gradient-to-br from-slate-900 to-indigo-950 text-white shadow-xl border border-indigo-700/60 space-y-4" data-testid="explainable-attention-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-800/80 pb-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🧠</span>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  Explainable Work Attention & Risk Intelligence
                </h3>
                <p className="text-xs text-indigo-300/80">
                  Deterministic rule engine output based strictly on factual work evidence.
                </p>
              </div>
            </div>
            <span className={`px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border shadow-sm ${
              attention.status === 'AT_RISK' ? 'bg-rose-950/80 text-rose-300 border-rose-700' :
              attention.status === 'NEEDS_ATTENTION' ? 'bg-amber-950/80 text-amber-300 border-amber-700' :
              attention.status === 'NO_ACTIVE_WORK' ? 'bg-slate-800 text-slate-300 border-slate-600' :
              'bg-emerald-950/80 text-emerald-300 border-emerald-700'
            }`}>
              {attention.badge_label}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Why this status? (Explainable Rules) */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <span>📋</span> Factual Reasons (Why this status?)
              </h4>
              <p className="text-sm font-semibold text-slate-100">{attention.summary}</p>
              <ul className="space-y-1.5 mt-2 text-xs text-slate-200">
                {(attention.reasons || []).map((r: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 bg-indigo-900/40 p-2 rounded-lg border border-indigo-700/40">
                    <span className="text-indigo-400 font-bold">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Evidence Metric Grid */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <span>🔍</span> Verified Signal Audit (Evidence)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-slate-900/80 border border-indigo-800/60 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Open Blockers</div>
                  <div className={`text-base font-bold mt-0.5 ${(attention.evidence?.open_blockers || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {attention.evidence?.open_blockers || 0}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-indigo-800/60 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Remaining Tasks</div>
                  <div className="text-base font-bold text-indigo-300 mt-0.5">
                    {attention.evidence?.remaining_tasks || 0}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-indigo-800/60 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Stalled Tasks (&gt;5d)</div>
                  <div className={`text-base font-bold mt-0.5 ${(attention.evidence?.stalled_tasks || 0) > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                    {attention.evidence?.stalled_tasks || 0}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-indigo-800/60 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Reopened Tasks</div>
                  <div className={`text-base font-bold mt-0.5 ${(attention.evidence?.reopened_tasks || 0) > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                    {attention.evidence?.reopened_tasks || 0}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-indigo-800/60 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">7d Completion Velocity</div>
                  <div className="text-base font-bold text-emerald-400 mt-0.5">
                    {attention.evidence?.completed_7d_velocity || 0} tasks
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-indigo-800/60 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Submitted Today</div>
                  <div className={`text-base font-bold mt-0.5 ${attention.evidence?.submitted_today ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {attention.evidence?.submitted_today ? 'Confirmed ✅' : 'Pending ⏳'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION A.1: VISUAL ANALYTICS — PROGRESS TREND, DONUT CHART & BAR CHART */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" data-testid="visual-analytics-section">
        {/* Progress Trend Line Chart (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {(() => {
            const trendDays = 7;
            const trendDates: string[] = [];
            const now = new Date();
            for (let i = trendDays - 1; i >= 0; i--) {
              const d = new Date(now);
              d.setDate(d.getDate() - i);
              trendDates.push(d.toISOString().slice(0, 10));
            }

            const completionsByDate: Record<string, number> = {};
            work_items.tasks.forEach((t) => {
              if (t.completed_at) {
                const d = t.completed_at.slice(0, 10);
                completionsByDate[d] = (completionsByDate[d] || 0) + 1;
              }
            });

            let runningTotal = 0;
            const linePoints = trendDates.map((dateStr) => {
              const count = completionsByDate[dateStr] || 0;
              runningTotal += count;
              const dateObj = new Date(dateStr);
              const label = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
              return { label, value: runningTotal };
            });

            return (
              <LineChart
                data={linePoints}
                title="Task Completion Progress Trend (7-Day Window)"
                height={210}
              />
            );
          })()}

          {/* Project Distribution Bar Chart */}
          {(() => {
            const projectCounts: Record<string, number> = {};
            work_items.tasks.forEach((t) => {
              const name = t.project_name || 'General Project';
              projectCounts[name] = (projectCounts[name] || 0) + 1;
            });

            const barItems = Object.entries(projectCounts).map(([label, value]) => ({ label, value }));

            return (
              <BarChart
                items={barItems.length > 0 ? barItems : [{ label: 'Team Tasks', value: taskTotal }]}
                title="Work Distribution Across Projects"
              />
            );
          })()}
        </div>

        {/* Status Distribution Donut Chart & Progress Bars (1 col) */}
        <div className="space-y-6" data-testid="status-distribution-card">
          {(() => {
            const pendingReviewCount = work_items.tasks.filter((t) => t.status === 'review' || t.status === 'submitted_for_review').length;
            const todoCount = Math.max(0, team_summary.tasks.remaining - pendingReviewCount);

            const donutSegments = [
              { label: 'Completed', value: team_summary.tasks.completed, color: '#10b981' },
              { label: 'In Progress', value: team_summary.tasks.in_progress, color: '#3b82f6' },
              { label: 'Pending Review', value: pendingReviewCount, color: '#f59e0b' },
              { label: 'To Do', value: todoCount, color: '#94a3b8' },
            ];

            return (
              <DonutChart
                segments={donutSegments}
                title="Work Status Distribution"
                totalLabel="Total Tasks"
              />
            );
          })()}

          {/* Team Overall Progress Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Overall Completion Progress</h4>
            <ProgressBar
              percentage={overallProgress}
              label="Team Milestone Progress"
              sublabel={`${taskDone} of ${taskTotal} tasks done`}
              colorClass="bg-indigo-600"
            />
          </div>
        </div>
      </div>

      {/* SECTION B & C: MEMBER WORK DISTRIBUTION (STACKED BAR CHART & TABLE) */}
      <div className="pro-card p-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Member Work Distribution</h3>
            <p className="text-sm text-gray-500">
              Objective workload allocation per authorized team member (Completed vs Active vs Open).
            </p>
          </div>
          {selectedMemberId && (
            <button
              onClick={() => setSelectedMemberId(null)}
              className="btn-secondary text-xs px-3 py-1"
            >
              Clear Drilldown Filter
            </button>
          )}
        </div>

        {member_summary.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">No team members found.</p>
        ) : (
          <div className="space-y-4">
            {member_summary.map((member) => {
              const assigned = member.tasks.assigned;
              const completed = member.tasks.completed;
              const inProgress = member.tasks.in_progress;
              const remaining = member.tasks.remaining;

              const completedPct = assigned > 0 ? (completed / assigned) * 100 : 0;
              const inProgressPct = assigned > 0 ? (inProgress / assigned) * 100 : 0;
              const remainingPct = assigned > 0 ? (remaining / assigned) * 100 : 0;

              const isSelected = selectedMemberId === member.user_id;

              return (
                <div
                  key={member.user_id}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedMemberId(isSelected ? null : member.user_id)}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3">
                      <Avatar name={member.full_name} size="md" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 text-sm">{member.full_name}</span>
                          <span className="text-xs text-gray-500">@{member.username}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            member.role === 'owner' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {member.role}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {assigned === 0 ? (
                            <span>No tasks currently assigned</span>
                          ) : (
                            <span>
                              {assigned} total task{assigned > 1 ? 's' : ''} assigned
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Member Task Stat Pills */}
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-md font-semibold border border-emerald-200">
                        Completed: {completed}
                      </span>
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-800 rounded-md font-semibold border border-blue-200">
                        In Progress: {inProgress}
                      </span>
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md font-semibold border border-slate-200">
                        Remaining: {remaining}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMemberId(member.user_id);
                          if (onSelectMember) onSelectMember(member.user_id);
                        }}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shadow-xs ml-1"
                      >
                        View Member →
                      </button>
                    </div>
                  </div>

                  {/* Visual Stacked Bar Chart for Work Distribution */}
                  {assigned > 0 ? (
                    <div className="w-full bg-gray-100 rounded-full h-3 flex overflow-hidden mt-3 border border-gray-200">
                      {completedPct > 0 && (
                        <div
                          className="bg-emerald-500 h-full transition-all duration-300"
                          style={{ width: `${completedPct}%` }}
                          title={`Completed: ${completed} (${Math.round(completedPct)}%)`}
                        />
                      )}
                      {inProgressPct > 0 && (
                        <div
                          className="bg-blue-500 h-full transition-all duration-300"
                          style={{ width: `${inProgressPct}%` }}
                          title={`In Progress: ${inProgress} (${Math.round(inProgressPct)}%)`}
                        />
                      )}
                      {remainingPct > 0 && (
                        <div
                          className="bg-slate-300 h-full transition-all duration-300"
                          style={{ width: `${remainingPct}%` }}
                          title={`Remaining: ${remaining} (${Math.round(remainingPct)}%)`}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="w-full bg-gray-50 rounded-full h-2 mt-2 border border-dashed border-gray-200" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>



      {/* SECTION D: RECENT WORKLOG DETAILS (ARTIFACTS TABLE) */}
      <div className="pro-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Recent Work Items</h3>
            <p className="text-sm text-gray-500">
              Verified domain work artifacts for this team.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg text-xs font-medium">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                activeTab === 'all' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All ({work_items.tasks.length + work_items.goals.length + work_items.daily_work_submissions.length + work_items.blockers.length})
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                activeTab === 'tasks' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Tasks ({work_items.tasks.length})
            </button>
            <button
              onClick={() => setActiveTab('goals')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                activeTab === 'goals' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Goals ({work_items.goals.length})
            </button>
            <button
              onClick={() => setActiveTab('daily_work')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                activeTab === 'daily_work' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Daily Work ({work_items.daily_work_submissions.length})
            </button>
            <button
              onClick={() => setActiveTab('blockers')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                activeTab === 'blockers' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Blockers ({work_items.blockers.length})
            </button>
          </div>
        </div>

        {hasZeroWork ? (
          <div className="py-12 text-center" data-testid="empty-worklog">
            <div className="text-4xl mb-2">📦</div>
            <h4 className="font-bold text-gray-900 text-base">No Work Items Found</h4>
            <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
              This team does not have any active tasks, goals, daily work submissions, or blockers created yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* TASKS LIST */}
            {(activeTab === 'all' || activeTab === 'tasks') && work_items.tasks.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tasks</h4>
                {work_items.tasks.map((t) => (
                  <div key={t.task_id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{t.title}</div>
                      <div className="text-gray-500 mt-0.5">
                        Project: <span className="font-semibold text-gray-700">{t.project_name}</span> | Owner: <span className="font-semibold text-gray-700">{t.owner_name || 'Unassigned'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded font-semibold ${
                        t.priority === 'high' ? 'bg-rose-100 text-rose-800' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {t.priority}
                      </span>
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* GOALS LIST */}
            {(activeTab === 'all' || activeTab === 'goals') && work_items.goals.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Goals</h4>
                {work_items.goals.map((g) => (
                  <div key={g.goal_id} className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{g.title}</div>
                      <div className="text-gray-500 mt-0.5">
                        Created by: <span className="font-semibold text-gray-700">{g.created_by_name || 'Team Leader'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${g.progress}%` }} />
                      </div>
                      <span className="font-bold text-blue-900">{g.progress}%</span>
                      <StatusBadge status={g.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* DAILY SUBMISSIONS LIST */}
            {(activeTab === 'all' || activeTab === 'daily_work') && work_items.daily_work_submissions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Daily Work Submissions</h4>
                {work_items.daily_work_submissions.map((s) => (
                  <div key={s.submission_id} className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-bold text-emerald-950 text-sm">{s.confirmed_summary}</div>
                      <div className="text-emerald-700 mt-0.5">
                        By <span className="font-semibold">{s.user_full_name}</span> (@{s.user_username})
                      </div>
                    </div>
                    <div className="text-emerald-600 font-medium">
                      {new Date(s.work_date).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* BLOCKERS LIST */}
            {(activeTab === 'all' || activeTab === 'blockers') && work_items.blockers.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">SOS Blockers</h4>
                {work_items.blockers.map((b) => (
                  <div key={b.blocker_id} className="p-3 bg-rose-50/50 rounded-lg border border-rose-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-bold text-rose-950 text-sm">{b.title}</div>
                      <div className="text-rose-700 mt-0.5">
                        Reported by <span className="font-semibold">{b.created_by_name || 'Team Member'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-rose-200 text-rose-900 rounded font-semibold">
                        Urgency: {b.urgency || 'Normal'}
                      </span>
                      <StatusBadge status={b.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Assign Work Modal */}
      <AssignWorkModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        onSuccess={fetchWorklog}
        teamId={teamId}
        availableTeams={[{ team_id: teamId, team_name: worklog?.team_name || teamName || 'Team View', member_count: member_summary?.length || 0 }]}
      />

      {/* Review Work Modal */}
      <ReviewWorkModal
        isOpen={Boolean(reviewingTask)}
        task={reviewingTask}
        onClose={() => setReviewingTask(null)}
        onSuccess={fetchWorklog}
      />
    </div>
  );
}
