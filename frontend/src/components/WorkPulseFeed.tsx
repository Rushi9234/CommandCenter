import { useState, useEffect, useCallback } from 'react';
import { pulseService, PulseItem } from '../services/pulseService';
import Avatar from './common/Avatar';
import WorkActivityTimeline from './WorkActivityTimeline';

export interface WorkPulseFeedProps {
  scope: 'INDIVIDUAL' | 'TEAM' | 'CLASSROOM';
  teamId?: string;
  onNavigateToItem?: (item: PulseItem) => void;
}

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All Activity' },
  { id: 'task', label: 'Tasks' },
  { id: 'goal', label: 'Goals' },
  { id: 'blocker', label: 'Blockers' },
  { id: 'guidance', label: 'Guidance' },
];

export default function WorkPulseFeed({ scope, teamId, onNavigateToItem }: WorkPulseFeedProps) {
  const [events, setEvents] = useState<PulseItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimelineItem, setSelectedTimelineItem] = useState<PulseItem | null>(null);

  const fetchPulseEvents = useCallback(
    async (category?: string, cursor?: string, append = false) => {
      if (!append) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const catParam = category === 'all' ? undefined : category;
        let res;
        if (scope === 'TEAM' && teamId) {
          res = await pulseService.getTeamPulse(teamId, { category: catParam, cursor, limit: 15 });
        } else if (scope === 'CLASSROOM' && teamId) {
          res = await pulseService.getClassroomPulse(teamId, { category: catParam, cursor, limit: 15 });
        } else {
          res = await pulseService.getIndividualPulse({ category: catParam, cursor, limit: 15 });
        }

        setEvents((prev) => {
          if (!append) return res.events;
          const map = new Map<string, PulseItem>();
          for (const item of prev) map.set(item.history_id, item);
          for (const item of res.events) map.set(item.history_id, item);
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });

        setNextCursor(res.next_cursor);
      } catch (err: any) {
        console.error('Failed to load pulse feed:', err);
        setError(err.response?.data?.error || 'Failed to load work pulse events');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [scope, teamId]
  );

  useEffect(() => {
    fetchPulseEvents(activeCategory);
  }, [fetchPulseEvents, activeCategory]);

  const handleCategoryChange = (catId: string) => {
    setActiveCategory(catId);
  };

  const handleLoadMore = () => {
    if (nextCursor && !loadingMore) {
      fetchPulseEvents(activeCategory, nextCursor, true);
    }
  };

  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getEventBadge = (item: PulseItem) => {
    switch (item.event_type) {
      case 'completed':
        return { text: 'Completed', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'reopened':
        return { text: 'Reopened', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'status_changed':
        return { text: 'Status Change', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'progress_changed':
        return { text: 'Progress Update', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'created':
        return { text: 'Created', bg: 'bg-sky-50 text-sky-700 border-sky-200' };
      case 'resolved':
        return { text: 'Resolved', bg: 'bg-teal-50 text-teal-700 border-teal-200' };
      case 'guidance_created':
        return { text: 'Guidance Issued', bg: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'guidance_acknowledged':
        return { text: 'Guidance Ack', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'guidance_resolved':
        return { text: 'Guidance Resolved', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      default:
        return { text: item.event_type.replace(/_/g, ' '), bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  const renderStateDiff = (item: PulseItem) => {
    if (!item.previous_state && !item.new_state) return null;
    const prevStatus = item.previous_state?.status || item.previous_state?.guidance_status;
    const newStatus = item.new_state?.status || item.new_state?.guidance_status;
    const prevProgress = item.previous_state?.progress;
    const newProgress = item.new_state?.progress;

    if (prevProgress !== undefined && newProgress !== undefined && prevProgress !== newProgress) {
      return (
        <span className="text-xs font-mono text-slate-500">
          Progress: <span className="line-through">{prevProgress}%</span> → <span className="text-indigo-600 font-bold">{newProgress}%</span>
        </span>
      );
    }

    if (prevStatus && newStatus && prevStatus !== newStatus) {
      return (
        <span className="text-xs font-mono text-slate-500">
          Status: <span className="line-through">{prevStatus}</span> → <span className="text-blue-600 font-bold">{newStatus}</span>
        </span>
      );
    }

    return null;
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs text-slate-900 space-y-6" data-testid="work-pulse-feed">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 tracking-tight">
            <svg className="w-5 h-5 text-blue-600 inline shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Recent Activity</span>
            <span className="text-xs font-semibold text-slate-400">({scope} Context)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">See what's happening across your work, teams, and projects.</p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`px-3 py-1 text-xs rounded-xl font-bold transition-all ${
                activeCategory === cat.id
                  ? 'bg-blue-600 text-white shadow-xs shadow-blue-600/20'
                  : 'bg-slate-100/80 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Feed */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-slate-50 h-20 rounded-xl p-4 flex items-center gap-4 border border-slate-100">
              <div className="w-10 h-10 rounded-full bg-slate-200"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                <div className="h-3 bg-slate-200 rounded w-2/3"></div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => fetchPulseEvents(activeCategory)} className="text-xs bg-rose-100 hover:bg-rose-200 text-rose-800 px-3 py-1 rounded-lg font-bold">
            Retry
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <p className="text-sm font-bold text-slate-700">No recent work changes in this context</p>
          <p className="text-xs text-slate-500 mt-1">Work events will appear here as team members make progress.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
          {events.map((item) => {
            const badge = getEventBadge(item);
            const isDeleted = item.context_status === 'deleted';

            return (
              <div
                key={item.history_id}
                className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 hover:border-blue-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={item.actor_name || 'System'} src={item.actor_avatar || undefined} size="md" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{item.actor_name || 'Team Member'}</span>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${badge.bg}`}>
                        {badge.text}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {item.team_name} {item.project_name ? `› ${item.project_name}` : ''}
                      </span>
                    </div>

                    <div className="text-xs text-slate-700">
                      {isDeleted ? (
                        <span className="text-rose-500 italic text-xs">Linked work is no longer available</span>
                      ) : (
                        <span className="font-semibold text-slate-900">{item.artifact_title || `${item.artifact_type} #${item.artifact_id.substring(0, 8)}`}</span>
                      )}
                    </div>

                    {!isDeleted && renderStateDiff(item)}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <span className="text-xs text-slate-400 whitespace-nowrap">{formatTimestamp(item.created_at)}</span>
                  <button
                    onClick={() => setSelectedTimelineItem(item)}
                    data-testid={`view-timeline-${item.history_id}`}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg transition-all"
                  >
                    View Timeline
                  </button>
                  {!isDeleted && onNavigateToItem && (
                    <button
                      onClick={() => onNavigateToItem(item)}
                      className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 px-3 py-1.5 rounded-lg transition-all"
                    >
                      Open Target →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      {nextCursor && !loading && (
        <div className="text-center pt-2">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
          >
            {loadingMore ? 'Loading More Changes...' : 'Load More Changes ↓'}
          </button>
        </div>
      )}

      {/* Work Activity Timeline Modal */}
      {selectedTimelineItem &&
        (selectedTimelineItem.artifact_type === 'task' ||
          selectedTimelineItem.artifact_type === 'goal' ||
          selectedTimelineItem.artifact_type === 'blocker') && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <WorkActivityTimeline
              artifactType={selectedTimelineItem.artifact_type}
              artifactId={selectedTimelineItem.artifact_id}
              title={selectedTimelineItem.artifact_title || undefined}
              onClose={() => setSelectedTimelineItem(null)}
            />
          </div>
        )}
    </div>
  );
}
