import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';
import pulseService, { PulseItem } from '../services/pulseService';
import ClassroomCoordinatorDashboard from '../components/ClassroomCoordinatorDashboard';
import TeamLeaderWorklogDashboard from '../components/TeamLeaderWorklogDashboard';
import MemberDetailView from '../components/MemberDetailView';
import AssignWorkModal from '../components/AssignWorkModal';

export interface ClassOverviewCardData {
  class_id: string;
  class_name: string;
  description: string | null;
  total_teams: number;
  total_members: number;
  total_tasks: number;
  completed_tasks: number;
  open_blockers: number;
  completion_rate: number;
  status_badge: string;
  badge_class: string;
}

// Inline SVG Icon Helpers matching project design system
const SVGFileText = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const SVGUsers = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const SVGFolderKanban = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const SVGTarget = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0-10C6.48 4 2 8.48 2 14s4.48 10 10 10 10-4.48 10-10S17.52 4 12 4zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
  </svg>
);

const SVGChevronRight = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const SVGClock = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const SVGSun = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const SVGArrowRight = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);

const SVGPlus = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

const SVGBarChart = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const SVGGraduationCap = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0112 20.055a11.952 11.952 0 01-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
  </svg>
);

const SVGUser = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return 'Just now';
  const now = new Date();
  const date = new Date(dateStr);
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function getInitials(name: string | null): string {
  if (!name) return 'CC';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
];

