import React, { useEffect, useState, useCallback } from 'react';
import {
  getWorkActivityTimeline,
  TimelineResponse,
  TimelineEvent,
  TimelineArtifactInfo,
} from '../services/timelineService';

export interface WorkActivityTimelineProps {
  artifactType: 'task' | 'goal' | 'blocker';
  artifactId: string;
  title?: string;
  onClose?: () => void;
}

export const WorkActivityTimeline: React.FC<WorkActivityTimelineProps> = ({
  artifactType,
  artifactId,
  title: initialTitle,
  onClose,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<TimelineArtifactInfo | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<{
    beforeTimestamp: string;
    beforeHistoryId: string;
  } | null>(null);

  const fetchTimeline = useCallback(
    async (isInitial = true, cursorToUse?: { beforeTimestamp: string; beforeHistoryId: string }) => {
      if (isInitial) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      try {
        const data: TimelineResponse = await getWorkActivityTimeline(
          artifactType,
          artifactId,
          cursorToUse
        );

        setArtifact(data.artifact);
        setNextCursor(data.next_cursor);

        if (isInitial) {
          setEvents(data.events || []);
        } else {
          setEvents((prev) => {
            const existingIds = new Set(prev.map((e) => e.history_id));
            const newEvents = (data.events || []).filter((e) => !existingIds.has(e.history_id));
            return [...prev, ...newEvents];
          });
        }
      } catch (err: any) {
        const msg = err.response?.data?.error || err.message || 'Failed to load activity timeline';
        setError(msg);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [artifactType, artifactId]
  );

  useEffect(() => {
    fetchTimeline(true);
  }, [fetchTimeline]);

  const handleLoadMore = () => {
    if (nextCursor && !loadingMore) {
      fetchTimeline(false, nextCursor);
    }
  };

  const getArtifactIcon = (type: string) => {
    switch (type) {
      case 'task':
        return '📋';
      case 'goal':
        return '🎯';
      case 'blocker':
        return '🚨';
      default:
        return '⚡';
    }
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      data-testid="work-activity-timeline"
      className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-5 max-w-2xl w-full text-slate-900 mx-auto overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
        <div className="flex items-center space-x-3">
          <span className="text-2xl" role="img" aria-label={artifactType}>
            {getArtifactIcon(artifactType)}
          </span>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80 uppercase tracking-wider">
                {artifactType} Timeline
              </span>
              {artifact?.context_status === 'deleted' && (
                <span
                  data-testid="deleted-context-warning"
                  className="text-xs font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200"
                >
                  Linked work is no longer available
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-1">
              {artifact?.title || initialTitle || `${artifactType} History`}
            </h3>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            data-testid="timeline-close-btn"
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close timeline"
          >
            ✕
          </button>
        )}
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto max-h-[60vh] pr-1 space-y-4">
        {loading ? (
          <div data-testid="timeline-loading" className="py-8 text-center space-y-3">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="text-sm text-slate-600">Loading work activity story...</p>
          </div>
        ) : error ? (
          <div data-testid="timeline-error" className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm flex flex-col items-center space-y-3">
            <p>{error}</p>
            <button
              onClick={() => fetchTimeline(true)}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <div data-testid="timeline-empty" className="py-10 text-center text-slate-500">
            <p className="text-sm font-medium">No recorded activity for this work item yet.</p>
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {events.map((event) => (
              <div
                key={event.history_id}
                data-testid={`timeline-event-${event.history_id}`}
                className="relative flex flex-col space-y-1 bg-slate-50/60 p-3.5 rounded-xl border border-slate-200/80 hover:bg-white transition-colors shadow-2xs"
              >
                {/* Bullet node */}
                <div className="absolute -left-6 top-4 w-3 h-3 rounded-full border-2 border-indigo-600 bg-white" />

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-800">
                    {event.actor?.full_name || event.actor?.username || 'System / User'}
                  </span>
                  <span>{formatTimestamp(event.created_at)}</span>
                </div>

                <p className="text-sm font-medium text-slate-900">{event.description}</p>

                {/* Safe State Diff Badges */}
                {event.change_summary && (
                  <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-200/60 text-xs">
                    {event.change_summary.status && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Status: {event.change_summary.status.from || 'None'} → {event.change_summary.status.to || 'Updated'}
                      </span>
                    )}
                    {event.change_summary.progress && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Progress: {event.change_summary.progress.from ?? '0'}% → {event.change_summary.progress.to ?? '100'}%
                      </span>
                    )}
                    {event.change_summary.guidance_status && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        Guidance: {event.change_summary.guidance_status}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Load More Button */}
        {nextCursor && !loading && (
          <div className="pt-3 text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              data-testid="timeline-load-more"
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 disabled:opacity-50 text-slate-800 rounded-lg text-xs font-medium transition-colors"
            >
              {loadingMore ? 'Loading older activity...' : 'Load Previous Activity'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkActivityTimeline;
