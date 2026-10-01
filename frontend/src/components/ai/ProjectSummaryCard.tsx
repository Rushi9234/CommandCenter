import React from 'react';
import { Link } from 'react-router-dom';
import { AIAction, resolveActionRoute } from '../../utils/aiActionRoutes';

export interface ProjectSummaryData {
  project_id: string;
  project_name: string;
  status?: string;
  task_counts?: { total: number; completed: number };
  active_blockers_count?: number;
  high_priority_tasks?: number;
}

interface ProjectSummaryCardProps {
  summary: ProjectSummaryData;
  onActionClick?: (action: AIAction) => void;
}

export const ProjectSummaryCard: React.FC<ProjectSummaryCardProps> = ({ summary, onActionClick }) => {
  const total = summary.task_counts?.total || 0;
  const completed = summary.task_counts?.completed || 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const openProjectAction: AIAction = {
    type: 'open_project',
    entityId: summary.project_id,
    label: 'Open Project',
  };

  const viewBlockersAction: AIAction = {
    type: 'view_blockers',
    entityId: summary.project_id,
    label: 'View Blockers',
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
              Project Execution
            </span>
            <h3 className="font-bold text-slate-900 text-xs tracking-tight">{summary.project_name}</h3>
          </div>
        </div>
        {summary.status && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200/60">
            {summary.status}
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
          <span>Completion</span>
          <span className="font-bold text-slate-900">{pct}% ({completed}/{total} tasks)</span>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
          <span className="text-slate-500 text-[11px] block font-medium">Active Blockers</span>
          <span className={`font-bold text-sm ${summary.active_blockers_count ? 'text-rose-600' : 'text-slate-800'}`}>
            {summary.active_blockers_count || 0}
          </span>
        </div>
        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
          <span className="text-slate-500 text-[11px] block font-medium">High Priority Tasks</span>
          <span className="font-bold text-slate-800 text-sm">
            {summary.high_priority_tasks || 0}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-2 flex items-center gap-2 border-t border-slate-100">
        <Link
          to={resolveActionRoute(openProjectAction)}
          onClick={() => onActionClick?.(openProjectAction)}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition-colors shadow-2xs flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <span>Open Project</span>
          <svg className="w-3.5 h-3.5 text-indigo-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </Link>
        {Boolean(summary.active_blockers_count) && (
          <Link
            to={resolveActionRoute(viewBlockersAction)}
            onClick={() => onActionClick?.(viewBlockersAction)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs border border-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            View Blockers
          </Link>
        )}
      </div>
    </div>
  );
};

export default ProjectSummaryCard;
