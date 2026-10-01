import React from 'react';
import { Link } from 'react-router-dom';
import { AIAction, resolveActionRoute } from '../../utils/aiActionRoutes';

export interface TaskItem {
  task_id: string;
  project_id?: string;
  title: string;
  status?: string;
  priority?: string;
  deadline?: string | null;
  project_name?: string;
}

interface TaskCardProps {
  task: TaskItem;
  onActionClick?: (action: AIAction) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onActionClick }) => {
  const action: AIAction = {
    type: 'open_task',
    entityId: task.task_id,
    projectId: task.project_id,
    label: 'Open Task',
  };

  const route = resolveActionRoute(action);

  const isOverdue =
    task.deadline && task.status !== 'done' && task.status !== 'completed' && new Date(task.deadline) < new Date();

  const isHighPriority = task.priority === 'high' || task.priority === 'urgent';

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-2xs space-y-2.5 hover:border-indigo-300/80 transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          {/* Status & Semantic Icon */}
          <div className="mt-0.5 shrink-0">
            {task.status === 'done' || task.status === 'completed' ? (
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : isOverdue ? (
              <svg className="w-4 h-4 text-rose-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : isHighPriority ? (
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 text-xs tracking-tight line-clamp-1">{task.title}</h4>
            {task.project_name && (
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">{task.project_name}</p>
            )}
          </div>
        </div>

        {/* Priority Badge */}
        <div className="flex items-center gap-1 shrink-0">
          {task.priority && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                isHighPriority
                  ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                  : 'bg-slate-100 text-slate-600 border border-slate-200/60'
              }`}
            >
              {task.priority}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
        {task.deadline ? (
          <div className="flex items-center gap-1.5 text-slate-500">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className={isOverdue ? 'text-rose-600 font-bold' : 'font-medium'}>
              {isOverdue ? 'Overdue: ' : 'Due: '}{new Date(task.deadline).toLocaleDateString()}
            </span>
          </div>
        ) : (
          <span className="text-slate-400 font-medium">No deadline</span>
        )}

        <Link
          to={route}
          onClick={() => onActionClick?.(action)}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded px-1"
        >
          <span>Open Task</span>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
};

export default TaskCard;
