import React from 'react';
import { Link } from 'react-router-dom';
import { AIAction, resolveActionRoute } from '../../utils/aiActionRoutes';

export interface TeamSummaryData {
  team_id: string;
  team_name: string;
  team_type?: string;
  member_count?: number;
  open_blockers_count?: number;
  pending_work_count?: number;
}

interface TeamSummaryCardProps {
  summary: TeamSummaryData;
  onActionClick?: (action: AIAction) => void;
}

export const TeamSummaryCard: React.FC<TeamSummaryCardProps> = ({ summary, onActionClick }) => {
  const openTeamAction: AIAction = {
    type: 'open_team',
    entityId: summary.team_id,
    label: 'Open Team',
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600">
              {summary.team_type === 'classroom' ? 'Classroom Progress' : 'Team Progress'}
            </span>
            <h3 className="font-bold text-slate-900 text-xs tracking-tight">{summary.team_name}</h3>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200/60">
          {summary.member_count || 1} Members
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
          <span className="text-slate-500 text-[11px] block font-medium">Open Blockers</span>
          <span className={`font-bold text-sm ${summary.open_blockers_count ? 'text-rose-600' : 'text-slate-800'}`}>
            {summary.open_blockers_count || 0}
          </span>
        </div>
        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
          <span className="text-slate-500 text-[11px] block font-medium">Pending Submissions</span>
          <span className="font-bold text-slate-800 text-sm">
            {summary.pending_work_count || 0}
          </span>
        </div>
      </div>

      <div className="pt-2 flex items-center justify-between border-t border-slate-100">
        <Link
          to={resolveActionRoute(openTeamAction)}
          onClick={() => onActionClick?.(openTeamAction)}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition-colors shadow-2xs flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <span>Open Team</span>
          <svg className="w-3.5 h-3.5 text-indigo-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </Link>
      </div>
    </div>
  );
};

export default TeamSummaryCard;
