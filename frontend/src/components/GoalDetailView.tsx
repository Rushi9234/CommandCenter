import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import * as api from '../services/api';
import StatusBadge from './common/StatusBadge';
import WorkActivityTimeline from './WorkActivityTimeline';

export interface GoalDetailViewProps {
  goalId: string;
  onClose: () => void;
}

export const GoalDetailView: React.FC<GoalDetailViewProps> = ({ goalId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evidenceData, setEvidenceData] = useState<any>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchEvidence();
  }, [goalId]);

  const fetchEvidence = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getGoalEvidence(goalId);
      setEvidenceData(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load goal evidence');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveCreation = async () => {
    setActionLoading(true);
    try {
      await api.approveGoalCreation(goalId);
      await fetchEvidence();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to approve goal creation');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectCreation = async () => {
    if (!confirm('Are you sure you want to reject this team goal proposal?')) return;
    setActionLoading(true);
    try {
      await api.rejectGoalCreation(goalId);
      await fetchEvidence();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to reject goal creation');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitForReview = async () => {
    setActionLoading(true);
    try {
      await api.submitGoalForReview(goalId);
      await fetchEvidence();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to submit goal for review');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveReview = async () => {
    setActionLoading(true);
    try {
      await api.approveGoal(goalId);
      await fetchEvidence();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to approve goal review');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReturnGoal = async () => {
    setActionLoading(true);
    try {
      await api.returnGoal(goalId);
      await fetchEvidence();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to return goal for changes');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl">
          <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-gray-600">Loading goal evidence & linked tasks...</p>
        </div>
      </div>
    );
  }

  if (error || !evidenceData) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
          <h3 className="text-lg font-bold text-red-600 mb-2">Error Loading Goal</h3>
          <p className="text-sm text-gray-600 mb-4">{error || 'Goal data not found'}</p>
          <button onClick={onClose} className="btn-secondary w-full py-2">
            Close
          </button>
        </div>
      </div>
    );
  }

  const { goal, linked_tasks = [], evidence = [], progress_summary = {} } = evidenceData;
  const progressPercent = progress_summary.progress ?? goal.progress ?? 0;

  const filteredEvidence = evidence.filter((item: any) => {
    if (activeCategoryFilter === 'ALL') return true;
    return item.category === activeCategoryFilter;
  });

  const getTaskStatusIcon = (status: string) => {
    switch (status) {
      case 'done':
      case 'completed':
        return <span className="text-emerald-600 font-bold" title="Approved / Verified Completion">✓</span>;
      case 'review':
      case 'submitted_for_review':
        return <span className="text-blue-600 font-bold" title="Pending Review (In Flight)">◐</span>;
      case 'blocked':
        return <span className="text-rose-600 font-bold" title="Blocked">⚠</span>;
      case 'changes_requested':
        return <span className="text-amber-600 font-bold" title="Changes Requested">🔄</span>;
      default:
        return <span className="text-gray-400 font-bold" title="Assigned / Active">○</span>;
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'VERIFIED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'IN_FLIGHT':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'BLOCKED':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl my-8 overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-200 text-slate-900 p-6 shrink-0 flex items-start justify-between">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                Goal Detail
              </span>
              <StatusBadge status={goal.status} />

              {goal.creation_status === 'pending_approval' && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-semibold" data-testid="goal-creation-pending-badge">
                  ⏳ Proposed (Pending Approval)
                </span>
              )}
              {goal.creation_status === 'rejected' && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-300 font-semibold">
                  ❌ Proposal Rejected
                </span>
              )}
              {goal.status === 'pending_review' && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-300 font-semibold" data-testid="goal-pending-review-badge">
                  ◐ Pending Review
                </span>
              )}

              {progress_summary.mode && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  Mode: {progress_summary.mode === 'tasks' ? 'Linked Tasks' : progress_summary.mode === 'sub_goals' ? 'Sub-Goals' : 'Manual'}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{goal.title}</h2>
            {goal.description && (
              <p className="text-sm text-slate-600 line-clamp-2">{goal.description}</p>
            )}
            {goal.created_by_name && (
              <p className="text-xs text-slate-500">
                Created by <strong className="text-slate-800">{goal.created_by_name}</strong>
                {goal.submitted_by_name && <span> • Submitted for review by <strong className="text-slate-800">{goal.submitted_by_name}</strong></span>}
                {goal.approved_by_name && <span> • Approved by <strong className="text-slate-800">{goal.approved_by_name}</strong></span>}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-lg hover:bg-slate-200/60 text-xl font-bold"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Progress Banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex-1 w-full space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">Verified Goal Progress</span>
                <span className="font-bold text-indigo-600 text-base">{progressPercent}%</span>
              </div>
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden border border-slate-300/50">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-600">
                {progress_summary.mode === 'tasks' ? (
                  <>
                    <span>Verified Completed: <strong>{progress_summary.completed}</strong></span>
                    <span>Total Linked Tasks: <strong>{progress_summary.total}</strong></span>
                    {progress_summary.pending_review > 0 && (
                      <span className="text-blue-600 font-medium">
                        ◐ {progress_summary.pending_review} In-Flight (Pending Review)
                      </span>
                    )}
                  </>
                ) : (
                  <span>Derived from {progress_summary.mode === 'sub_goals' ? 'sub-goal hierarchy' : 'manual updates'}</span>
                )}
                {goal.target_date && (
                  <span className="ml-auto">📅 Target: {new Date(goal.target_date).toLocaleDateString()}</span>
                )}
              </div>
            </div>

            <button
              onClick={() => setShowTimeline(true)}
              className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
              data-testid="view-goal-timeline-btn"
            >
              <span>📜</span>
              <span>Full Timeline</span>
            </button>
          </div>

          {/* Linked Tasks Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>🔗</span> Linked Tasks ({linked_tasks.length})
              </h3>
              <span className="text-xs text-gray-500">
                Approved work derives goal progress
              </span>
            </div>

            {linked_tasks.length === 0 ? (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-center text-sm text-gray-500">
                No tasks directly linked to this goal yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl bg-white overflow-hidden shadow-xs">
                {linked_tasks.map((task: any) => (
                  <div
                    key={task.task_id}
                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 text-sm">
                        {getTaskStatusIcon(task.status)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{task.title}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                          {task.owner_name && <span>Owner: {task.owner_name}</span>}
                          {task.reviewer_name && <span>• Reviewer: {task.reviewer_name}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={task.status} size="sm" />
                      {task.status === 'done' && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded border border-emerald-200">
                          VERIFIED
                        </span>
                      )}
                      {(task.status === 'review' || task.status === 'submitted_for_review') && (
                        <span className="text-[10px] bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded border border-blue-200">
                          IN FLIGHT
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Evidence Feed Section */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>🛡️</span> Verified Evidence Feed ({filteredEvidence.length})
              </h3>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                {['ALL', 'VERIFIED', 'IN_FLIGHT', 'BLOCKED'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      activeCategoryFilter === cat
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {filteredEvidence.length === 0 ? (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-center text-sm text-gray-500">
                No evidence events recorded matching filter.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {filteredEvidence.map((ev: any) => (
                  <div
                    key={ev.history_id}
                    className="p-3 bg-slate-50/50 border border-slate-200 rounded-xl text-xs space-y-1.5 hover:bg-white transition-colors"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${getCategoryBadgeClass(ev.category)}`}>
                          {ev.category}
                        </span>
                        <span className="font-semibold text-slate-800 capitalize">
                          {ev.artifact_type}: {ev.event_type.replace(/_/g, ' ')}
                        </span>
                        {ev.is_deleted && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                            [Task Deleted]
                          </span>
                        )}
                      </div>
                      <span className="text-gray-400 text-[11px]">
                        {new Date(ev.created_at).toLocaleString()}
                      </span>
                    </div>

                    {ev.new_state?.title && (
                      <p className="text-slate-700 font-medium">{ev.new_state.title}</p>
                    )}

                    {ev.new_state?.notes && (
                      <p className="text-gray-600 italic">"{ev.new_state.notes}"</p>
                    )}

                    {ev.new_state?.reason && (
                      <p className="text-amber-700 italic">Reason: {ev.new_state.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {goal.creation_status === 'pending_approval' && (goal.my_team_role === 'owner' || goal.my_team_role === 'admin') && (
              <>
                <button
                  onClick={handleApproveCreation}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                  data-testid="approve-goal-creation-btn"
                >
                  ✓ Approve Goal Proposal
                </button>
                <button
                  onClick={handleRejectCreation}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                  data-testid="reject-goal-creation-btn"
                >
                  ✕ Reject Proposal
                </button>
              </>
            )}

            {goal.status === 'pending_review' && (goal.my_team_role === 'owner' || goal.my_team_role === 'admin') && (
              <>
                <button
                  onClick={handleApproveReview}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                  data-testid="approve-goal-review-btn"
                >
                  ✓ Approve Goal
                </button>
                <button
                  onClick={handleReturnGoal}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                  data-testid="return-goal-btn"
                >
                  🔄 Request Changes
                </button>
              </>
            )}

            {goal.team_id && goal.status !== 'completed' && goal.status !== 'pending_review' && goal.creation_status !== 'pending_approval' && goal.creation_status !== 'rejected' && (
              <button
                onClick={handleSubmitForReview}
                disabled={actionLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                data-testid="submit-goal-review-btn"
              >
                📤 Request Approval / Submit for Review
              </button>
            )}
          </div>

          <button onClick={onClose} className="btn-secondary px-5 py-2 text-sm">
            Close
          </button>
        </div>
      </motion.div>

      {/* Timeline Modal Overlay */}
      {showTimeline && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-60 p-4">
          <WorkActivityTimeline
            artifactType="goal"
            artifactId={goal.goal_id}
            title={goal.title}
            onClose={() => setShowTimeline(false)}
          />
        </div>
      )}
    </div>
  );
};

export default GoalDetailView;
