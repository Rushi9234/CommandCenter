import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../services/api';
import ProvideGuidanceModal from './ProvideGuidanceModal';
import WorkActivityTimeline from './WorkActivityTimeline';

export interface ActionCenterEvidence {
  key: string;
  label: string;
  value: string;
}

export interface ActionCenterItem {
  id: string;
  signal_id?: string;
  category: 'BLOCKER' | 'STALLED_TASK' | 'OVERDUE_TASK' | 'REOPENED_WORK_FLAPPING' | 'GOAL_PROGRESS_STALLED' | 'GOAL_NEEDS_PROGRESS' | 'MISSING_DAILY_SUBMISSION' | 'PENDING_JOIN_REQUEST' | 'SUBTEAM_AT_RISK';
  urgency: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  reason: string;
  evidence: ActionCenterEvidence[];
  supports_timeline?: boolean;
  supports_guidance?: boolean;
  action: {
    label: string;
    route: string;
    params?: Record<string, any>;
  };
}

export interface ActionCenterData {
  scope: 'INDIVIDUAL' | 'TEAM' | 'CLASSROOM';
  attention_status: 'ON_TRACK' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'NO_ACTIVE_WORK';
  summary: string;
  total_action_items: number;
  items: ActionCenterItem[];
  signals?: any[];
}

interface Props {
  scope: 'INDIVIDUAL' | 'TEAM' | 'CLASSROOM';
  teamId?: string;
  title?: string;
}

