import React, { useState } from 'react';
import { createGuidance } from '../services/guidanceService';

interface ProvideGuidanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  contextType: 'task' | 'goal' | 'blocker';
  contextId: string;
  contextTitle?: string;
  teamId?: string;
  recipientId?: string;
  recipientName?: string;
  onGuidanceSent?: () => void;
}

export const ProvideGuidanceModal: React.FC<ProvideGuidanceModalProps> = ({
  isOpen,
  onClose,
  contextType,
  contextId,
  contextTitle,
  teamId,
  recipientId,
  recipientName,
  onGuidanceSent,
}) => {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || message.trim().length < 3) {
      setError('Guidance message must be at least 3 characters.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createGuidance({
        contextType,
        contextId,
        teamId,
        recipientId,
        message: message.trim(),
      });
      setMessage('');
      if (onGuidanceSent) onGuidanceSent();
      onClose();
    } catch (err: any) {
      console.error('Failed to issue guidance:', err);
      const backendErr = err.response?.data?.error || err.response?.data?.message || 'Failed to issue guidance.';
      setError(backendErr);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 overflow-hidden"
      data-testid="provide-guidance-modal"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-lg w-full max-h-[calc(100vh-64px)] flex flex-col overflow-hidden transition-all animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex-shrink-0 bg-slate-50 text-slate-900 px-5 py-4 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <div>
              <h3 className="font-bold text-base text-slate-900">Provide Actionable Guidance</h3>
              <p className="text-xs text-slate-500">
                Context: <span className="capitalize font-semibold text-indigo-600">{contextType}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-lg font-bold p-1 rounded transition-colors"
            data-testid="close-modal-btn"
          >
            ✕
          </button>
        </div>

        {/* Content Form Wrapper */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-3" data-testid="guidance-error">
                <span>⚠️ {error}</span>
              </div>
            )}

            {contextTitle && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 block mb-0.5">
                  Underlying Item
                </span>
                <p className="text-sm font-semibold text-slate-900">{contextTitle}</p>
              </div>
            )}

            {recipientName && (
              <div className="flex items-center gap-2 text-xs text-slate-600 bg-blue-50 border border-blue-100 p-2.5 rounded-lg">
                <span className="font-semibold text-blue-900">Direct Recipient:</span>
                <span className="bg-white px-2 py-0.5 rounded border border-blue-200 font-medium text-blue-800">
                  👤 {recipientName}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Guidance Message <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Provide clear, actionable steps or feedback to unblock or align work..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors min-h-[80px]"
                required
                data-testid="guidance-message-input"
              />
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Must be concise and coordination-focused.</span>
                <span>{message.length}/2000</span>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex-shrink-0 flex items-center justify-end gap-3 p-4 border-t border-slate-100 bg-slate-50/50">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !message.trim()}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              data-testid="submit-guidance-btn"
            >
              {submitting ? 'Sending...' : 'Issue Guidance →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProvideGuidanceModal;