function getAvatarColorClass(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

export default function Overview() {
  const { user } = useAuth();
  const params = useParams<{ classId?: string; teamId?: string; memberId?: string }>();
  const navigate = useNavigate();

  // Root Overview state
  const [classesList, setClassesList] = useState<ClassOverviewCardData[]>([]);
  const [myTeams, setMyTeams] = useState<any[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<any[]>([]);
  const [myProjects, setMyProjects] = useState<any[]>([]);
  const [myGoals, setMyGoals] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<PulseItem[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Active Context Names for Breadcrumb Navigation
  const [activeClassName, setActiveClassName] = useState<string | null>(null);
  const [activeTeamName, setActiveTeamName] = useState<string | null>(null);
  const [activeMemberName, setActiveMemberName] = useState<string | null>(null);

  // Member Dashboard Data
  const [memberDetail, setMemberDetail] = useState<any | null>(null);
  const [memberTasks, setMemberTasks] = useState<any[]>([]);
  const [memberDailySubmissions, setMemberDailySubmissions] = useState<any[]>([]);
  const [memberBlockers, setMemberBlockers] = useState<any[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);

  // Assign Work Modal state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  // Role assertions
  const isOwnerOrCoordinator =
    user?.role === 'owner' ||
    user?.role === 'coordinator' ||
    myTeams.some((t) => t.team_type === 'classroom');

  useEffect(() => {
    loadRootData();
  }, [user?.user_id]);

  useEffect(() => {
    if (params.memberId && params.teamId) {
      loadMemberDashboardData(params.teamId, params.memberId);
    }
  }, [params.memberId, params.teamId]);

  const loadRootData = async () => {
    setLoadingOverview(true);
    setOverviewError(null);
    try {
      const teamsRes = await api.getMyTeams();
      const allMyTeams = teamsRes?.data?.data || [];
      setMyTeams(allMyTeams);

      let allMyProjects: any[] = [];
      try {
        const projRes = await api.getMyProjects();
        allMyProjects = projRes?.data?.data || [];
        setMyProjects(allMyProjects);
      } catch {
        setMyProjects([]);
      }

      try {
        if (typeof api.getGoals === 'function') {
          const goalsRes = await api.getGoals();
          setMyGoals(goalsRes?.data?.data || []);
        }
      } catch {
        setMyGoals([]);
      }

      // Load assigned tasks
      try {
        if (allMyProjects.length > 0 && typeof api.getProjectTasks === 'function') {
          const taskArrays = await Promise.all(
            allMyProjects.map((p: any) =>
              api.getProjectTasks(p.project_id).then((r: any) => r?.data?.data || []).catch(() => [])
            )
          );
          const allTasks = taskArrays.flat();
          const myAssigned = allTasks.filter((t: any) => t.owner === user?.user_id);
          setAssignedTasks(myAssigned);
        }
      } catch {
        setAssignedTasks([]);
      }

      // Load recent activity
      try {
        if (pulseService && typeof pulseService.getIndividualPulse === 'function') {
          const pulseRes = await pulseService.getIndividualPulse({ limit: 4 });
          if (pulseRes && Array.isArray(pulseRes.events)) {
            setRecentActivity(pulseRes.events);
          }
        }
      } catch {
        setRecentActivity([]);
      }

      // Filter classrooms
      const classrooms = allMyTeams.filter((t: any) => t.team_type === 'classroom');
      const classCards: ClassOverviewCardData[] = await Promise.all(
        classrooms.map(async (cls: any) => {
          try {
            const dashRes = await api.getContextDashboard(cls.team_id);
            const data = dashRes?.data?.data || {};
            const teams = data.teams || [];
            const summary = data.summary || {};

            const totalTasks = teams.reduce((acc: number, t: any) => acc + (t.task_progress?.total || 0), 0);
            const completedTasks = teams.reduce((acc: number, t: any) => acc + (t.task_progress?.completed || 0), 0);
            const openBlockers = teams.reduce((acc: number, t: any) => acc + (t.open_blocker_count || 0), 0);
            const totalMembers = teams.reduce((acc: number, t: any) => acc + (t.member_count || 0), 0);
            const rate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            let badge = 'On Track';
            let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            if (openBlockers > 1) {
              badge = 'At Risk';
              badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
            } else if (openBlockers > 0 || summary.needs_attention_count > 0) {
              badge = 'Needs Attention';
              badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
            }

            return {
              class_id: cls.team_id,
              class_name: cls.team_name,
              description: cls.description,
              total_teams: summary.total_teams || teams.length,
              total_members: totalMembers,
              total_tasks: totalTasks,
              completed_tasks: completedTasks,
              open_blockers: openBlockers,
              completion_rate: rate,
              status_badge: badge,
              badge_class: badgeClass,
            };
          } catch (err) {
            return {
              class_id: cls.team_id,
              class_name: cls.team_name,
              description: cls.description,
              total_teams: 0,
              total_members: 0,
              total_tasks: 0,
              completed_tasks: 0,
              open_blockers: 0,
              completion_rate: 0,
              status_badge: 'Active Context',
              badge_class: 'bg-slate-100 text-slate-700 border-slate-200',
            };
          }
        })
      );
      setClassesList(classCards);
    } catch (err: any) {
      console.error('Failed to load root overview data:', err);
      setOverviewError(err.response?.data?.error || 'Failed to load overview data');
    } finally {
      setLoadingOverview(false);
    }
  };

  const loadMemberDashboardData = async (teamId: string, memberId: string) => {
    setMemberLoading(true);
    try {
      const [membersRes, worklogRes] = await Promise.all([
        api.getTeamMembers(teamId),
        api.getWorklog(teamId),
      ]);

      const members = membersRes.data?.data || [];
      const worklog = worklogRes.data?.data || {};

      const targetMember = members.find((m: any) => m.user_id === memberId) ||
        worklog.member_summary?.find((m: any) => m.user_id === memberId);

      if (targetMember) {
        setActiveMemberName(targetMember.full_name || targetMember.username);
        setMemberDetail({
          user_id: targetMember.user_id,
          full_name: targetMember.full_name || targetMember.username,
          username: targetMember.username,
          role: targetMember.role || 'member',
          avatar_url: targetMember.avatar_url,
          tasks: targetMember.tasks || { assigned: 0, in_progress: 0, completed: 0, remaining: 0 },
        });
      }

      const tasks = (worklog.work_items?.tasks || []).filter((t: any) => t.owner === memberId);
      const submissions = (worklog.work_items?.daily_work_submissions || []).filter((s: any) => s.user_id === memberId);
      const blockers = (worklog.work_items?.blockers || []).filter((b: any) => b.user_id === memberId);

      setMemberTasks(tasks);
      setMemberDailySubmissions(submissions);
      setMemberBlockers(blockers);
    } catch (err) {
      console.error('Failed to load member dashboard data:', err);
    } finally {
      setMemberLoading(false);
    }
  };

  // Route context parameters
  const activeClassId = params.classId;
  const activeTeamId = params.teamId;
  const activeMemberId = params.memberId;

  // Header Time & Greeting Calculations
  const currentHour = new Date().getHours();
  const timeOfDay = currentHour < 12 ? 'morning' : currentHour < 18 ? 'afternoon' : 'evening';
  const userName = user?.full_name || user?.username || 'User';
  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Summary Metrics
  const inProgressTasksCount = assignedTasks.filter((t) => t.status === 'in_progress' || t.status === 'review').length;
  const totalMembersCount = myTeams.reduce((acc, t) => acc + (t.member_count || 1), 0);
  const activeProjectsCount = myProjects.filter((p) => p.status !== 'completed' && p.status !== 'archived').length;
  const onTrackGoalsCount = myGoals.filter((g) => g.status === 'in_progress' || g.status === 'approved' || g.status === 'active').length;

  return (
    <div className="min-h-screen bg-gray-50/50 space-y-6 pb-12" data-testid="overview-page">
      {/* 1. DEDICATED LIGHT SAAS BREADCRUMB HIERARCHY BAR */}
      <div className="bg-white border-b border-slate-200/80 px-6 py-3 text-xs shadow-2xs sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap font-medium text-slate-600">
            <Link
              to="/overview"
              className={`hover:text-blue-600 transition-colors flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                !activeClassId && !activeTeamId ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100' : 'text-slate-600'
              }`}
              data-testid="breadcrumb-overview"
            >
              <SVGBarChart className="w-4 h-4 text-blue-600 shrink-0" /> Overview
            </Link>

            {activeClassId && (
              <>
                <span className="text-slate-400 font-mono">/</span>
                <Link
                  to={`/classes/${activeClassId}`}
                  className={`hover:text-blue-600 transition-colors flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                    !activeTeamId ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100' : 'text-slate-700'
                  }`}
                  data-testid="breadcrumb-class"
                >
                  <SVGGraduationCap className="w-4 h-4 text-blue-600 shrink-0" /> {activeClassName || 'Classroom'}
                </Link>
              </>
            )}

            {activeTeamId && (
              <>
                <span className="text-slate-400 font-mono">/</span>
                <Link
                  to={activeClassId ? `/classes/${activeClassId}/teams/${activeTeamId}` : `/teams/${activeTeamId}`}
                  className={`hover:text-blue-600 transition-colors flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                    !activeMemberId ? 'bg-blue-50 text-blue-700 font-bold border border-blue-100' : 'text-slate-700'
                  }`}
                  data-testid="breadcrumb-team"
                >
                  <SVGUsers className="w-4 h-4 text-blue-600 shrink-0" /> {activeTeamName || 'Team'}
                </Link>
              </>
            )}

            {activeMemberId && (
              <>
                <span className="text-slate-400 font-mono">/</span>
                <span
                  className="bg-blue-50 text-blue-700 font-bold px-2.5 py-1 rounded-lg border border-blue-100 flex items-center gap-1.5"
                  data-testid="breadcrumb-member"
                >
                  <SVGUser className="w-4 h-4 text-blue-600 shrink-0" /> {activeMemberName || 'Member'}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAssignModalOpen(true)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all flex items-center gap-1.5 text-xs shadow-xs"
            >
              <SVGPlus className="w-4 h-4" />
              <span>Assign Work</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 space-y-6">
        {/* LEVEL 4: MEMBER DASHBOARD VIEW */}
        {activeMemberId && activeTeamId ? (
          memberLoading ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center text-slate-500 animate-pulse">
              Loading member dashboard details...
            </div>
          ) : memberDetail ? (
            <MemberDetailView
              member={memberDetail}
              teamName={activeTeamName || 'Team'}
              parentTeamName={activeClassName || undefined}
              tasks={memberTasks}
              dailySubmissions={memberDailySubmissions}
              blockers={memberBlockers}
              onBackToTeam={() =>
                navigate(activeClassId ? `/classes/${activeClassId}/teams/${activeTeamId}` : `/teams/${activeTeamId}`)
              }
            />
          ) : (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center text-rose-600 font-medium">
              Member details not found or access restricted.
            </div>
          )
        ) : /* LEVEL 3: TEAM DASHBOARD VIEW */
        activeTeamId ? (
          <TeamLeaderWorklogDashboard
            teamId={activeTeamId}
            teamName={activeTeamName || 'Team Dashboard'}
            parentTeamName={activeClassName || undefined}
            onBackToClassroom={
              activeClassId ? () => navigate(`/classes/${activeClassId}`) : undefined
            }
            onSelectMember={(mId) => {
              navigate(
                activeClassId
                  ? `/classes/${activeClassId}/teams/${activeTeamId}/members/${mId}`
                  : `/teams/${activeTeamId}/members/${mId}`
              );
            }}
          />
        ) : /* LEVEL 2: CLASS OVERVIEW VIEW */
        activeClassId ? (
          <ClassroomCoordinatorDashboard
            contextTeamId={activeClassId}
            onSelectTeam={(tId, tName) => {
              setActiveTeamName(tName);
              navigate(`/classes/${activeClassId}/teams/${tId}`);
            }}
          />
        ) : (
          /* LEVEL 1: ROOT OVERVIEW REDESIGNED SAAS DASHBOARD */
          <div className="space-y-6" data-testid="root-overview">
            {/* 1. GREETING & HEADER SECTION */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Good {timeOfDay}, {userName}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Here's what's happening across your workspace.
                </p>
              </div>

              <div className="flex items-center gap-3 self-start sm:self-center">
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap hidden md:inline">
                  {formattedDate}
                </span>
                <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs text-amber-800 shadow-2xs">
                  <SVGSun className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="font-medium">Small steps every day lead to big results.</span>
                </div>
              </div>
            </div>

            {/* 2. HIGH-LEVEL SUMMARY CARDS (1 ROW OF 4 CARDS) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* My Tasks Card */}
              <div
                onClick={() => navigate('/projects')}
                className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs hover:border-blue-300 hover:shadow-xs transition-all cursor-pointer group flex items-center justify-between"
                data-testid="summary-card-tasks"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
                    <SVGFileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-600">My Tasks</div>
                    <div className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
                      {assignedTasks.length}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {inProgressTasksCount} in progress
                    </div>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 flex items-center justify-center transition-all">
                  <SVGChevronRight className="w-4 h-4" />
                </div>
              </div>

              {/* My Teams Card */}
              <div
                onClick={() => navigate('/teams')}
                className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs hover:border-purple-300 hover:shadow-xs transition-all cursor-pointer group flex items-center justify-between"
                data-testid="summary-card-teams"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0">
                    <SVGUsers className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-600">My Teams</div>
                    <div className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
                      {myTeams.length}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {totalMembersCount} total members
                    </div>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 group-hover:bg-purple-50 group-hover:text-purple-600 flex items-center justify-center transition-all">
                  <SVGChevronRight className="w-4 h-4" />
                </div>
              </div>

              {/* My Projects Card */}
              <div
                onClick={() => navigate('/projects')}
                className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs hover:border-emerald-300 hover:shadow-xs transition-all cursor-pointer group flex items-center justify-between"
                data-testid="summary-card-projects"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
                    <SVGFolderKanban className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-600">My Projects</div>
                    <div className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
                      {myProjects.length}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {activeProjectsCount} active
                    </div>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 flex items-center justify-center transition-all">
                  <SVGChevronRight className="w-4 h-4" />
                </div>
              </div>

              {/* My Goals Card */}
              <div
                onClick={() => navigate('/goals')}
                className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs hover:border-rose-300 hover:shadow-xs transition-all cursor-pointer group flex items-center justify-between"
                data-testid="summary-card-goals"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0">
                    <SVGTarget className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-600">My Goals</div>
                    <div className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
                      {myGoals.length}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {onTrackGoalsCount} on track
                    </div>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 group-hover:bg-rose-50 group-hover:text-rose-600 flex items-center justify-center transition-all">
                  <SVGChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* CLASS OWNER / COORDINATOR CARDS (IF AUTHORIZED CLASSROOMS EXIST) */}
            {isOwnerOrCoordinator && (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 tracking-tight">MY CLASSES ({classesList.length})</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Authorized classrooms owned by you. Click any class to inspect sub-teams.</p>
                  </div>
                </div>

                {loadingOverview ? (
                  <div className="py-8 text-center text-slate-500 text-xs font-medium animate-pulse" data-testid="loading-classes">
                    Loading authorized classrooms...
                  </div>
                ) : overviewError ? (
                  <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
                    {overviewError}
                  </div>
                ) : classesList.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 space-y-1 text-xs" data-testid="empty-classes">
                    <p className="font-bold text-slate-700">No Authorized Classrooms Found</p>
                    <p className="text-slate-500">Create or join a classroom context to manage teams and assign work items.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="my-classes-grid">
                    {classesList.map((cls) => (
                      <div
                        key={cls.class_id}
                        onClick={() => {
                          setActiveClassName(cls.class_name);
                          navigate(`/classes/${cls.class_id}`);
                        }}
                        className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 space-y-3 cursor-pointer hover:border-blue-300 transition-all group"
                        data-testid={`class-card-${cls.class_id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">{cls.class_name}</h3>
                            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{cls.description || 'No description provided'}</p>
                          </div>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border whitespace-nowrap ${cls.badge_class}`}>
                            {cls.status_badge}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-2 text-center text-xs border-t border-b border-slate-200/60 py-2.5">
                          <div>
                            <div className="text-slate-400 text-[9px] uppercase font-semibold">Teams</div>
                            <div className="font-bold text-slate-900 mt-0.5">{cls.total_teams}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 text-[9px] uppercase font-semibold">Members</div>
                            <div className="font-bold text-slate-900 mt-0.5">{cls.total_members}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 text-[9px] uppercase font-semibold">Tasks</div>
                            <div className="font-bold text-blue-600 mt-0.5">{cls.total_tasks}</div>
                          </div>
                          <div>
                            <div className="text-slate-400 text-[9px] uppercase font-semibold">Blockers</div>
                            <div className={`font-bold mt-0.5 ${cls.open_blockers > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                              {cls.open_blockers}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="text-slate-500 font-medium">Class Progress</span>
                          <span className="font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                            Open Class →
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. MIDDLE SECTION: TWO COLUMNS (MY ASSIGNED TASKS + RECENT ACTIVITY) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: My Assigned Tasks (Summary Only) */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <SVGFileText className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-slate-900 tracking-tight">My Assigned Tasks</h2>
                        <p className="text-xs text-slate-500">Your latest assigned tasks across all teams and projects.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/projects')}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                    >
                      <span>View All</span>
                      <SVGArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {assignedTasks.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-xs space-y-1">
                      <SVGFileText className="w-8 h-8 mx-auto text-slate-300" />
                      <p className="font-medium text-slate-600">No assigned tasks found</p>
                      <p className="text-[11px]">Tasks assigned to you will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 mt-4">
                      {assignedTasks.slice(0, 4).map((task) => (
                        <div
                          key={task.task_id}
                          onClick={() => navigate(`/projects?projectId=${task.project_id}&taskId=${task.task_id}`)}
                          className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-3.5 hover:border-blue-300 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-blue-100/70 text-blue-600 flex items-center justify-center shrink-0 font-bold text-xs">
                              <SVGFileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                                {task.title}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                {task.project_name || 'Project'} • {task.team_name || 'Team'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                              task.priority === 'high'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : task.priority === 'medium'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              {task.priority || 'Medium'}
                            </span>
                            <span className="text-[11px] text-slate-400 whitespace-nowrap font-mono">
                              {task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Sep 19'}
                            </span>
                            <SVGChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Recent Activity (Summary Only) */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <SVGClock className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-slate-900 tracking-tight">Recent Activity</h2>
                        <p className="text-xs text-slate-500">Latest updates from your teams and projects.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/pulse')}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                    >
                      <span>View All</span>
                      <SVGArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {recentActivity.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-xs space-y-1">
                      <SVGClock className="w-8 h-8 mx-auto text-slate-300" />
                      <p className="font-medium text-slate-600">No recent activity</p>
                      <p className="text-[11px]">Recent team and project events will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 mt-4">
                      {recentActivity.slice(0, 4).map((item) => (
                        <div
                          key={item.history_id}
                          onClick={() => navigate('/pulse')}
                          className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-3.5 hover:border-blue-300 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 text-xs font-bold ${getAvatarColorClass(item.actor_name || 'User')}`}>
                              {getInitials(item.actor_name)}
                            </div>
                            <div className="min-w-0 text-xs">
                              <div className="text-slate-800 truncate">
                                <span className="font-bold text-slate-900">{item.actor_name || 'Someone'}</span>{' '}
                                <span className="text-slate-600">
                                  {item.event_type === 'completed' ? 'completed' : item.event_type === 'submitted' ? 'submitted' : 'updated'}
                                </span>{' '}
                                <span className="font-semibold text-slate-900">{item.artifact_title || 'item'}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                {item.project_name ? `${item.project_name} • ` : ''}{item.team_name}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-slate-400 whitespace-nowrap">
                              {formatRelativeTime(item.created_at)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 4. BOTTOM SECTION: THREE SUMMARY CARDS ROW (ACTIVE PROJECTS, MY TEAMS, MY GOALS) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Active Projects Summary Card */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <SVGFolderKanban className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 tracking-tight">Active Projects</h2>
                      <p className="text-[11px] text-slate-500">Projects you're part of.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/projects')}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                  >
                    <span>View All</span>
                    <SVGArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {myProjects.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-xs">
                    No active projects.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myProjects.slice(0, 3).map((p) => {
                      const percent = p.progress_percent || (p.status === 'completed' ? 100 : p.status === 'in_progress' ? 60 : 40);
                      return (
                        <div
                          key={p.project_id}
                          onClick={() => navigate(`/projects?projectId=${p.project_id}`)}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-7 h-7 rounded-lg bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0">
                              <SVGFolderKanban className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                              {p.project_name}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 w-28 shrink-0">
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-bold text-slate-600 w-8 text-right font-mono">
                              {percent}%
                            </span>
                            <SVGChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* My Teams Summary Card */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                      <SVGUsers className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 tracking-tight">My Teams</h2>
                      <p className="text-[11px] text-slate-500">Teams you're part of.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/teams')}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                  >
                    <span>View All</span>
                    <SVGArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {myTeams.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-xs">
                    No teams joined.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myTeams.slice(0, 3).map((t) => (
                      <div
                        key={t.team_id}
                        onClick={() => navigate(`/teams/${t.team_id}`)}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-purple-100/70 text-purple-700 flex items-center justify-center shrink-0">
                            <SVGUsers className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                              {t.team_name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {t.member_count || 1} members
                            </div>
                          </div>
                        </div>

                        <SVGChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* My Goals Summary Card */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                      <SVGTarget className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 tracking-tight">My Goals</h2>
                      <p className="text-[11px] text-slate-500">Your goal progress.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/goals')}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                  >
                    <span>View All</span>
                    <SVGArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {myGoals.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-xs">
                    No active goals.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myGoals.slice(0, 3).map((g) => {
                      const percent = g.progress_percent || (g.status === 'completed' || g.status === 'approved' ? 100 : 60);
                      return (
                        <div
                          key={g.goal_id}
                          onClick={() => navigate(`/goals?goalId=${g.goal_id}`)}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-7 h-7 rounded-lg bg-rose-100/70 text-rose-700 flex items-center justify-center shrink-0">
                              <SVGTarget className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                              {g.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 w-28 shrink-0">
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-bold text-slate-600 w-8 text-right font-mono">
                              {percent}%
                            </span>
                            <SVGChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Assign Work Modal */}
      <AssignWorkModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        onSuccess={loadRootData}
        classId={activeClassId}
        teamId={activeTeamId}
        teams={myTeams}
      />
    </div>
  );
}