export default function AttentionActionCenter({ scope, teamId, title }: Props) {
  const navigate = useNavigate();
  const [data, setData] = useState<ActionCenterData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [guidanceTarget, setGuidanceTarget] = useState<{
    isOpen: boolean;
    contextType: 'task' | 'goal' | 'blocker';
    contextId: string;
    contextTitle?: string;
    teamId?: string;
  } | null>(null);
  const [timelineTarget, setTimelineTarget] = useState<{
    isOpen: boolean;
    artifactType: 'task' | 'goal' | 'blocker';
    artifactId: string;
    title?: string;
  } | null>(null);

  useEffect(() => {
    loadAttentionData();
  }, [scope, teamId]);

  const loadAttentionData = async () => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (scope === 'INDIVIDUAL') {
        res = await api.getMyAttention();
      } else if (scope === 'TEAM' && teamId) {
        res = await api.getTeamAttentionDetails(teamId);
      } else if (scope === 'CLASSROOM' && teamId) {
        res = await api.getClassroomAttentionDetails(teamId);
      } else {
        setLoading(false);
        return;
      }
      setData(res?.data?.data || res?.data || null);
    } catch (err: any) {
      console.error('Failed to load Action Center data:', err);
      setError(err.response?.data?.error || 'Failed to load attention items');
    } finally {
      setLoading(false);
    }
  };

  const handleActionClick = (action: ActionCenterItem['action']) => {
    let target = action.route;
    if (action.params && Object.keys(action.params).length > 0) {
      const searchParams = new URLSearchParams();
      Object.entries(action.params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) searchParams.set(k, String(v));
      });
      target = `${action.route}?${searchParams.toString()}`;
    }
    navigate(target);
  };

  const handleOpenGuidance = (item: ActionCenterItem) => {
    let contextType: 'task' | 'goal' | 'blocker' | null = null;
    let contextId = item.id;

    if (item.category === 'BLOCKER') {
      contextType = 'blocker';
      if (item.action.params?.blockerId) contextId = item.action.params.blockerId;
    } else if (item.category === 'STALLED_TASK' || item.category === 'OVERDUE_TASK' || item.category === 'REOPENED_WORK_FLAPPING') {
      contextType = 'task';
      if (item.action.params?.taskId) contextId = item.action.params.taskId;
    } else if (item.category === 'GOAL_NEEDS_PROGRESS') {
      contextType = 'goal';
      if (item.action.params?.goalId) contextId = item.action.params.goalId;
    }

    if (!contextType) return;

    setGuidanceTarget({
      isOpen: true,
      contextType,
      contextId,
      contextTitle: item.title,
      teamId: item.action.params?.teamId || teamId,
    });
  };

  const handleOpenTimeline = (item: ActionCenterItem) => {
    let artifactType: 'task' | 'goal' | 'blocker' | null = null;
    let artifactId = item.id;

    if (item.category === 'BLOCKER') {
      artifactType = 'blocker';
      if (item.action.params?.blockerId) artifactId = item.action.params.blockerId;
    } else if (item.category === 'STALLED_TASK' || item.category === 'OVERDUE_TASK' || item.category === 'REOPENED_WORK_FLAPPING') {
      artifactType = 'task';
      if (item.action.params?.taskId) artifactId = item.action.params.taskId;
    } else if (item.category === 'GOAL_NEEDS_PROGRESS') {
      artifactType = 'goal';
      if (item.action.params?.goalId) artifactId = item.action.params.goalId;
    }

    if (!artifactType) return;

    setTimelineTarget({
      isOpen: true,
      artifactType,
      artifactId,
      title: item.title,
    });
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'high':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'medium':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AT_RISK':
        return { label: '🔴 At Risk', class: 'bg-rose-100 text-rose-800 border-rose-300' };
      case 'NEEDS_ATTENTION':
        return { label: '🟡 Needs Attention', class: 'bg-amber-100 text-amber-800 border-amber-300' };
      case 'ON_TRACK':
        return { label: '🟢 On Track', class: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      default:
        return { label: '⚪ No Active Work', class: 'bg-slate-100 text-slate-700 border-slate-300' };
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3" data-testid="action-center-loading">
        <div className="h-5 bg-gray-200 rounded w-1/3 animate-pulse"></div>
        <div className="h-16 bg-gray-100 rounded-lg animate-pulse"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700" data-testid="action-center-error">
        <span>⚠️ {error}</span>
      </div>
    );
  }

  const items = (data?.signals && data.signals.length > 0)
    ? data.signals.map((s: any) => ({
        id: s.signal_id,
        category: s.signal_type,
        urgency: s.severity,
        title: s.title,
        reason: s.explanation,
        evidence: s.evidence,
        supports_timeline: s.supports_timeline,
        supports_guidance: s.supports_guidance,
        action: s.action,
      }))
    : data?.items || [];
  const statusInfo = getStatusBadge(data?.attention_status || 'ON_TRACK');

  return (
    <div
      className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
      data-testid="attention-action-center"
    >
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 text-slate-900 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-900">
              {title || (scope === 'INDIVIDUAL' ? 'Action Center (My Work Attention)' : scope === 'TEAM' ? 'Team Action Center' : 'Classroom Action Center')}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusInfo.class}`}>
              {statusInfo.label}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">{data?.summary}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="bg-white text-slate-700 border border-slate-200 text-xs px-2.5 py-1 rounded-md font-medium shadow-2xs">
            {data?.total_action_items || 0} Item(s)
          </span>
          <button
            onClick={loadAttentionData}
            className="text-slate-600 hover:text-slate-900 p-1 rounded hover:bg-slate-200/60 text-xs transition-colors"
            title="Refresh signals"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Items Section */}
      <div className="p-5">
        {items.length === 0 ? (
          <div className="text-center py-8 px-4 bg-gray-50 rounded-lg border border-dashed border-gray-200" data-testid="action-center-empty">
            <div className="text-2xl mb-2">✅</div>
            <h4 className="text-sm font-semibold text-gray-900">No attention items right now</h4>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              All work items, tasks, goals, and daily progress signals in this scope are on track with zero open blockers or stalled transitions.
            </p>
          </div>
        ) : (
          <div className="space-y-4" data-testid="action-center-items">
            {items.map((item) => (
              <div
                key={item.id}
                className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 hover:bg-gray-50 transition-colors space-y-3"
                data-testid={`action-item-${item.id}`}
              >
                {/* Item Header */}
                <div className="flex items-start justify-between gap-3 flex-col sm:flex-row">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 text-[11px] font-bold uppercase rounded border ${getUrgencyBadge(item.urgency)}`}>
                        {item.urgency}
                      </span>
                      <h4 className="text-sm font-bold text-gray-900">{item.title}</h4>
                    </div>
                    <p className="text-xs text-gray-700 font-medium">{item.reason}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                    {item.supports_timeline !== false && ['BLOCKER', 'STALLED_TASK', 'OVERDUE_TASK', 'REOPENED_WORK_FLAPPING', 'GOAL_NEEDS_PROGRESS'].includes(item.category) && (
                      <button
                        onClick={() => handleOpenTimeline(item)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm transition-colors whitespace-nowrap flex items-center gap-1"
                        data-testid={`view-timeline-btn-${item.id}`}
                      >
                        <span>⏳ Timeline</span>
                      </button>
                    )}

                    {item.supports_guidance !== false && ['BLOCKER', 'STALLED_TASK', 'OVERDUE_TASK', 'REOPENED_WORK_FLAPPING', 'GOAL_NEEDS_PROGRESS'].includes(item.category) && (
                      <button
                        onClick={() => handleOpenGuidance(item)}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm transition-colors whitespace-nowrap flex items-center gap-1"
                        data-testid={`provide-guidance-btn-${item.id}`}
                      >
                        <span>🎯 Guidance</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleActionClick(item.action)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm transition-colors whitespace-nowrap flex items-center gap-1"
                      data-testid={`action-btn-${item.id}`}
                    >
                      <span>{item.action.label}</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>

                {/* Evidence Box ("WHY IS THIS SHOWING?") */}
                {item.evidence && item.evidence.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-md p-3 text-xs space-y-1">
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <span>🔍 Underlying Evidence:</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {item.evidence.map((ev: ActionCenterEvidence, idx: number) => (
                        <div key={idx} className="bg-gray-50 p-1.5 rounded border border-gray-100 flex flex-col">
                          <span className="text-[10px] text-gray-500 font-medium">{ev.label}</span>
                          <span className="text-xs font-semibold text-gray-900 truncate">{ev.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Provide Guidance Modal */}
      {guidanceTarget && (
        <ProvideGuidanceModal
          isOpen={guidanceTarget.isOpen}
          onClose={() => setGuidanceTarget(null)}
          contextType={guidanceTarget.contextType}
          contextId={guidanceTarget.contextId}
          contextTitle={guidanceTarget.contextTitle}
          teamId={guidanceTarget.teamId}
          onGuidanceSent={loadAttentionData}
        />
      )}

      {/* Work Activity Timeline Modal */}
      {timelineTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto relative p-6">
            <button
              onClick={() => setTimelineTarget(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-lg"
            >
              ✕
            </button>
            <WorkActivityTimeline
              artifactType={timelineTarget.artifactType}
              artifactId={timelineTarget.artifactId}
              title={timelineTarget.title}
              onClose={() => setTimelineTarget(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
