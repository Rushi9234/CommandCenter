import { useEffect, useState } from 'react';
import * as api from '../../services/api';
import { getInitials } from './types';

interface EligibleUser {
  user_id: string;
  full_name: string;
}

interface EligibleTeam {
  team_id: string;
  team_name: string;
}

// Start-a-conversation picker. Eligibility is never decided here --
// GET /api/users already returns only users who share a team with the
// caller (the exact same rule chat.service.ts's usersShareATeam enforces
// server-side), and GET /teams/my already returns only teams the caller
// is a CURRENT member of (live team_members, no parent-team shortcut --
// same rule requireTeamMembership enforces server-side). This panel does
// not reimplement either check; the backend remains the final authority
// either way (a stale/bypassed client list would just get a 403/404 from
// the create call itself).
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

  return (
    <div className="pro-card absolute left-0 right-0 top-full mt-2 z-30 max-h-96 flex flex-col" role="dialog" aria-label="Start a new conversation">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">New conversation</h3>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex border-b border-gray-200 px-2">
        <button
          type="button"
          onClick={() => setTab('direct')}
          className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px ${
            tab === 'direct' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Direct message
        </button>
        <button
          type="button"
          onClick={() => setTab('team')}
          className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px ${
            tab === 'team' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Team chat
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-2">
        {loading && (
          <div role="status" className="text-sm text-gray-500 text-center py-6">
            <div className="spinner w-5 h-5 mx-auto mb-2"></div>
            Loading...
          </div>
        )}

        {error && (
          <div role="alert" className="text-sm text-red-600 text-center py-4 px-2">
            {error}
          </div>
        )}

        {!loading && tab === 'direct' && users !== null && users.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-6">No eligible teammates yet -- join a team first.</p>
        )}

        {!loading &&
          tab === 'direct' &&
          users?.map((eligibleUser) => (
            <button
              key={eligibleUser.user_id}
              type="button"
              onClick={() => handlePickUser(eligibleUser.user_id)}
              disabled={creatingId !== null}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-50 disabled:opacity-50"
            >
              <div className="avatar w-8 h-8 text-xs flex-shrink-0" aria-hidden="true">
                {getInitials(eligibleUser.full_name)}
              </div>
              <span className="text-sm text-gray-900 truncate">{eligibleUser.full_name}</span>
              {creatingId === eligibleUser.user_id && <span className="spinner w-3.5 h-3.5 ml-auto flex-shrink-0" />}
            </button>
          ))}

        {!loading && tab === 'team' && teams !== null && teams.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-6">You're not on any teams yet.</p>
        )}

        {!loading &&
          tab === 'team' &&
          teams?.map((eligibleTeam) => (
            <button
              key={eligibleTeam.team_id}
              type="button"
              onClick={() => handlePickTeam(eligibleTeam.team_id)}
              disabled={creatingId !== null}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-50 disabled:opacity-50"
            >
              <div className="w-8 h-8 flex-shrink-0 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m9-2.13a4 4 0 10-8 0 4 4 0 008 0zM12 14a4 4 0 100-8 4 4 0 000 8z" />
                </svg>
              </div>
              <span className="text-sm text-gray-900 truncate">{eligibleTeam.team_name}</span>
              {creatingId === eligibleTeam.team_id && <span className="spinner w-3.5 h-3.5 ml-auto flex-shrink-0" />}
            </button>
          ))}
      </div>
    </div>
  );
}
