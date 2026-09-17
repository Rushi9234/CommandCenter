import React, { useState } from 'react';
import StatusBadge from './common/StatusBadge';
import WorkActivityTimeline from './WorkActivityTimeline';
import * as api from '../services/api';

export interface TaskItem {
  task_id: string;
  project_id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  deadline?: string;
  owner?: string;
  reviewer?: string;
  reviewer_user?: { full_name: string; username: string } | null;
  goal_id?: string;
  goal_title?: string;
  created_at: string;
}

export interface AssignedToMeSectionProps {
  tasks: TaskItem[];
  onRefresh?: () => void;
}

export const AssignedToMeSection: React.FC<AssignedToMeSectionProps> = ({ tasks, onRefresh }) => {
  const [selectedTimelineTask, setSelectedTimelineTask] = useState<TaskItem | null>(null);
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);

  const handleSubmitForReview = async (taskId: string) => {
    if (!window.confirm('Submit this task for review by your assigned reviewer?')) return;

    setSubmittingTaskId(taskId);
    try {
      await api.submitTaskForReview(taskId);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to submit task for review:', err);
      alert('Failed to submit task for review');
    } finally {
      setSubmittingTaskId(null);
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="pro-card p-6 text-center space-y-2 bg-slate-50/50" data-testid="assigned-to-me-empty">
        <div className="text-3xl">📋</div>
        <h4 className="font-bold text-gray-800 text-sm">No Work Assigned to You</h4>
        <p className="text-xs text-gray-500">Tasks assigned to you by your team leader or class coordinator will appear here.</p>
      </div>
    );
  }

  return (
    <div className="pro-card p-6 space-y-4" data-testid="assigned-to-me-section">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div>
          <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
            <span>🎯 Assigned to Me</span>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-bold border border-indigo-100">
              {tasks.length} {tasks.length === 1 ? 'Item' : 'Items'}
            </span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Authorized work assigned for your execution and review</p>
        </div>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {tasks.map((t) => {
          const isPendingReview = t.status === 'review' || t.status === 'submitted_for_review';
          const isDone = t.status === 'done';

          return (
            <div
              key={t.task_id}
              className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                isPendingReview
                  ? 'bg-amber-50/40 border-amber-200'
                  : isDone
                  ? 'bg-emerald-50/40 border-emerald-200'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-900 text-sm">{t.title}</span>
                  <StatusBadge status={t.status} />
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                    {t.priority || 'medium'}
                  </span>
                  {(t.goal_title || t.goal_id) && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                      <span>🎯 Goal:</span>
                      <span>{t.goal_title || 'Linked Goal'}</span>
                    </span>
                  )}
                </div>

                {t.description && (
                  <p className="text-xs text-gray-600 line-clamp-2">{t.description}</p>
                )}

                <div className="flex items-center gap-4 text-[11px] text-gray-500 pt-1 flex-wrap">
                  {t.reviewer_user && (
                    <span>
                      Reviewer: <strong className="text-gray-700">{t.reviewer_user.full_name}</strong>
                    </span>
                  )}
                  {t.deadline && (
                    <span>
                      Due: <strong className="text-gray-700">{new Date(t.deadline).toLocaleDateString()}</strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  onClick={() => setSelectedTimelineTask(t)}
                  className="px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all"
                >
                  ⏳ Timeline
                </button>

                {!isDone && !isPendingReview && (
                  <button
                    onClick={() => handleSubmitForReview(t.task_id)}
                    disabled={submittingTaskId === t.task_id}
                    className="px-3.5 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm shadow-indigo-600/20 transition-all disabled:opacity-50"
                  >
                    {submittingTaskId === t.task_id ? 'Submitting...' : 'Submit for Review 📤'}
                  </button>
                )}

                {isPendingReview && (
                  <span className="text-xs font-semibold text-amber-700 bg-amber-100/70 border border-amber-300 px-3 py-1 rounded-lg">
                    Awaiting Reviewer Sign-Off ⏳
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedTimelineTask && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <WorkActivityTimeline
            artifactType="task"
            artifactId={selectedTimelineTask.task_id}
            title={selectedTimelineTask.title}
            onClose={() => setSelectedTimelineTask(null)}
          />
        </div>
      )}
    </div>
  );
};

export default AssignedToMeSection;
