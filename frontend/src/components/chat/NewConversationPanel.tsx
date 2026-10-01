import { useEffect, useState } from 'react';
import * as api from '../../services/api';
import { getInitials } from './types';

interface EligibleUser {
  user_id: string;
  full_name: string;
  username?: string;
}

interface EligibleTeam {
  team_id: string;
  team_name: string;
  member_count?: number;
}

export default function NewConversationPanel({
  currentUserId,
  onClose,
  onCreated,
}: {
  currentUserId: string;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [tab, setTab] = useState<'direct' | 'team'>('direct');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<EligibleUser[] | null>(null);
  const [teams, setTeams] = useState<EligibleTeam[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creatingId, setCreatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        if (tab === 'direct' && users === null) {
          const res = await api.getAllUsers();
          if (cancelled) return;
          setUsers((res.data.data || []).filter((u: EligibleUser) => u.user_id !== currentUserId));
        } else if (tab === 'team' && teams === null) {
          const res = await api.getMyTeams();
          if (cancelled) return;
          setTeams(res.data.data || []);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load options');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handlePickUser = async (userId: string) => {
    if (creatingId) return;
    setCreatingId(userId);
    setError('');
    try {
      const res = await api.createDirectConversation(userId);
      onCreated(res.data.data.conversation_id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start conversation');
    } finally {
      setCreatingId(null);
    }
  };

  const handlePickTeam = async (teamId: string) => {
    if (creatingId) return;
    setCreatingId(teamId);
    setError('');
    try {
      const res = await api.createTeamConversation(teamId);
      onCreated(res.data.data.conversation_id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to open team chat');
    } finally {
      setCreatingId(null);
    }
  };

  const trimmedQuery = query.trim().toLowerCase();

  const filteredUsers = users?.filter(
    (u) =>
      u.full_name.toLowerCase().includes(trimmedQuery) ||
      (u.username && u.username.toLowerCase().includes(trimmedQuery))
  );

  const filteredTeams = teams?.filter((t) =>
    t.team_name.toLowerCase().includes(trimmedQuery)
  );

  const recentUsers = users ? users.slice(0, 3) : [];

  return (
    <div className="pro-card absolute left-0 right-0 top-full mt-2 z-30 max-h-96 flex flex-col shadow-xl border border-slate-200 bg-white rounded-2xl overflow-hidden" role="dialog" aria-label="Start a new conversation">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">New conversation</h3>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1" aria-label="Close">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 bg-white px-3">
        <button
          type="button"
          onClick={() => setTab('direct')}
          className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            tab === 'direct' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Direct message
        </button>
        <button
          type="button"
          onClick={() => setTab('team')}
          className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            tab === 'team' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Team chat
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-slate-100 bg-slate-50/30">
        <div className="relative">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'direct' ? 'Search people by name or username...' : 'Search authorized teams...'}
            className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900 placeholder:text-slate-400"
            autoFocus
          />
        </div>
      </div>

      {/* Options List */}
      <div className="overflow-y-auto flex-1 p-2 space-y-1">
        {loading && (
          <div role="status" className="text-xs text-slate-500 text-center py-6">
            <div className="spinner w-4 h-4 mx-auto mb-2 text-indigo-600"></div>
            Loading options...
          </div>
        )}

        {error && (
          <div role="alert" className="text-xs text-red-600 text-center py-4 px-2 font-medium">
            {error}
          </div>
        )}

        {/* DIRECT MESSAGES */}
        {!loading && tab === 'direct' && (
          <>
            {/* Empty Search Prompt & Recent Teammates */}
            {!trimmedQuery && (
              <div className="mb-2">
                {recentUsers.length > 0 && (
                  <div className="px-2 pt-1 pb-1">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Teammates</p>
                  </div>
                )}
              </div>
            )}

            {filteredUsers?.length === 0 && (
              <div className="text-center py-6 px-4 space-y-1">
                <p className="text-xs font-semibold text-slate-700">No matching teammates found</p>
                <p className="text-[11px] text-slate-400">Try searching for a different name or username.</p>
              </div>
            )}

            {filteredUsers?.map((eligibleUser) => (
              <button
                key={eligibleUser.user_id}
                type="button"
                onClick={() => handlePickUser(eligibleUser.user_id)}
                disabled={creatingId !== null}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-indigo-50/60 transition-colors disabled:opacity-50 group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-xs flex items-center justify-center shrink-0 border border-indigo-200">
                  {getInitials(eligibleUser.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                    {eligibleUser.full_name}
                  </p>
                  {eligibleUser.username && (
                    <p className="text-[11px] text-slate-400 truncate">@{eligibleUser.username}</p>
                  )}
                </div>
                {creatingId === eligibleUser.user_id && (
                  <span className="spinner w-3.5 h-3.5 ml-auto text-indigo-600 shrink-0" />
                )}
              </button>
            ))}
          </>
        )}

        {/* TEAM CHAT */}
        {!loading && tab === 'team' && (
          <>
            {filteredTeams?.length === 0 && (
              <div className="text-center py-6 px-4 space-y-1">
                <p className="text-xs font-semibold text-slate-700">No matching authorized teams</p>
                <p className="text-[11px] text-slate-400">You must be an active member of a team to access its chat.</p>
              </div>
            )}

            {filteredTeams?.map((eligibleTeam) => (
              <button
                key={eligibleTeam.team_id}
                type="button"
                onClick={() => handlePickTeam(eligibleTeam.team_id)}
                disabled={creatingId !== null}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-indigo-50/60 transition-colors disabled:opacity-50 group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m9-2.13a4 4 0 10-8 0 4 4 0 008 0zM12 14a4 4 0 100-8 4 4 0 000 8z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                    {eligibleTeam.team_name}
                  </p>
                  {eligibleTeam.member_count !== undefined && (
                    <p className="text-[11px] text-slate-400 truncate">{eligibleTeam.member_count} members</p>
                  )}
                </div>
                {creatingId === eligibleTeam.team_id && (
                  <span className="spinner w-3.5 h-3.5 ml-auto text-indigo-600 shrink-0" />
                )}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
