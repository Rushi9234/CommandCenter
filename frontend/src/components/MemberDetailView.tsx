import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from './common/Avatar';
import StatusBadge from './common/StatusBadge';
import { WorkActivityTimeline } from './WorkActivityTimeline';

export interface MemberTask {
  task_id: string;
  project_id: string;
  project_name: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  created_at: string;
  completed_at: string | null;
}

export interface MemberDailySubmission {
  submission_id: string;
  work_date: string;
  confirmed_summary: string;
  confirmed_at: string;
}

export interface MemberBlocker {
  blocker_id: string;
  title: string;
  description: string | null;
  urgency: string | null;
  status: string;
  created_at: string;
}

export interface MemberDetailInfo {
  user_id: string;
  full_name: string;
  username: string;
  role: string;
  avatar_url?: string | null;
  tasks: {
    assigned: number;
    in_progress: number;
    completed: number;
    remaining: number;
  };
}

interface MemberDetailViewProps {
  member: MemberDetailInfo;
  teamName: string;
  parentTeamName?: string;
  tasks: MemberTask[];
  dailySubmissions: MemberDailySubmission[];
  blockers: MemberBlocker[];
  onBackToTeam: () => void;
}

export default function MemberDetailView({
  member,
  teamName,
  parentTeamName,
  tasks,
  dailySubmissions,
  blockers,
  onBackToTeam,
}: MemberDetailViewProps) {
  const [selectedArtifactForTimeline, setSelectedArtifactForTimeline] = useState<{
    type: 'task' | 'goal' | 'blocker';
    id: string;
    title: string;
  } | null>(null);

  const totalAssigned = member.tasks.assigned || tasks.length;
  const completedCount = member.tasks.completed || tasks.filter((t) => t.status === 'completed' || t.status === 'done').length;
  const inProgressCount = member.tasks.in_progress || tasks.filter((t) => t.status === 'in_progress').length;
  const remainingCount = member.tasks.remaining || (totalAssigned - completedCount);
  const completionRate = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0;

  // Determine authorized work status
  let statusBadge = '🟢 On Track';
  let statusBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (totalAssigned === 0 && dailySubmissions.length === 0) {
    statusBadge = '⚪ No Active Tasks';
    statusBadgeClass = 'bg-gray-100 text-gray-700 border-gray-200';
  } else if (blockers.some((b) => b.status === 'open')) {
    statusBadge = '🚨 Open Blocker';
    statusBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
  } else if (remainingCount > completedCount) {
    statusBadge = '⏳ Pending Work';
    statusBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
  }

  return (
    <div className="space-y-6" data-testid="member-detail-view">
      {/* 1. BREADCRUMB NAVIGATION BAR */}
      <div
        className="flex items-center justify-between bg-white text-gray-700 border border-gray-200 rounded-xl p-3.5 shadow-xs text-xs"
        data-testid="member-breadcrumb"
      >
        <div className="flex items-center gap-2 flex-wrap font-medium">
          {parentTeamName && (
            <>
              <span className="text-gray-600 font-semibold">🏫 {parentTeamName}</span>
              <span className="text-gray-400 font-mono">/</span>
            </>
          )}
          <span className="text-gray-700 font-semibold">👥 {teamName}</span>
          <span className="text-gray-400 font-mono">/</span>
          <span className="text-indigo-700 font-bold bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100">
            👤 {member.full_name}
          </span>
        </div>

        <button
          onClick={onBackToTeam}
          className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs border border-gray-200"
        >
          ⬅️ Back to Team View
        </button>
      </div>

      {/* 2. MEMBER HEADER CARD */}
      <div className="pro-card p-6 bg-white border border-gray-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={member.full_name} src={member.avatar_url} size="lg" />
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900">{member.full_name}</h2>
              <span className="text-xs text-gray-500 font-mono">@{member.username}</span>
              <span className="badge badge-blue capitalize">{member.role}</span>
              <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${statusBadgeClass}`}>
                {statusBadge}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Member of <strong className="text-gray-700">{teamName}</strong> • Real domain work context
            </p>
          </div>
        </div>

        <div className="text-xs text-gray-500 bg-gray-50 px-3.5 py-2 rounded-xl border border-gray-200">
          🛡️ <span className="font-semibold text-gray-700">Privacy Guarantee:</span> Displaying authorized work tasks & activity logs only. Zero productivity ranking or employee surveillance.
        </div>
      </div>

      {/* 3. SUMMARY KPI CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="pro-card p-5 bg-white border border-gray-200">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Assigned Tasks</div>
          <div className="text-3xl font-extrabold text-gray-900">{totalAssigned}</div>
          <div className="text-xs text-gray-500 mt-1">Total tasks in team projects</div>
        </div>

        <div className="pro-card p-5 bg-white border border-gray-200">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Completed</div>
          <div className="text-3xl font-extrabold text-emerald-600">{completedCount}</div>
          <div className="text-xs text-emerald-700 mt-1">Successfully finished</div>
        </div>

        <div className="pro-card p-5 bg-white border border-gray-200">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">In Progress / Pending</div>
          <div className="text-3xl font-extrabold text-blue-600">{inProgressCount + remainingCount}</div>
          <div className="text-xs text-blue-700 mt-1">
            {inProgressCount} active • {remainingCount} open
          </div>
        </div>

        <div className="pro-card p-5 bg-white border border-gray-200">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Completion Rate</div>
          <div className="text-3xl font-extrabold text-indigo-600">{completionRate}%</div>
          <div className="w-full bg-gray-100 rounded-full h-2 mt-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* 4. ASSIGNED WORK TABLE */}
      <div className="pro-card p-6 bg-white border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Assigned Tasks & Projects</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Tasks assigned to or contributed to by {member.full_name} in team projects.
            </p>
          </div>
          <span className="badge badge-gray">{tasks.length} Task{tasks.length === 1 ? '' : 's'}</span>
        </div>

        {tasks.length === 0 ? (
          <div className="py-10 text-center text-gray-500" data-testid="no-tasks-assigned">
            <span className="text-3xl block mb-2">📋</span>
            <p className="font-semibold text-sm text-gray-800">No Tasks Assigned</p>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
              There are no tasks assigned to this member in active team projects.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-600 uppercase font-semibold">
                  <th className="py-3 px-4">Task Name</th>
                  <th className="py-3 px-4">Project</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Timeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tasks.map((t) => (
                  <tr key={t.task_id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-gray-900">
                      {t.title}
                      {t.description && <p className="text-[11px] text-gray-500 font-normal line-clamp-1">{t.description}</p>}
                    </td>
                    <td className="py-3 px-4 text-gray-700">{t.project_name}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                        t.priority === 'high' ? 'bg-rose-100 text-rose-800' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() =>
                          setSelectedArtifactForTimeline({
                            type: 'task',
                            id: t.task_id,
                            title: t.title,
                          })
                        }
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-semibold transition-colors inline-flex items-center gap-1"
                      >
                        ⏳ View Timeline
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. DAILY WORK SUBMISSIONS & SOS BLOCKERS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Work Submissions */}
        <div className="pro-card p-6 bg-white border border-gray-200 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              📝 <span>Confirmed Daily Work</span>
            </h3>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
              {dailySubmissions.length} Submissions
            </span>
          </div>

          {dailySubmissions.length === 0 ? (
            <p className="text-xs text-gray-500 py-6 text-center">No confirmed daily submissions found for this member.</p>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {dailySubmissions.map((s) => (
                <div key={s.submission_id} className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl text-xs space-y-1">
                  <div className="font-semibold text-emerald-950">{s.confirmed_summary}</div>
                  <div className="text-[11px] text-emerald-700 flex items-center justify-between">
                    <span>Date: {new Date(s.work_date).toLocaleDateString()}</span>
                    <span>Confirmed {new Date(s.confirmed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SOS Blockers Reported */}
        <div className="pro-card p-6 bg-white border border-gray-200 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              🚨 <span>SOS Blockers Reported</span>
            </h3>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
              blockers.length > 0 ? 'bg-rose-100 text-rose-800' : 'bg-gray-100 text-gray-700'
            }`}>
              {blockers.length} Blocker{blockers.length === 1 ? '' : 's'}
            </span>
          </div>

          {blockers.length === 0 ? (
            <p className="text-xs text-gray-500 py-6 text-center">Zero SOS blockers reported by this member.</p>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {blockers.map((b) => (
                <div key={b.blocker_id} className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl text-xs flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-rose-950">{b.title}</div>
                    <div className="text-[11px] text-rose-700 mt-0.5">
                      Urgency: <strong className="capitalize">{b.urgency || 'normal'}</strong> • Reported {new Date(b.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={b.status} />
                    <button
                      onClick={() =>
                        setSelectedArtifactForTimeline({
                          type: 'blocker',
                          id: b.blocker_id,
                          title: b.title,
                        })
                      }
                      className="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded font-semibold text-[11px] transition-colors"
                    >
                      Timeline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 6. WORK ACTIVITY TIMELINE MODAL OVERLAY */}
      <AnimatePresence>
        {selectedArtifactForTimeline && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedArtifactForTimeline(null);
            }}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl shadow-2xl bg-white"
            >
              <WorkActivityTimeline
                artifactType={selectedArtifactForTimeline.type}
                artifactId={selectedArtifactForTimeline.id}
                title={selectedArtifactForTimeline.title}
                onClose={() => setSelectedArtifactForTimeline(null)}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
