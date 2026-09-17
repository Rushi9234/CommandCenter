import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useRealtime, type RealtimeEvent } from '../hooks/useRealtime';
import * as api from '../services/api';
import Avatar from '../components/common/Avatar';
import StatusBadge from '../components/common/StatusBadge';
import {
  InteractiveProgressRing,
  InteractiveTaskDonut,
  InteractiveWorkTrendChart,
} from '../components/charts/InteractiveCharts';

export default function ExecutiveBrief() {
  const { user } = useAuth();
  const params = useParams<{ classId?: string; teamId?: string; memberId?: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Landing scopes state
  const [scopesData, setScopesData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'classes' | 'teams' | 'progress'>('overview');

  // Class analytics state
  const [classData, setClassData] = useState<any>(null);

  // Team analytics state
  const [teamData, setTeamData] = useState<any>(null);

  // Member analytics state
  const [memberData, setMemberData] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, [params.classId, params.teamId, params.memberId]);

  useRealtime((event: RealtimeEvent) => {
    if (
      event.type.startsWith('task.') ||
      event.type.startsWith('goal.') ||
      event.type.startsWith('blocker.') ||
      event.type.startsWith('team.')
    ) {
      void loadData();
    }
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (params.memberId) {
        const res = await api.getMemberAnalytics(params.memberId, params.teamId);
        setMemberData(res.data.data);
      } else if (params.teamId) {
        const res = await api.getTeamAnalytics(params.teamId);
        setTeamData(res.data.data);
      } else if (params.classId) {
        const res = await api.getClassAnalytics(params.classId);
        setClassData(res.data.data);
      } else {
        const res = await api.getAnalyticsScopes();
        setScopesData(res.data.data);
      }
    } catch (err: any) {
      console.error('Failed to load analytics data:', err);
      setError(err.response?.data?.error || 'Failed to load analytics data. Access denied or resource not found.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="spinner w-10 h-10 mb-4 border-t-indigo-600"></div>
        <p className="text-gray-600 font-medium">Loading Analytics Hub...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center justify-center">
        <div className="pro-card p-8 max-w-md text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900">Authorization Error</h2>
          <p className="text-sm text-gray-600">{error}</p>
          <button
            onClick={() => navigate('/analytics')}
            className="btn-primary w-full"
          >
            Back to Analytics Landing
          </button>
        </div>
      </div>
    );
  }

  // Interactive chart components (InteractiveProgressRing, InteractiveTaskDonut, InteractiveWorkTrendChart) are imported from ../components/charts/InteractiveCharts.tsx

  // ---------------------------------------------------------------------------
  // LEVEL 4: MEMBER ANALYTICS VIEW
  // ---------------------------------------------------------------------------
  if (params.memberId && memberData) {
    const { member_info, progress, tasks, goals, recent_activity } = memberData;

    return (
      <div className="min-h-screen bg-gray-50 pb-12">
        {/* Breadcrumb Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 text-xs shadow-xs">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 flex-wrap text-gray-600 font-medium">
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/analytics" className="hover:text-indigo-600 font-semibold">Analytics</Link>
              {params.classId && (
                <>
                  <span className="text-gray-400">/</span>
                  <Link to={`/analytics/classes/${params.classId}`} className="hover:text-indigo-600">Classroom</Link>
                </>
              )}
              {params.teamId && (
                <>
                  <span className="text-gray-400">/</span>
                  <Link
                    to={params.classId ? `/analytics/classes/${params.classId}/teams/${params.teamId}` : `/analytics/teams/${params.teamId}`}
                    className="hover:text-indigo-600"
                  >
                    Team
                  </Link>
                </>
              )}
              <span className="text-gray-400">/</span>
              <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded font-bold">{member_info.full_name}</span>
            </div>

            <button
              onClick={() => {
                if (params.teamId) {
                  navigate(params.classId ? `/analytics/classes/${params.classId}/teams/${params.teamId}` : `/analytics/teams/${params.teamId}`);
                } else {
                  navigate('/analytics');
                }
              }}
              className="btn-secondary text-xs py-1"
            >
              ⬅️ Back to Team Analytics
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          {/* Member Header Card */}
          <div className="pro-card p-6 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <Avatar name={member_info.full_name} src={member_info.avatar_url} size="lg" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{member_info.full_name}</h1>
                <p className="text-sm text-gray-500">@{member_info.username} • Role: <span className="capitalize font-semibold text-gray-700">{member_info.role}</span></p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <InteractiveProgressRing percent={progress.overall_progress} completed={progress.completed} total={progress.assigned} size={85} stroke={8} label="Work" />
            </div>
          </div>

          {/* Member Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="pro-card p-4 text-center">
              <div className="text-xs text-gray-500 font-medium">Assigned Tasks</div>
              <div className="text-2xl font-extrabold text-gray-900 mt-1">{progress.assigned}</div>
            </div>
            <div className="pro-card p-4 text-center">
              <div className="text-xs text-gray-500 font-medium">Completed</div>
              <div className="text-2xl font-extrabold text-emerald-600 mt-1">{progress.completed}</div>
            </div>
            <div className="pro-card p-4 text-center">
              <div className="text-xs text-gray-500 font-medium">Pending Review</div>
              <div className="text-2xl font-extrabold text-purple-600 mt-1">{progress.pending_review}</div>
            </div>
            <div className="pro-card p-4 text-center">
              <div className="text-xs text-gray-500 font-medium">In Progress</div>
              <div className="text-2xl font-extrabold text-blue-600 mt-1">{progress.in_progress}</div>
            </div>
          </div>

          {/* Member Task Status Distribution & Tasks */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="pro-card p-6 lg:col-span-1">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Status Breakdown</h3>
              <InteractiveTaskDonut
                completed={progress.completed}
                inProgress={progress.in_progress}
                pendingReview={progress.pending_review}
                todo={Math.max(0, progress.assigned - progress.completed - progress.in_progress - progress.pending_review)}
              />
            </div>

            <div className="pro-card p-6 lg:col-span-2">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Assigned Tasks ({tasks.length})</h3>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {tasks.map((t: any) => (
                  <div key={t.task_id} className="p-3 bg-gray-50 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{t.title}</div>
                      <div className="text-xs text-gray-500">{t.project_name}</div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                ))}
                {tasks.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No tasks assigned to this member.</p>}
              </div>
            </div>
          </div>

            <div className="pro-card p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Goals ({goals.length})</h3>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {goals.map((g: any) => (
                  <div key={g.goal_id} className="p-3 bg-gray-50 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-gray-900">{g.title}</span>
                      <span className="text-xs font-bold text-indigo-600">{g.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${g.progress}%` }}></div>
                    </div>
                  </div>
                ))}
                {goals.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No goals created by this member.</p>}
              </div>
            </div>

          {/* Activity Timeline */}
          <div className="pro-card p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Activity History</h3>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {recent_activity.map((act: any) => (
                <div key={act.history_id} className="p-3 bg-gray-50 rounded-xl text-xs flex items-center justify-between">
                  <div>
                    <span className="font-bold text-gray-900 capitalize">{act.event_type}</span>
                    <span className="text-gray-500 font-medium"> on {act.artifact_type}</span>
                    {act.team_name && <span className="text-indigo-600 font-semibold ml-2">[{act.team_name}]</span>}
                  </div>
                  <span className="text-gray-400">{new Date(act.created_at).toLocaleString()}</span>
                </div>
              ))}
              {recent_activity.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No recent work activity recorded.</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // LEVEL 3: TEAM ANALYTICS VIEW
  // ---------------------------------------------------------------------------
  if (params.teamId && teamData) {
    const { team_info, progress, task_distribution, work_trend, breakdowns, members } = teamData;

    return (
      <div className="min-h-screen bg-gray-50 pb-12">
        {/* Breadcrumb Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 text-xs shadow-xs">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 flex-wrap text-gray-600 font-medium">
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/analytics" className="hover:text-indigo-600 font-semibold">Analytics</Link>
              {params.classId && (
                <>
                  <span className="text-gray-400">/</span>
                  <Link to={`/analytics/classes/${params.classId}`} className="hover:text-indigo-600">Classroom</Link>
                </>
              )}
              <span className="text-gray-400">/</span>
              <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded font-bold">{team_info.team_name}</span>
            </div>

            <button
              onClick={() => {
                if (params.classId) {
                  navigate(`/analytics/classes/${params.classId}`);
                } else {
                  navigate('/analytics');
                }
              }}
              className="btn-secondary text-xs py-1"
            >
              ⬅️ Back
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          {/* Top Header Card */}
          <div className="pro-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center font-bold text-xl shadow-xs">
                  👥
                </div>
                <div>
                  <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{team_info.team_name}</h1>
                  <p className="text-sm text-gray-500 mt-0.5">{team_info.description || 'Dedicated Team Analytics'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 flex-wrap">
                <span>Leader: <strong className="text-gray-800">{team_info.leader_name}</strong></span>
                <span>Members: <strong className="text-gray-800">{team_info.member_count}</strong></span>
              </div>
            </div>

            <InteractiveProgressRing percent={progress.overall_progress} completed={progress.completed} total={progress.assigned} size={110} stroke={10} label="Team Progress" />
          </div>

          {/* Row 1: KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="pro-card p-4 text-center">
              <div className="text-xs text-gray-500 font-semibold uppercase">Assigned</div>
              <div className="text-2xl font-extrabold text-gray-900 mt-1">{progress.assigned}</div>
            </div>
            <div className="pro-card p-4 text-center">
              <div className="text-xs text-gray-500 font-semibold uppercase">In Progress</div>
              <div className="text-2xl font-extrabold text-blue-600 mt-1">{progress.in_progress}</div>
            </div>
            <div className="pro-card p-4 text-center">
              <div className="text-xs text-gray-500 font-semibold uppercase">Pending Review</div>
              <div className="text-2xl font-extrabold text-purple-600 mt-1">{progress.pending_review}</div>
            </div>
            <div className="pro-card p-4 text-center">
              <div className="text-xs text-gray-500 font-semibold uppercase">Completed</div>
              <div className="text-2xl font-extrabold text-emerald-600 mt-1">{progress.completed}</div>
            </div>
            <div className="pro-card p-4 text-center col-span-2 md:col-span-1">
              <div className="text-xs text-gray-500 font-semibold uppercase">Open Blockers</div>
              <div className={`text-2xl font-extrabold mt-1 ${progress.open_blockers > 0 ? 'text-rose-600' : 'text-gray-900'}`}>
                {progress.open_blockers}
              </div>
            </div>
          </div>

          {/* Row 2 & Row 3: Interactive Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Task Status Donut Chart */}
            <div className="pro-card p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Task Status Distribution</h3>
              <InteractiveTaskDonut
                completed={task_distribution.completed}
                inProgress={task_distribution.in_progress}
                pendingReview={task_distribution.pending_review}
                todo={task_distribution.todo}
              />
            </div>

            {/* 7-Day Work Trend Line/Bar Chart */}
            <div className="pro-card p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2">7-Day Completion & Activity Trend</h3>
              <p className="text-xs text-gray-500 mb-4">Historical record from work_state_history repository.</p>
              <InteractiveWorkTrendChart trend={work_trend} />
            </div>
          </div>

          {/* Row 4: Breakdown Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="pro-card p-4">
              <div className="text-xs font-semibold text-gray-500">Goals Progress</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{breakdowns.goals_completed} / {breakdowns.goals_total}</div>
              <div className="text-[11px] text-gray-400 mt-1">Goals Completed</div>
            </div>
            <div className="pro-card p-4">
              <div className="text-xs font-semibold text-gray-500">Daily Work Submissions</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{breakdowns.daily_submissions_count}</div>
              <div className="text-[11px] text-gray-400 mt-1">Total Submissions</div>
            </div>
            <div className="pro-card p-4">
              <div className="text-xs font-semibold text-gray-500">Active Projects</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{breakdowns.projects_count}</div>
              <div className="text-[11px] text-gray-400 mt-1">Project Containers</div>
            </div>
            <div className="pro-card p-4">
              <div className="text-xs font-semibold text-gray-500">Blockers Attention</div>
              <div className="text-xl font-bold text-rose-600 mt-1">{breakdowns.open_blockers}</div>
              <div className="text-[11px] text-gray-400 mt-1">Require Assistance</div>
            </div>
          </div>

          {/* Row 5: Team Members Section */}
          <div className="pro-card p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Team Members Work Progress ({members.length})</h3>
            <div className="space-y-3">
              {members.map((m: any) => (
                <div key={m.user_id} className="p-4 bg-gray-50 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.full_name} src={m.avatar_url} size="md" />
                    <div>
                      <div className="font-bold text-sm text-gray-900">{m.full_name}</div>
                      <div className="text-xs text-gray-500">@{m.username} • Role: <span className="capitalize text-gray-700 font-semibold">{m.role}</span></div>
                    </div>
                  </div>

                  <div className="flex-1 max-w-md space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-gray-600">Work Progress</span>
                      <span className="text-indigo-600">{m.progress_percent}% ({m.completed_tasks}/{m.assigned_tasks} tasks)</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${m.progress_percent}%` }}></div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (params.classId) {
                        navigate(`/analytics/classes/${params.classId}/teams/${team_info.team_id}/members/${m.user_id}`);
                      } else {
                        navigate(`/analytics/teams/${team_info.team_id}/members/${m.user_id}`);
                      }
                    }}
                    className="btn-secondary text-xs py-1.5"
                  >
                    View Member Analytics →
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // LEVEL 2: CLASS ANALYTICS VIEW
  // ---------------------------------------------------------------------------
  if (params.classId && classData) {
    const { class_info, metrics, team_comparison } = classData;

    return (
      <div className="min-h-screen bg-gray-50 pb-12">
        {/* Breadcrumb Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 text-xs shadow-xs">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 flex-wrap text-gray-600 font-medium">
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/analytics" className="hover:text-indigo-600 font-semibold">Analytics</Link>
              <span className="text-gray-400">/</span>
              <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded font-bold">{class_info.class_name}</span>
            </div>

            <button onClick={() => navigate('/analytics')} className="btn-secondary text-xs py-1">
              ⬅️ Back to Analytics
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          {/* Class Header Card */}
          <div className="pro-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center font-bold text-xl shadow-xs">
                  🎓
                </div>
                <div>
                  <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{class_info.class_name}</h1>
                  <p className="text-sm text-gray-500 mt-0.5">{class_info.description || 'Classroom Aggregate Analytics'}</p>
                </div>
              </div>
              <div className="text-xs text-gray-500 pt-2">
                Class Owner: <strong className="text-gray-800">{class_info.owner_name}</strong>
              </div>
            </div>

            <InteractiveProgressRing percent={metrics.overall_progress} completed={metrics.completed_tasks} total={metrics.assigned_tasks} size={110} stroke={10} label="Class Progress" />
          </div>

          {/* Class Metrics Strip */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="pro-card p-4 text-center">
              <div className="text-xs text-gray-500 font-semibold uppercase">Total Teams</div>
              <div className="text-2xl font-extrabold text-gray-900 mt-1">{metrics.total_teams}</div>
            </div>
            <div className="pro-card p-4 text-center">
              <div className="text-xs text-gray-500 font-semibold uppercase">Total Members</div>
              <div className="text-2xl font-extrabold text-gray-900 mt-1">{metrics.total_members}</div>
            </div>
            <div className="pro-card p-4 text-center">
              <div className="text-xs text-gray-500 font-semibold uppercase">Assigned Tasks</div>
              <div className="text-2xl font-extrabold text-gray-900 mt-1">{metrics.assigned_tasks}</div>
            </div>
            <div className="pro-card p-4 text-center">
              <div className="text-xs text-gray-500 font-semibold uppercase">Completed</div>
              <div className="text-2xl font-extrabold text-emerald-600 mt-1">{metrics.completed_tasks}</div>
            </div>
            <div className="pro-card p-4 text-center">
              <div className="text-xs text-gray-500 font-semibold uppercase">Pending Review</div>
              <div className="text-2xl font-extrabold text-purple-600 mt-1">{metrics.pending_review}</div>
            </div>
            <div className="pro-card p-4 text-center">
              <div className="text-xs text-gray-500 font-semibold uppercase">Open Blockers</div>
              <div className={`text-2xl font-extrabold mt-1 ${metrics.open_blockers > 0 ? 'text-rose-600' : 'text-gray-900'}`}>
                {metrics.open_blockers}
              </div>
            </div>
          </div>

          {/* Team Comparison Grid */}
          <div className="pro-card p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Teams in {class_info.class_name} ({team_comparison.length})</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {team_comparison.map((team: any) => (
                <div key={team.team_id} className="p-5 border border-gray-200 rounded-2xl bg-white hover:border-indigo-400 transition-all space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-base text-gray-900">{team.team_name}</h4>
                      <p className="text-xs text-gray-500">{team.member_count} Members • {team.assigned_tasks} Tasks</p>
                    </div>
                    <span className="text-sm font-extrabold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">
                      {team.progress_percent}% Progress
                    </span>
                  </div>

                  <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${team.progress_percent}%` }}></div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <div className="flex gap-3">
                      <span className="text-emerald-700 font-semibold">Done: {team.completed_tasks}</span>
                      <span className="text-blue-700 font-semibold">Active: {team.in_progress}</span>
                      {team.open_blockers > 0 && <span className="text-rose-600 font-bold">⚠️ {team.open_blockers} Blockers</span>}
                    </div>

                    <button
                      onClick={() => navigate(`/analytics/classes/${class_info.class_id}/teams/${team.team_id}`)}
                      className="text-indigo-600 font-bold hover:underline"
                    >
                      View Team Analytics →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // LEVEL 1: ANALYTICS LANDING PAGE
  // ---------------------------------------------------------------------------
  const ownedClasses = scopesData?.ownedClasses || [];
  const myTeams = scopesData?.myTeams || [];
  const hasOwnedClasses = ownedClasses.length > 0;
  const hasMyTeams = myTeams.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Analytics</h1>
            <p className="text-sm text-gray-600 mt-1">Understand progress across your authorized work, teams and classes.</p>
          </div>

          {/* Role & Access Aware Scope Tabs */}
          <div className="flex gap-2 bg-gray-100 p-1.5 rounded-xl text-xs font-bold flex-wrap">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'overview' ? 'bg-white text-indigo-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
            >
              My Overview
            </button>

            <button
              onClick={() => setActiveTab('progress')}
              className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'progress' ? 'bg-white text-indigo-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
            >
              My Progress
            </button>

            {hasOwnedClasses && (
              <button
                onClick={() => setActiveTab('classes')}
                className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'classes' ? 'bg-white text-indigo-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
              >
                My Classes ({ownedClasses.length})
              </button>
            )}

            {hasMyTeams && (
              <button
                onClick={() => setActiveTab('teams')}
                className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'teams' ? 'bg-white text-indigo-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
              >
                My Teams ({myTeams.length})
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* SECTION 1: MY CLASSES (Visible for Class Owners) */}
        {(activeTab === 'classes' || (activeTab === 'overview' && hasOwnedClasses)) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Your Owned Classes</h2>
              <span className="text-xs text-gray-500 font-medium">{ownedClasses.length} Authorized Classes</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ownedClasses.map((cls: any) => (
                <motion.div
                  key={cls.class_id}
                  whileHover={{ y: -4 }}
                  className="pro-card p-6 space-y-4 flex flex-col justify-between border border-gray-200 hover:border-indigo-500 transition-all"
                >
                  <div className="space-y-2">
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center font-bold text-lg">
                      🎓
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{cls.class_name}</h3>
                    <p className="text-xs text-gray-500 line-clamp-2">{cls.description || 'Classroom Aggregate Overview'}</p>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-400">Owner Scoped</span>
                    <button
                      onClick={() => navigate(`/analytics/classes/${cls.class_id}`)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1"
                    >
                      <span>View Class Analytics</span>
                      <span>→</span>
                    </button>
                  </div>
                </motion.div>
              ))}

              {ownedClasses.length === 0 && (
                <div className="col-span-3 pro-card p-8 text-center text-gray-500">
                  You do not currently own any classrooms.
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 2: MY TEAMS (Visible for Members / Leaders) */}
        {(activeTab === 'teams' || (activeTab === 'overview' && hasMyTeams)) && (
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Your Authorized Teams</h2>
              <span className="text-xs text-gray-500 font-medium">{myTeams.length} Teams</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {myTeams.map((team: any) => (
                <motion.div
                  key={team.team_id}
                  whileHover={{ y: -4 }}
                  className="pro-card p-6 space-y-4 flex flex-col justify-between border border-gray-200 hover:border-indigo-500 transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center font-bold text-lg">
                        👥
                      </div>
                      <span className="badge badge-blue capitalize">{team.role}</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{team.team_name}</h3>
                    <p className="text-xs text-gray-500 capitalize">{team.team_type || 'Main'} team context</p>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-400">Team Scoped</span>
                    <button
                      onClick={() => navigate(`/analytics/teams/${team.team_id}`)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1"
                    >
                      <span>View Team Analytics</span>
                      <span>→</span>
                    </button>
                  </div>
                </motion.div>
              ))}

              {myTeams.length === 0 && (
                <div className="col-span-3 pro-card p-8 text-center text-gray-500">
                  You are not currently a member of any teams.
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 3: MY PROGRESS (Visible for Overview / Personal Progress) */}
        {(activeTab === 'progress' || activeTab === 'overview') && (
          <div className="space-y-4 pt-4">
            <div className="pro-card p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-2xl font-bold mx-auto">
                👤
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Personal Work Progress</h2>
              <p className="text-sm text-gray-600 max-w-md mx-auto">
                View your personal assigned tasks, goal progress, and work history analytics.
              </p>
              <button
                onClick={() => navigate(`/analytics/members/${user?.user_id}`)}
                className="btn-primary"
              >
                Open My Personal Analytics →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
