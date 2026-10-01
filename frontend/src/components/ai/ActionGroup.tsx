import React from 'react';
import { Link } from 'react-router-dom';
import { AIAction, resolveActionRoute } from '../../utils/aiActionRoutes';

interface ActionGroupProps {
  actions: AIAction[];
  onActionClick?: (action: AIAction) => void;
  className?: string;
}

const PRIMARY_ACTION_TYPES = new Set(['open_task', 'open_project', 'open_team', 'open_goal', 'open_member']);

export const ActionGroup: React.FC<ActionGroupProps> = ({ actions, onActionClick, className = '' }) => {
  if (!actions || actions.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 pt-2 ${className}`}>
      {actions.map((act, idx) => {
        const route = resolveActionRoute(act);
        const isPrimary = PRIMARY_ACTION_TYPES.has(act.type);

        return (
          <Link
            key={idx}
            to={route}
            onClick={() => onActionClick?.(act)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
              isPrimary
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs shadow-indigo-600/20 active:translate-y-0.5'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 active:translate-y-0.5'
            }`}
          >
            <span>{act.label}</span>
            <svg
              className={`w-3.5 h-3.5 ${isPrimary ? 'text-indigo-200' : 'text-slate-400'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        );
      })}
    </div>
  );
};

export default ActionGroup;
