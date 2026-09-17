import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';
import ClassroomCoordinatorDashboard from '../components/ClassroomCoordinatorDashboard';
import TeamLeaderWorklogDashboard from '../components/TeamLeaderWorklogDashboard';
import MemberDetailView from '../components/MemberDetailView';
import AssignedToMeSection from '../components/AssignedToMeSection';
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

export default function Overview() {
  const { user } = useAuth();
  const params = useParams<{ classId?: string; teamId?: string; memberId?: string }>();
  const navigate = useNavigate();

  // Root Overview state
  const [classesList, setClassesList] = useState<ClassOverviewCardData[]>([]);
  const [myTeams, setMyTeams] = useState<any[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<any[]>([]);
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

  const isTeamLeader = user?.role === 'lead' || user?.role === 'admin';

  useEffect(() => {
    loadRootData();
  }, [user]);

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
      const allMyTeams = teamsRes.data.data || [];
      setMyTeams(allMyTeams);

      // Filter classrooms
      const classrooms = allMyTeams.filter((t: any) => t.team_type === 'classroom');

      // Fetch dashboard metrics for each classroom
      const classCards: ClassOverviewCardData[] = await Promise.all(
        classrooms.map(async (cls: any) => {
          try {
            const dashRes = await api.getContextDashboard(cls.team_id);
            const data = dashRes.data.data;
            const teams = data.teams || [];
            const summary = data.summary || {};

            const totalTasks = teams.reduce((acc: number, t: any) => acc + (t.task_progress?.total || 0), 0);
            const completedTasks = teams.reduce((acc: number, t: any) => acc + (t.task_progress?.completed || 0), 0);
            const openBlockers = teams.reduce((acc: number, t: any) => acc + (t.open_blocker_count || 0), 0);
            const totalMembers = teams.reduce((acc: number, t: any) => acc + (t.member_count || 0), 0);
            const rate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            let badge = '🟢 On Track';
            let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            if (openBlockers > 1) {
              badge = '🔴 At Risk';
              badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
            } else if (openBlockers > 0 || summary.needs_attention_count > 0) {
              badge = '🟡 Needs Attention';
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
            console.error(`Failed to load context for classroom ${cls.team_id}:`, err);
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
              status_badge: '⚪ Active Context',
              badge_class: 'bg-gray-100 text-gray-700 border-gray-200',
            };
          }
        })
      );

      setClassesList(classCards);

      // Load assigned tasks for member view
      try {
        const projRes = await api.getMyProjects();
        const myProjects = projRes.data.data || [];
        const taskArrays = await Promise.all(
          myProjects.map((p: any) => api.getProjectTasks(p.project_id).then((r) => r.data.data || []).catch(() => []))
        );
        const allTasks = taskArrays.flat();
        const myAssigned = allTasks.filter((t: any) => t.owner === user?.user_id);
        setAssignedTasks(myAssigned);
      } catch (err) {
        console.error('Failed to load my assigned tasks:', err);
      }
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

      const members = membersRes.data.data || [];
      const worklog = worklogRes.data.data || {};

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

  // Extract Route Context Parameters
  const activeClassId = params.classId;
  const activeTeamId = params.teamId;
  const activeMemberId = params.memberId;

  // Total Aggregate Metrics across all owned classes
  const totalAggClasses = classesList.length;
  const totalAggTeams = classesList.reduce((acc, c) => acc + c.total_teams, 0);
  const totalAggMembers = classesList.reduce((acc, c) => acc + c.total_members, 0);
  const totalAggTasks = classesList.reduce((acc, c) => acc + c.total_tasks, 0);
  const totalAggCompleted = classesList.reduce((acc, c) => acc + c.completed_tasks, 0);
  const totalAggBlockers = classesList.reduce((acc, c) => acc + c.open_blockers, 0);
  const overallAggRate = totalAggTasks > 0 ? Math.round((totalAggCompleted / totalAggTasks) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 space-y-6 pb-12" data-testid="overview-page">
      {/* 1. DEDICATED LIGHT SAAS BREADCRUMB HIERARCHY BAR */}
      <div className="bg-white border-b border-gray-200 px-6 py-3.5 text-xs shadow-xs sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap font-medium text-gray-600">
            <Link
              to="/overview"
              className={`hover:text-indigo-600 transition-colors flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                !activeClassId && !activeTeamId ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100' : 'text-gray-600'
              }`}
              data-testid="breadcrumb-overview"
            >
              <span>📊</span> Overview
            </Link>

            {activeClassId && (
              <>
                <span className="text-gray-400 font-mono">/</span>
                <Link
                  to={`/classes/${activeClassId}`}
                  className={`hover:text-indigo-600 transition-colors flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                    !activeTeamId ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100' : 'text-gray-700'
                  }`}
                  data-testid="breadcrumb-class"
                >
                  <span>🎓</span> {activeClassName || 'Classroom'}
                </Link>
              </>
            )}

            {activeTeamId && (
              <>
                <span className="text-gray-400 font-mono">/</span>
                <Link
                  to={activeClassId ? `/classes/${activeClassId}/teams/${activeTeamId}` : `/teams/${activeTeamId}`}
                  className={`hover:text-indigo-600 transition-colors flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                    !activeMemberId ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100' : 'text-gray-700'
                  }`}
                  data-testid="breadcrumb-team"
                >
                  <span>👥</span> {activeTeamName || 'Team'}
                </Link>
              </>
            )}

            {activeMemberId && (
              <>
                <span className="text-gray-400 font-mono">/</span>
                <span
                  className="bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-lg border border-indigo-100 flex items-center gap-1.5"
                  data-testid="breadcrumb-member"
                >
                  <span>👤</span> {activeMemberName || 'Member'}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAssignModalOpen(true)}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all flex items-center gap-1.5 text-xs shadow-xs"
            >
              <span>+ Assign Work</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 space-y-6">
        {/* ----------------------------------------------------------------- */}
        {/* LEVEL 4: MEMBER DASHBOARD VIEW */}
        {/* ----------------------------------------------------------------- */}
        {activeMemberId && activeTeamId ? (
          memberLoading ? (
            <div className="pro-card p-12 text-center text-gray-500 animate-pulse">
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
            <div className="pro-card p-8 text-center text-rose-600 font-medium">
              Member details not found or access restricted.
            </div>
          )
        ) : /* ----------------------------------------------------------------- */
        /* LEVEL 3: TEAM DASHBOARD VIEW */
        /* ----------------------------------------------------------------- */
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
        ) : /* ----------------------------------------------------------------- */
        /* LEVEL 2: CLASS OVERVIEW VIEW */
        /* ----------------------------------------------------------------- */
        activeClassId ? (
          <ClassroomCoordinatorDashboard
            contextTeamId={activeClassId}
            onSelectTeam={(tId, tName) => {
              setActiveTeamName(tName);
              navigate(`/classes/${activeClassId}/teams/${tId}`);
            }}
          />
        ) : (
          /* ----------------------------------------------------------------- */
          /* LEVEL 1: ROOT OVERVIEW DASHBOARD */
          /* ----------------------------------------------------------------- */
          <div className="space-y-6" data-testid="root-overview">
            {/* Header & Role Badge */}
            <div className="pro-card p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-2xl">🏛️</span>
                    <h1 className="text-2xl font-bold text-gray-900">CommandCenter Overview</h1>
                    <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-0.5 rounded-full font-bold">
                      {isOwnerOrCoordinator ? 'Class Owner Console' : isTeamLeader ? 'Team Leader Console' : 'Member Portal'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Organizational work transparency & real-time KPI overview across authorized classrooms and teams.
                  </p>
                </div>
              </div>

              {/* KPI Summary Cards */}
              {isOwnerOrCoordinator && (
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div className="bg-slate-50 border border-gray-200 rounded-xl p-4">
                    <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">My Classes</div>
                    <div className="text-2xl font-black text-gray-900 mt-1">{totalAggClasses}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Classrooms owned</div>
                  </div>

                  <div className="bg-slate-50 border border-gray-200 rounded-xl p-4">
                    <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Total Teams</div>
                    <div className="text-2xl font-black text-gray-900 mt-1">{totalAggTeams}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Active sub-teams</div>
                  </div>

                  <div className="bg-slate-50 border border-gray-200 rounded-xl p-4">
                    <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Total Members</div>
                    <div className="text-2xl font-black text-gray-900 mt-1">{totalAggMembers}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Enrolled students</div>
                  </div>

                  <div className="bg-slate-50 border border-gray-200 rounded-xl p-4">
                    <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Active Work</div>
                    <div className="text-2xl font-black text-indigo-600 mt-1">{totalAggTasks}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{totalAggCompleted} completed</div>
                  </div>

                  <div className="bg-slate-50 border border-gray-200 rounded-xl p-4">
                    <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Open Blockers</div>
                    <div className={`text-2xl font-black mt-1 ${totalAggBlockers > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {totalAggBlockers}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Reported SOS</div>
                  </div>

                  <div className="bg-slate-50 border border-gray-200 rounded-xl p-4">
                    <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Completion Rate</div>
                    <div className="text-2xl font-black text-emerald-600 mt-1">{overallAggRate}%</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Class progress</div>
                  </div>
                </div>
              )}
            </div>

            {/* CLASS OWNER VIEW: MY CLASSES CARDS GRID */}
            {isOwnerOrCoordinator && (
              <div className="pro-card p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">MY CLASSES ({classesList.length})</h2>
                    <p className="text-xs text-gray-500">Authorized classrooms owned by you. Click any class to inspect sub-teams.</p>
                  </div>
                </div>

                {loadingOverview ? (
                  <div className="py-12 text-center text-gray-500 font-medium animate-pulse" data-testid="loading-classes">
                    Loading your authorized classes...
                  </div>
                ) : overviewError ? (
                  <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
                    {overviewError}
                  </div>
                ) : classesList.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 space-y-2" data-testid="empty-classes">
                    <span className="text-3xl block">🏫</span>
                    <h3 className="font-bold text-gray-900 text-base">No Authorized Classrooms Found</h3>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto">
                      Create or join a classroom context to manage teams and assign work items.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="my-classes-grid">
                    {classesList.map((cls) => (
                      <div
                        key={cls.class_id}
                        onClick={() => {
                          setActiveClassName(cls.class_name);
                          navigate(`/classes/${cls.class_id}`);
                        }}
                        className="pro-card-hover p-5 border border-gray-200 rounded-2xl bg-white space-y-4 cursor-pointer hover:border-indigo-400 shadow-sm transition-all"
                        data-testid={`class-card-${cls.class_id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-gray-900 text-base">{cls.class_name}</h3>
                            <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{cls.description || 'No description provided'}</p>
                          </div>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${cls.badge_class}`}>
                            {cls.status_badge}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-2 text-center text-xs border-t border-b border-gray-100 py-3">
                          <div>
                            <div className="text-gray-400 text-[10px] uppercase font-semibold">Teams</div>
                            <div className="font-black text-gray-900 mt-0.5">{cls.total_teams}</div>
                          </div>
                          <div>
                            <div className="text-gray-400 text-[10px] uppercase font-semibold">Members</div>
                            <div className="font-black text-gray-900 mt-0.5">{cls.total_members}</div>
                          </div>
                          <div>
                            <div className="text-gray-400 text-[10px] uppercase font-semibold">Tasks</div>
                            <div className="font-black text-indigo-600 mt-0.5">{cls.total_tasks}</div>
                          </div>
                          <div>
                            <div className="text-gray-400 text-[10px] uppercase font-semibold">Blockers</div>
                            <div className={`font-black mt-0.5 ${cls.open_blockers > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                              {cls.open_blockers}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-gray-600">
                            <span>Class Progress</span>
                            <span className="font-bold text-indigo-600">{cls.completion_rate}%</span>
                          </div>
                          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${cls.completion_rate}%` }} />
                          </div>
                        </div>

                        <div className="pt-2 flex items-center justify-between text-xs border-t border-gray-100">
                          <span className="text-gray-400 font-mono text-[11px]">Real DB Data</span>
                          <span className="font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                            Open Class →
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TEAM LEADER VIEW: MY TEAM QUICK CARD */}
            {!isOwnerOrCoordinator && isTeamLeader && (
              <div className="pro-card p-6 space-y-4">
                <h2 className="text-lg font-bold text-gray-900">MY TEAM</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myTeams.map((t) => (
                    <div
                      key={t.team_id}
                      onClick={() => navigate(`/teams/${t.team_id}`)}
                      className="p-5 border border-gray-200 rounded-2xl bg-white hover:border-indigo-400 cursor-pointer transition-all space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-gray-900 text-base">👥 {t.team_name}</h3>
                        <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-semibold">Team Leader</span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2">{t.description || 'Authorized team workspace'}</p>
                      <div className="pt-2 flex justify-end">
                        <span className="text-xs font-bold text-indigo-600">Open Team Dashboard →</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MEMBER VIEW: ASSIGNED WORK */}
            {!isOwnerOrCoordinator && !isTeamLeader && (
              <AssignedToMeSection tasks={assignedTasks} onRefresh={loadRootData} />
            )}
          </div>
        )
      }
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
