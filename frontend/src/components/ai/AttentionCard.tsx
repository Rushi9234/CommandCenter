import React from 'react';
import TaskCard, { TaskItem } from './TaskCard';
import ActionGroup from './ActionGroup';
import { AIAction } from '../../utils/aiActionRoutes';

export interface PersonalAttentionData {
  overdue_tasks?: TaskItem[];
  high_priority_tasks?: TaskItem[];
  active_blockers?: Array<{ blocker_id: string; title: string; urgency?: string }>;
}

interface AttentionCardProps {
  data: PersonalAttentionData;
  onActionClick?: (action: AIAction) => void;
}

export const AttentionCard: React.FC<AttentionCardProps> = ({ data, onActionClick }) => {
  const overdueTasks = data.overdue_tasks || [];
  const overdueIds = new Set(overdueTasks.map((t) => t.task_id));
  const highPriorityTasks = (data.high_priority_tasks || []).filter((t) => !overdueIds.has(t.task_id));
  const activeBlockers = data.active_blockers || [];

  const overdueCount = overdueTasks.length;
  const highPriorityCount = highPriorityTasks.length;
  const blockerCount = activeBlockers.length;
  const totalItems = overdueCount + highPriorityCount + blockerCount;

  const summaryActions: AIAction[] = [
    { type: 'view_all', label: 'View All Tasks' },
    ...(overdueCount > 0 ? [{ type: 'view_overdue' as const, label: 'View Overdue' }] : []),
    ...(highPriorityCount > 0 ? [{ type: 'view_high_priority' as const, label: 'View High Priority' }] : []),
    ...(blockerCount > 0 ? [{ type: 'view_blockers' as const, label: 'View Blockers' }] : []),
  ];

  if (totalItems === 0) {
    return (
      <div className="bg-emerald-50/90 border border-emerald-200/90 rounded-2xl p-4 text-center space-y-2.5">
        <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-2xs">
          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h4 className="font-bold text-emerald-950 text-xs">No Overdue Work</h4>
          <p className="text-[11px] text-emerald-700 mt-0.5">You're currently up to date with zero open blockers or high-priority attention items.</p>
        </div>
        <ActionGroup actions={[{ type: 'view_all', label: 'View All Tasks' }]} onActionClick={onActionClick} className="justify-center" />
      </div>
    );
  }

  return (
    <div className="bg-slate-900/5 border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="font-bold text-slate-900 text-xs tracking-tight">Needs Your Attention</h3>
        </div>
        <span className="text-[10px] font-bold bg-amber-50 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200/80">
          {totalItems} Item{totalItems === 1 ? '' : 's'}
        </span>
      </div>

      {/* Overdue Section */}
      {overdueCount > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-rose-700 text-[11px] font-bold uppercase tracking-wider">
            <svg className="w-3.5 h-3.5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Overdue Tasks ({overdueCount})</span>
          </div>
          <div className="space-y-2">
            {overdueTasks.map((t) => (
              <TaskCard key={t.task_id} task={t} onActionClick={onActionClick} />
            ))}
          </div>
        </div>
      )}

      {/* High Priority Section */}
      {highPriorityCount > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-amber-800 text-[11px] font-bold uppercase tracking-wider">
            <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>High Priority ({highPriorityCount})</span>
          </div>
          <div className="space-y-2">
            {highPriorityTasks.map((t) => (
              <TaskCard key={t.task_id} task={t} onActionClick={onActionClick} />
            ))}
          </div>
        </div>
      )}

      {/* Summary Actions */}
      <div className="pt-2 border-t border-slate-100">
        <span className="text-[10px] font-semibold text-slate-400 block mb-1">Quick Navigation</span>
        <ActionGroup actions={summaryActions} onActionClick={onActionClick} />
      </div>
    </div>
  );
};

export default AttentionCard;
