import React, { useState } from 'react';
import { GuidanceItem, updateGuidanceStatus } from '../services/guidanceService';

interface GuidanceBannerProps {
  guidanceList: GuidanceItem[];
  currentUserId?: string;
  onStatusUpdated?: () => void;
}

export const GuidanceBanner: React.FC<GuidanceBannerProps> = ({
  guidanceList,
  currentUserId,
  onStatusUpdated,
}) => {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!guidanceList || guidanceList.length === 0) return null;

  const handleStatusChange = async (guidanceId: string, status: 'acknowledged' | 'resolved') => {
    setUpdatingId(guidanceId);
    setError(null);

    try {
      await updateGuidanceStatus(guidanceId, status);
      if (onStatusUpdated) onStatusUpdated();
    } catch (err: any) {
      console.error('Failed to update guidance status:', err);
      const backendMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to update status';
      setError(backendMsg);
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (status: GuidanceItem['status']) => {
    switch (status) {
      case 'open':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'acknowledged':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'resolved':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  return (
    <div className="space-y-3 my-3" data-testid="guidance-banner-container">
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-2.5" data-testid="guidance-banner-error">
          <span>⚠️ {error}</span>
        </div>
      )}

      {guidanceList.map((g) => {
        const isRecipient = currentUserId && g.recipient_id === currentUserId;
        const isAuthor = currentUserId && g.author_id === currentUserId;
        const canAck = (isRecipient || !g.recipient_id) && g.status === 'open';
        const canResolve = (isRecipient || isAuthor || !g.recipient_id) && g.status !== 'resolved';

        return (
          <div
            key={g.guidance_id}
            className={`border rounded-lg p-3 text-xs transition-all ${
              g.status === 'open'
                ? 'bg-amber-50/70 border-amber-200 shadow-sm'
                : g.status === 'acknowledged'
                ? 'bg-blue-50/70 border-blue-200'
                : 'bg-emerald-50/50 border-emerald-200 opacity-80'
            }`}
            data-testid={`guidance-banner-${g.guidance_id}`}
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-800 flex items-center gap-1">
                  <span>🎯 Guidance</span>
                  {g.author_name && <span className="text-slate-500 font-normal">from {g.author_name}</span>}
                </span>

                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${getStatusBadge(g.status)}`}>
                  {g.status}
                </span>

                {g.context_status === 'deleted' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                    Context Deleted
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {canAck && (
                  <button
                    onClick={() => handleStatusChange(g.guidance_id, 'acknowledged')}
                    disabled={updatingId === g.guidance_id}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                    data-testid={`ack-guidance-btn-${g.guidance_id}`}
                  >
                    {updatingId === g.guidance_id ? 'Updating...' : 'Acknowledge'}
                  </button>
                )}

                {canResolve && (
                  <button
                    onClick={() => handleStatusChange(g.guidance_id, 'resolved')}
                    disabled={updatingId === g.guidance_id}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                    data-testid={`resolve-guidance-btn-${g.guidance_id}`}
                  >
                    {updatingId === g.guidance_id ? 'Updating...' : 'Mark Resolved'}
                  </button>
                )}
              </div>
            </div>

            <p className="text-slate-900 font-medium whitespace-pre-wrap leading-relaxed">
              {g.message}
            </p>

            <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
              <span>
                Issued: {new Date(g.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {g.acknowledged_at && (
                <span>Acknowledged: {new Date(g.acknowledged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
              {g.resolved_at && (
                <span>Resolved: {new Date(g.resolved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default GuidanceBanner;
