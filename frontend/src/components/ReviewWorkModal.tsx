import React, { useState } from 'react';
import * as api from '../services/api';
import StatusBadge from './common/StatusBadge';
import WorkActivityTimeline from './WorkActivityTimeline';

export interface ReviewWorkModalProps {
  task: any | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ReviewWorkModal: React.FC<ReviewWorkModalProps> = ({
  task,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [showChangesForm, setShowChangesForm] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  if (!isOpen || !task) return null;

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.approveTask(task.task_id);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to approve task:', err);
      setError(err.response?.data?.error || 'Failed to approve task');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide feedback on required changes');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.requestTaskChanges(task.task_id, reason.trim());
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to request changes:', err);
      setError(err.response?.data?.error || 'Failed to request changes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6 overflow-hidden" data-testid="review-work-modal">
      <div className="bg-white border border-gray-200 rounded-2xl max-w-lg w-full max-h-[calc(100vh-64px)] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between border-b border-gray-100 p-4 sm:p-5 bg-white">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Review Work Item</h2>
              <StatusBadge status={task.status} />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Review work artifacts submitted by team member</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1 rounded-lg hover:bg-gray-100 transition-all"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-medium">
              {error}
            </div>
          )}

          {/* Task Details */}
          <div className="bg-slate-50 p-4 rounded-xl border border-gray-200 space-y-3">
            <h3 className="font-bold text-base text-gray-900">{task.title}</h3>
            {task.description && (
              <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{task.description}</p>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2 text-xs border-t border-gray-200">
              <div>
                <span className="text-gray-500">Assignee:</span>{' '}
                <span className="font-semibold text-gray-800">{task.owner_user?.full_name || 'Team Member'}</span>
              </div>
              <div>
                <span className="text-gray-500">Priority:</span>{' '}
                <span className="font-semibold uppercase text-indigo-600">{task.priority || 'medium'}</span>
              </div>
              {task.deadline && (
                <div>
                  <span className="text-gray-500">Deadline:</span>{' '}
                  <span className="font-medium text-gray-800">{new Date(task.deadline).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setShowTimeline(true)}
              className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
            >
              📜 Inspect Task History & Timeline
            </button>
          </div>

          {/* Form for Requesting Changes */}
          {showChangesForm && (
            <form onSubmit={handleRequestChanges} id="changes-form" className="space-y-3 pt-2 border-t border-gray-100">
              <label className="block text-xs font-bold text-amber-900">
                Reason for Changes Requested *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain what needs adjustment before approval..."
                className="w-full text-sm border border-amber-300 rounded-lg p-2.5 min-h-[72px] bg-amber-50/50 resize-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </form>
          )}
        </div>

        {/* Fixed Footer Actions */}
        <div className="flex-shrink-0 flex items-center justify-end gap-3 p-4 border-t border-gray-100 bg-gray-50/50">
          {showChangesForm ? (
            <>
              <button
                type="button"
                onClick={() => setShowChangesForm(false)}
                className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="changes-form"
                disabled={loading || !reason.trim()}
                className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-md transition-all disabled:opacity-50"
              >
                {loading ? 'Submitting...' : 'Send Feedback & Request Changes'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowChangesForm(true)}
                disabled={loading}
                className="px-4 py-2 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl transition-all disabled:opacity-50"
              >
                ⚠️ Request Changes
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={loading}
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
              >
                {loading ? 'Approving...' : '✅ Approve Work'}
              </button>
            </>
          )}
        </div>
      </div>

      {showTimeline && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <WorkActivityTimeline
            artifactType="task"
            artifactId={task.task_id}
            title={task.title}
            onClose={() => setShowTimeline(false)}
          />
        </div>
      )}
    </div>
  );
};

export default ReviewWorkModal;
