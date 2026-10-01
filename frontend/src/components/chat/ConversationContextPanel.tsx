import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../services/api';
import Avatar from '../common/Avatar';
import { ChatConversation, getConversationTitle } from './types';

interface TeamMember {
  user_id: string;
  full_name: string;
  username?: string;
  role?: string;
  avatar_url?: string;
}

interface ConversationContextPanelProps {
  conversation: ChatConversation;
  onClose?: () => void;
  className?: string;
}

export default function ConversationContextPanel({
  conversation,
  onClose,
  className = '',
}: ConversationContextPanelProps) {
  const navigate = useNavigate();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'info'>('members');

  const isTeam = conversation.type === 'team' && Boolean(conversation.team_id);
  const title = getConversationTitle(conversation);

  useEffect(() => {
    if (!isTeam || !conversation.team_id) {
      setMembers([]);
      return;
    }

    setLoadingMembers(true);
    api
      .getTeamMembers(conversation.team_id)
      .then((res) => {
        setMembers(res.data.data || []);
      })
      .catch(() => {
        setMembers([]);
      })
      .finally(() => {
        setLoadingMembers(false);
      });
  }, [conversation.team_id, isTeam]);

  return (
    <div className={`flex flex-col h-full bg-white border-l border-slate-200/80 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-slate-900 truncate">Details</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details panel"
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Main Conversation Identity Card */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            {isTeam ? (
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 font-extrabold text-lg flex items-center justify-center border border-indigo-200 shadow-xs">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            ) : (
              <Avatar
                name={conversation.other_user?.full_name || title}
                src={conversation.other_user?.avatar_url || undefined}
                size="xl"
              />
            )}
          </div>

          <div>
            <h4 className="text-base font-extrabold text-slate-900 leading-tight">{title}</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {isTeam
                ? `Team • ${members.length > 0 ? `${members.length} members` : 'Workspace conversation'}`
                : `@${conversation.other_user?.username || 'direct'}`}
            </p>
          </div>
        </div>

        {/* Tab Selection */}
        {isTeam && (
          <div className="border-b border-slate-100 flex items-center gap-4 text-xs font-bold text-slate-500 pb-1">
            <button
              type="button"
              onClick={() => setActiveTab('members')}
              className={`pb-2 transition-colors border-b-2 cursor-pointer ${
                activeTab === 'members'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Members ({members.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              className={`pb-2 transition-colors border-b-2 cursor-pointer ${
                activeTab === 'info'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              About
            </button>
          </div>
        )}

        {/* Members List (for Team Chat) */}
        {isTeam && activeTab === 'members' && (
          <div className="space-y-2.5">
            {loadingMembers && (
              <div className="text-center py-6 text-xs text-slate-400">Loading members...</div>
            )}

            {!loadingMembers && members.length === 0 && (
              <div className="text-center py-4 text-xs text-slate-400">No member data available</div>
            )}

            {!loadingMembers &&
              members.map((member) => {
                const isOwner = member.role === 'owner';
                return (
                  <div
                    key={member.user_id}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={member.full_name} src={member.avatar_url} size="sm" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{member.full_name}</div>
                        {member.username && (
                          <div className="text-[10px] text-slate-400 truncate">@{member.username}</div>
                        )}
                      </div>
                    </div>

                    {isOwner ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60 shrink-0">
                        <svg className="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
                        </svg>
                        Owner
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium shrink-0">Member</span>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* Linked Context Box */}
        {isTeam && conversation.team_id && (
          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Linked Workspace Context
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-900 truncate">{conversation.team_name}</div>
                <button
                  type="button"
                  onClick={() => navigate(`/teams/${conversation.team_id}`)}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mt-0.5 cursor-pointer"
                >
                  View Team Page
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Direct Chat Context */}
        {!isTeam && conversation.other_user && (
          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Direct Conversation
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Private 1-on-1 collaboration between you and {conversation.other_user.full_name}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
