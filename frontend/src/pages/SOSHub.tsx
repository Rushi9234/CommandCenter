import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useRealtime, type RealtimeEvent } from '../hooks/useRealtime';
import * as api from '../services/api';
import WorkActivityTimeline from '../components/WorkActivityTimeline';
import { useToast } from '../hooks/useToast';

export default function SOSHub() {
  const { user } = useAuth();
  const { success, error: toastError, info: toastInfo } = useToast();
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  // Notification deep-linking: ?teamId=&blockerId= selects the team
  // (overriding the default "first team" auto-select) and selects the
  // specific blocker once that team's blockers have actually loaded.
  // Tracked by last-processed value (not a one-shot boolean) so a second,
  // different notification click while already on /help -- same route,
  // no remount -- is still processed.
  const [searchParams, setSearchParams] = useSearchParams();
  const lastProcessedTeamDeepLink = useRef<string | null>(null);
  const blockerSelectConsumed = useRef<string | null>(null);
  const [highlightedBlockerId, setHighlightedBlockerId] = useState<string | null>(null);
  const [teamDeepLinkError, setTeamDeepLinkError] = useState('');
  const [blockerDeepLinkError, setBlockerDeepLinkError] = useState('');
  const [teams, setTeams] = useState<any[]>([]);
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [blockers, setBlockers] = useState<any[]>([]);
  const [selectedBlocker, setSelectedBlocker] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [aiAdvice, setAiAdvice] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeBlockerTab, setActiveBlockerTab] = useState<'discussion' | 'ai_resolver' | 'split'>('discussion');
  // Cross-section audit fix: none of these existed before -- a fetch in
  // flight (initial load or team/blocker switch) was visually
  // indistinguishable from "genuinely nothing here," and a failed load was
  // silently swallowed (console.error only) with no user-facing signal.
  // Deliberately NOT set on background poll ticks (only on the
  // force=true initial/switch/visibility-refresh loads) so the periodic
  // 5s/3s polling this page already relies on doesn't flash a spinner
  // every cycle.
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState('');
  const [blockersLoading, setBlockersLoading] = useState(false);
  const [blockersError, setBlockersError] = useState('');
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const blockersRequestVersion = useRef(0);
  const messagesRequestVersion = useRef(0);
  const blockersInFlight = useRef(false);
  const messagesInFlight = useRef(false);
  const selectedTeamRef = useRef<any>(null);
  const selectedBlockerRef = useRef<any>(null);

  const [blockerFilter, setBlockerFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [autoResolving, setAutoResolving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [newBlocker, setNewBlocker] = useState({
    title: '',
    description: '',
    blockerType: 'technical',
    severity: 'medium',
    attemptedSolutions: '',
  });

  selectedTeamRef.current = selectedTeam;
  selectedBlockerRef.current = selectedBlocker;

  useEffect(() => {
    loadTeams();
  }, []);

  // Notification deep-link: reacts to `searchParams` itself, not just
  // mount -- clicking a Blockers notification while already on /help
  // (same route, only the query string changes) does not remount this
  // component. Waits for `teams` to actually be populated (covers the
  // fresh-page-load case where the param is present before getMyTeams()
  // resolves). highlightedBlockerId set here is picked up by
  // loadBlockers' own success handler once that team's blockers actually
  // load (see below) -- not a separate effect racing blockersLoading's
  // render-delayed state.
  useEffect(() => {
    const teamId = searchParams.get('teamId');
    if (!teamId || teamId === lastProcessedTeamDeepLink.current || teams.length === 0) return;
    lastProcessedTeamDeepLink.current = teamId;
    const target = teams.find((t: any) => t.team_id === teamId);
    if (target) {
      setTeamDeepLinkError('');
      setSelectedTeam(target);
      setSelectedBlocker(null);
      const blockerId = searchParams.get('blockerId');
      if (blockerId) {
        setBlockerDeepLinkError('');
        setHighlightedBlockerId(blockerId);
      }
    } else {
      setTeamDeepLinkError("You no longer have access to that team, or it doesn't exist.");
      if (teams.length > 0) setSelectedTeam(teams[0]);
    }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, teams]);

  useEffect(() => {
    if (selectedTeam) {
      const requestVersion = ++blockersRequestVersion.current;
      setBlockers([]);
      loadBlockers(selectedTeam.team_id, requestVersion, true);
      const interval = setInterval(() => {
        loadBlockers(selectedTeam.team_id, requestVersion);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedTeam]);

  useEffect(() => {
    if (selectedBlocker) {
      const requestVersion = ++messagesRequestVersion.current;
      setMessages([]);
      setAiAdvice('');
      loadMessages(selectedBlocker.blocker_id, requestVersion, true);
      const interval = setInterval(() => {
        loadMessages(selectedBlocker.blocker_id, requestVersion);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedBlocker]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const team = selectedTeamRef.current;
      const blocker = selectedBlockerRef.current;
      if (team) {
        const requestVersion = ++blockersRequestVersion.current;
        void loadBlockers(team.team_id, requestVersion, true);
      }
      if (blocker) {
        const requestVersion = ++messagesRequestVersion.current;
        void loadMessages(blocker.blocker_id, requestVersion, true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useRealtime((event: RealtimeEvent) => {
    // Blocker realtime events: refresh the currently-selected team's
    // blockers. The event carries only teamId; the frontend maintains
    // blocker/message state locally and refetches on demand to get
    // authoritative updates.
    if (event.type !== 'blocker.created' && event.type !== 'blocker.resolved') return;
    if (!selectedTeamRef.current) return;

    const requestVersion = ++blockersRequestVersion.current;
    void loadBlockers(selectedTeamRef.current.team_id, requestVersion, true);
  });

  const loadTeams = async () => {
    setTeamsLoading(true);
    setTeamsError('');
    try {
      const response = await api.getMyTeams();
      setTeams(response.data.data);
      // Default-select is skipped when a teamId deep link is currently
      // pending -- the dedicated deep-link effect below owns selection in
      // that case.
      if (response.data.data.length > 0 && !searchParams.get('teamId')) {
        setSelectedTeam(response.data.data[0]);
      }
    } catch (error) {
      console.error('Failed to load teams:', error);
      setTeamsError('Failed to load your teams. Please try again.');
    } finally {
      setTeamsLoading(false);
    }
  };

  const loadBlockers = async (teamId: string, requestVersion: number, force = false) => {
    if (!teamId || document.hidden || blockersInFlight.current && !force) return;
    if (blockersInFlight.current) return;
    blockersInFlight.current = true;
    if (force) {
      setBlockersLoading(true);
      setBlockersError('');
    }
    try {
      const response = await api.getTeamBlockers(teamId);
      if (
        !document.hidden &&
        selectedTeamRef.current?.team_id === teamId &&
        blockersRequestVersion.current === requestVersion
      ) {
        setBlockers(response.data.data);

        // Deep-linked blocker: consumed inline with the fetch that
        // actually populates `blockers` for the correct team -- not a
        // separate effect watching blockersLoading, since that state
        // flips true/false across renders in a way a reactive effect can
        // observe out of step with when `blockers` itself genuinely
        // reflects a fresh, correct-team fetch. Keyed on the blocker ID
        // itself (not a one-shot boolean) so a second, different
        // deep-linked blocker is still selected.
        if (highlightedBlockerId && highlightedBlockerId !== blockerSelectConsumed.current) {
          blockerSelectConsumed.current = highlightedBlockerId;
          const target = response.data.data.find((b: any) => b.blocker_id === highlightedBlockerId);
          if (target) {
            setSelectedBlocker(target);
          } else {
            setBlockerDeepLinkError("That blocker is no longer available, or you don't have access to it.");
          }
        }
      }
    } catch (error) {
      console.error('Failed to load blockers:', error);
      if (force && selectedTeamRef.current?.team_id === teamId) {
        setBlockersError('Failed to load blockers. Please try again.');
      }
    } finally {
      blockersInFlight.current = false;
      if (force) setBlockersLoading(false);
      const currentTeam = selectedTeamRef.current;
      if (
        currentTeam &&
        (currentTeam.team_id !== teamId || blockersRequestVersion.current !== requestVersion) &&
        !document.hidden
      ) {
        void loadBlockers(currentTeam.team_id, blockersRequestVersion.current, true);
      }
    }
  };

  const loadMessages = async (blockerId: string, requestVersion: number, force = false) => {
    if (!blockerId || document.hidden || messagesInFlight.current && !force) return;
    if (messagesInFlight.current) return;
    messagesInFlight.current = true;
    if (force) {
      setMessagesLoading(true);
      setMessagesError('');
    }
    try {
      const response = await api.getMessages(blockerId);
      if (
        !document.hidden &&
        selectedBlockerRef.current?.blocker_id === blockerId &&
        messagesRequestVersion.current === requestVersion
      ) {
        setMessages(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      if (force && selectedBlockerRef.current?.blocker_id === blockerId) {
        setMessagesError('Failed to load messages. Please try again.');
      }
    } finally {
      messagesInFlight.current = false;
      if (force) setMessagesLoading(false);
      const currentBlocker = selectedBlockerRef.current;
      if (
        currentBlocker &&
        (currentBlocker.blocker_id !== blockerId || messagesRequestVersion.current !== requestVersion) &&
        !document.hidden
      ) {
        void loadMessages(currentBlocker.blocker_id, messagesRequestVersion.current, true);
      }
    }
  };

  const handleCreateBlocker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam) return;
    setLoading(true);
    try {
      await api.createBlocker({ ...newBlocker, teamId: selectedTeam.team_id });
      setShowCreateModal(false);
      setNewBlocker({ title: '', description: '', blockerType: 'technical', severity: 'medium', attemptedSolutions: '' });
      success('Blocker ticket opened successfully! AI analysis running.');
      loadBlockers(selectedTeam.team_id, blockersRequestVersion.current, true);
    } catch (error: any) {
      toastError(error.response?.data?.error || 'Failed to create blocker');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlocker || !newMessage.trim()) return;
    try {
      await api.sendMessage(selectedBlocker.blocker_id, newMessage);
      setNewMessage('');
      loadMessages(selectedBlocker.blocker_id, messagesRequestVersion.current, true);
    } catch (error: any) {
      toastError(error.response?.data?.error || 'Failed to send message');
    }
  };

  const handleOpenResolveModal = () => {
    setResolutionNotes('');
    setShowResolveModal(true);
  };

  const handleConfirmResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlocker) return;
    setLoading(true);
    try {
      await api.updateBlocker(selectedBlocker.blocker_id, {
        status: 'resolved',
        resolution_notes: resolutionNotes.trim() || undefined,
      });
      setShowResolveModal(false);
      setResolutionNotes('');
      setSelectedBlocker(null);
      success('Blocker marked as resolved! Institutional memory saved.');
      loadBlockers(selectedTeam.team_id, blockersRequestVersion.current, true);
    } catch (error: any) {
      toastError(error.response?.data?.error || 'Failed to resolve blocker');
    } finally {
      setLoading(false);
    }
  };

  const handleReopenBlocker = async () => {
    if (!selectedBlocker) return;
    try {
      await api.updateBlocker(selectedBlocker.blocker_id, { status: 'open' });
      setSelectedBlocker((prev: any) => ({
        ...prev,
        status: 'open',
        resolution_notes: null,
        resolved_by: null,
        resolved_at: null,
      }));
      toastInfo('Blocker ticket reopened.');
      loadBlockers(selectedTeam.team_id, blockersRequestVersion.current, true);
    } catch (error: any) {
      toastError(error.response?.data?.error || 'Failed to reopen blocker');
    }
  };

  const handleAutoResolve = async () => {
    if (!selectedBlocker) return;
    setAutoResolving(true);
    try {
      const response = await api.autoResolveBlocker(selectedBlocker.blocker_id);
      const resData = response.data.data;
      setSelectedBlocker((prev: any) => ({
        ...prev,
        ai_suggestions: resData,
      }));
      setActiveBlockerTab('ai_resolver');
      success('AI Auto-Resolver matched latest institutional memory!');
      loadBlockers(selectedTeam.team_id, blockersRequestVersion.current, false);
    } catch (error: any) {
      toastError(error.response?.data?.error || 'Failed to auto-resolve blocker with AI');
    } finally {
      setAutoResolving(false);
    }
  };

  const handleCopySolution = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    success('Copied resolution notes to clipboard!');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleGetAIAdvice = async () => {
    if (!selectedBlocker) return;
    setLoading(true);
    try {
      const response = await api.getAIAdvice(selectedBlocker.blocker_id);
      setAiAdvice(response.data.data.advice);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to get AI advice');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    const colors: any = { low: 'green', medium: 'yellow', high: 'red' };
    return colors[severity] || 'gray';
  };

  const getStatusColor = (status: string) => {
    const colors: any = { open: 'red', in_progress: 'yellow', resolved: 'green' };
    return colors[status] || 'gray';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">SOS Hub</h1>
              <p className="text-gray-600 mt-1">Get help with blockers and challenges</p>
            </div>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary">
              🆘 Report Blocker
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {(teamDeepLinkError || blockerDeepLinkError) && (
          <div role="alert" className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm flex items-center justify-between">
            <span>{teamDeepLinkError || blockerDeepLinkError}</span>
            <button
              type="button"
              onClick={() => { setTeamDeepLinkError(''); setBlockerDeepLinkError(''); }}
              className="text-yellow-700 hover:text-yellow-900 text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="pro-card p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-900">Your Teams ({teams.length})</h2>
              </div>
              {teams.length > 5 && (
                <div className="mb-2">
                  <input
                    type="text"
                    value={teamSearch}
                    onChange={(e) => setTeamSearch(e.target.value)}
                    placeholder="Search teams..."
                    className="w-full text-xs px-2.5 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
              {teamsLoading ? (
                <div role="status" className="text-center text-gray-500 py-4 text-sm">
                  <div className="spinner w-5 h-5 mx-auto mb-2"></div>
                  Loading teams...
                </div>
              ) : teamsError ? (
                <div role="alert" className="text-center py-4">
                  <p className="text-red-600 text-sm mb-2">{teamsError}</p>
                  <button type="button" onClick={loadTeams} className="btn-secondary text-xs">Retry</button>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {teams
                    .filter((t) => !teamSearch.trim() || t.team_name.toLowerCase().includes(teamSearch.toLowerCase().trim()))
                    .map((team) => (
                      <button
                        key={team.team_id}
                        onClick={() => { setSelectedTeam(team); setSelectedBlocker(null); }}
                        className={`w-full text-left p-2.5 rounded-lg transition-all text-xs ${
                          selectedTeam?.team_id === team.team_id
                            ? 'bg-blue-50 border-2 border-blue-500 font-semibold'
                            : 'hover:bg-gray-50 border-2 border-transparent'
                        }`}
                      >
                        <div className="font-medium text-gray-900 truncate flex items-center gap-1.5">
                          <span>{team.team_type === 'classroom' ? '🎓' : '👥'}</span>
                          <span className="truncate">{team.team_name}</span>
                        </div>
                      </button>
                    ))}
                  {teams.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">You're not on any teams yet.</p>
                  )}
                </div>
              )}
            </div>

            <div className="pro-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Blockers</h2>
                <div className="flex bg-gray-100 p-0.5 rounded-lg text-[11px]">
                  <button
                    type="button"
                    onClick={() => setBlockerFilter('open')}
                    className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                      blockerFilter === 'open' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Open ({blockers.filter((b) => b.status !== 'resolved').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBlockerFilter('resolved')}
                    className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                      blockerFilter === 'resolved' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Solved ({blockers.filter((b) => b.status === 'resolved').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBlockerFilter('all')}
                    className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                      blockerFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    All ({blockers.length})
                  </button>
                </div>
              </div>
              {blockersLoading ? (
                <div role="status" className="text-center text-gray-500 py-4 text-sm">
                  <div className="spinner w-5 h-5 mx-auto mb-2"></div>
                  Loading blockers...
                </div>
              ) : blockersError ? (
                <div role="alert" className="text-center py-4">
                  <p className="text-red-600 text-sm mb-2">{blockersError}</p>
                  <button
                    type="button"
                    onClick={() => selectedTeam && loadBlockers(selectedTeam.team_id, blockersRequestVersion.current, true)}
                    className="btn-secondary text-xs"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {blockers
                    .filter((b) => {
                      if (blockerFilter === 'open') return b.status !== 'resolved';
                      if (blockerFilter === 'resolved') return b.status === 'resolved';
                      return true;
                    })
                    .map((blocker) => (
                      <button
                        key={blocker.blocker_id}
                        onClick={() => {
                          setSelectedBlocker(blocker);
                          setActiveBlockerTab('discussion');
                        }}
                        className={`w-full text-left p-3 rounded-lg transition-all ${
                          selectedBlocker?.blocker_id === blocker.blocker_id
                            ? 'bg-blue-50 border-2 border-blue-500'
                            : 'hover:bg-gray-50 border-2 border-transparent'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="font-medium text-gray-900 text-sm line-clamp-1">{blocker.title}</div>
                          {blocker.status === 'resolved' && (
                            <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded flex-shrink-0">
                              Solved
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`badge badge-${getSeverityColor(blocker.severity)} text-xs`}>
                            {blocker.severity}
                          </span>
                          <span className="text-xs text-gray-500">{blocker.message_count} msgs</span>
                        </div>
                      </button>
                    ))}
                  {blockers.filter((b) => {
                    if (blockerFilter === 'open') return b.status !== 'resolved';
                    if (blockerFilter === 'resolved') return b.status === 'resolved';
                    return true;
                  }).length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">No {blockerFilter} blockers found.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-3">
            {selectedBlocker ? (
              <div className="space-y-6">
                <div className="pro-card p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-gray-900">{selectedBlocker.title}</h2>
                      <p className="text-gray-600 mt-2">{selectedBlocker.description}</p>
                      <div className="flex items-center gap-3 mt-4">
                        <span className={`badge badge-${getSeverityColor(selectedBlocker.severity)}`}>
                          {selectedBlocker.severity} severity
                        </span>
                        <span className={`badge badge-${getStatusColor(selectedBlocker.status)}`}>
                          {selectedBlocker.status}
                        </span>
                        <span className="badge badge-gray">{selectedBlocker.blocker_type}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        type="button"
                        onClick={() => setActiveBlockerTab('discussion')}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold flex items-center gap-1 transition-all ${
                          activeBlockerTab === 'discussion'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
                        }`}
                        data-testid="blocker-header-discussion-btn"
                      >
                        <span>💬</span>
                        <span>Discussion ({messages.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveBlockerTab('ai_resolver');
                          if (!selectedBlocker.ai_suggestions || Array.isArray(selectedBlocker.ai_suggestions)) {
                            handleAutoResolve();
                          }
                        }}
                        disabled={autoResolving}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold flex items-center gap-1 transition-all disabled:opacity-50 ${
                          activeBlockerTab === 'ai_resolver'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-white hover:bg-purple-50 border-purple-300 text-purple-700'
                        }`}
                        data-testid="blocker-header-ai-btn"
                      >
                        {autoResolving ? (
                          <>
                            <div className="spinner w-3 h-3"></div>
                            <span>Analyzing...</span>
                          </>
                        ) : (
                          <>
                            <span>⚡</span>
                            <span>AI Auto-Resolver</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowTimelineModal(true)}
                        data-testid="blocker-timeline-btn"
                        className="btn-secondary flex items-center gap-1 text-xs"
                      >
                        📜 Timeline
                      </button>
                      <button onClick={handleGetAIAdvice} disabled={loading} className="btn-secondary text-xs">
                        🤖 AI Advice
                      </button>
                      {selectedBlocker.status !== 'resolved' ? (
                        <button onClick={handleOpenResolveModal} className="btn-primary text-xs">
                          ✅ Resolve
                        </button>
                      ) : (
                        <button onClick={handleReopenBlocker} className="btn-secondary text-xs text-amber-700 hover:bg-amber-50">
                          ↩️ Reopen
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Resolution Notes Banner */}
                  {selectedBlocker.status === 'resolved' && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-xl mb-4">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-green-900 text-sm flex items-center gap-1.5">
                          ✅ Resolved by {selectedBlocker.resolver?.full_name || 'Teammate'}
                          {selectedBlocker.resolved_at && ` on ${new Date(selectedBlocker.resolved_at).toLocaleDateString()}`}
                        </span>
                        <span className="text-[10px] bg-green-200/70 text-green-800 px-2 py-0.5 rounded-full font-semibold">
                          Institutional Memory Saved
                        </span>
                      </div>
                      {selectedBlocker.resolution_notes ? (
                        <div className="mt-2 text-xs text-green-900 bg-white/80 p-3 rounded-lg border border-green-100 font-mono whitespace-pre-wrap">
                          <span className="font-sans font-bold text-green-950 block mb-1">Applied Resolution:</span>
                          {selectedBlocker.resolution_notes}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-green-700 italic">Marked resolved without recorded notes.</p>
                      )}
                    </div>
                  )}

                  {/* Attempted Solutions Context */}
                  {selectedBlocker.attempted_solutions && (
                    <div className="text-xs bg-gray-50 border border-gray-200 p-3 rounded-lg text-gray-700 mb-4">
                      <span className="font-semibold text-gray-900">Attempted Solutions: </span>
                      {selectedBlocker.attempted_solutions}
                    </div>
                  )}

                  {/* Quick AI Diagnosis Callout Banner */}
                  {selectedBlocker.ai_suggestions && typeof selectedBlocker.ai_suggestions === 'object' && !Array.isArray(selectedBlocker.ai_suggestions) && (
                    <div className="p-3.5 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 border border-indigo-200/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">🤖</span>
                        <div>
                          <span className="text-xs font-bold text-indigo-950 block">AI Auto-Resolver Diagnosis Ready</span>
                          <p className="text-[11px] text-gray-600 line-clamp-1">
                            {selectedBlocker.ai_suggestions.root_cause || 'Actionable fix steps synthesized from workspace history'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveBlockerTab(activeBlockerTab === 'ai_resolver' ? 'discussion' : 'ai_resolver')}
                        className="text-xs px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-xs transition-colors whitespace-nowrap self-end sm:self-auto flex items-center gap-1"
                      >
                        <span>{activeBlockerTab === 'ai_resolver' ? 'Switch to Discussion' : 'View Fix Steps & Past Solutions'}</span>
                        <span>→</span>
                      </button>
                    </div>
                  )}

                  {aiAdvice && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="p-4 bg-purple-50 border border-purple-200 rounded-lg mt-4"
                    >
                      <div className="font-semibold text-purple-900 mb-2">🤖 AI Mentor Advice</div>
                      <p className="text-purple-800 whitespace-pre-wrap">{aiAdvice}</p>
                      <button onClick={() => setAiAdvice('')} className="text-purple-600 text-sm mt-2">
                        Hide
                      </button>
                    </motion.div>
                  )}
                </div>

                {/* Workspace Navigation Tabs: Discussion vs. AI Auto-Resolver */}
                <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveBlockerTab('discussion')}
                      className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                        activeBlockerTab === 'discussion'
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                          : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
                      }`}
                      data-testid="blocker-tab-discussion"
                    >
                      <span>💬</span>
                      <span>Discussion</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                          activeBlockerTab === 'discussion' ? 'bg-indigo-700 text-white' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {messages.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveBlockerTab('ai_resolver')}
                      className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                        activeBlockerTab === 'ai_resolver'
                          ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                          : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
                      }`}
                      data-testid="blocker-tab-ai"
                    >
                      <span>🤖</span>
                      <span>AI Auto-Resolver</span>
                      {selectedBlocker.ai_suggestions && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                          Ready
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Side-by-Side Split View toggle for desktop */}
                  <div className="hidden lg:flex items-center">
                    <button
                      type="button"
                      onClick={() => setActiveBlockerTab(activeBlockerTab === 'split' ? 'discussion' : 'split')}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        activeBlockerTab === 'split'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
                      }`}
                      title="View Discussion and AI Solutions side-by-side"
                    >
                      <span>🔲</span>
                      <span>{activeBlockerTab === 'split' ? 'Single View' : 'Side-by-Side'}</span>
                    </button>
                  </div>
                </div>

                {/* Workspace Panels: Tabbed or Side-by-Side */}
                {activeBlockerTab === 'split' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Left Column: Discussion */}
                    <div className="pro-card p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Discussion</h3>
                      <div className="space-y-3 mb-4 max-h-[400px] overflow-y-auto">
                        {messagesLoading ? (
                          <div role="status" className="text-center text-gray-500 py-6 text-sm">
                            <div className="spinner w-5 h-5 mx-auto mb-2"></div>
                            Loading messages...
                          </div>
                        ) : messagesError ? (
                          <div role="alert" className="text-center py-6">
                            <p className="text-red-600 text-sm mb-2">{messagesError}</p>
                            <button
                              type="button"
                              onClick={() => selectedBlocker && loadMessages(selectedBlocker.blocker_id, messagesRequestVersion.current, true)}
                              className="btn-secondary text-xs"
                            >
                              Retry
                            </button>
                          </div>
                        ) : (
                          <>
                            {messages.map((msg) => (
                              <div
                                key={msg.message_id}
                                className={`flex gap-3 ${msg.user_id === user?.user_id ? 'flex-row-reverse' : ''}`}
                              >
                                <div className="avatar w-8 h-8 text-xs flex-shrink-0">
                                  {(msg.user?.full_name || 'User').split(/\s+/).filter(Boolean).map((n: string) => n[0] || '').join('').toUpperCase().slice(0, 2)}
                                </div>
                                <div className={`flex-1 ${msg.user_id === user?.user_id ? 'text-right' : ''}`}>
                                  <div className="text-xs text-gray-600 mb-1">
                                    {msg.user?.full_name} • {new Date(msg.created_at).toLocaleTimeString()}
                                  </div>
                                  <div className={`inline-block p-3 rounded-lg ${
                                    msg.user_id === user?.user_id
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-gray-100 text-gray-900'
                                  }`}>
                                    {msg.message_text}
                                  </div>
                                </div>
                              </div>
                            ))}
                            {messages.length === 0 && (
                              <p className="text-sm text-gray-500 text-center py-6">No messages yet. Start the discussion below.</p>
                            )}
                          </>
                        )}
                      </div>

                      <form onSubmit={handleSendMessage} className="flex gap-2">
                        <input
                          type="text"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Type a message..."
                          className="input-field flex-1"
                        />
                        <button type="submit" className="btn-primary">
                          Send
                        </button>
                      </form>
                    </div>

                    {/* Right Column: AI Auto-Resolver */}
                    <div className="pro-card p-6">
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">🤖</span>
                          <h4 className="font-bold text-gray-900 text-sm">Groq AI Auto-Resolver</h4>
                        </div>
                        <button
                          type="button"
                          onClick={handleAutoResolve}
                          disabled={autoResolving}
                          className="text-xs text-purple-700 hover:text-purple-900 font-medium flex items-center gap-1 hover:underline disabled:opacity-50"
                        >
                          {autoResolving ? 'Analyzing...' : '⚡ Re-run'}
                        </button>
                      </div>

                      {selectedBlocker.ai_suggestions && typeof selectedBlocker.ai_suggestions === 'object' && !Array.isArray(selectedBlocker.ai_suggestions) ? (
                        <div className="space-y-4">
                          {selectedBlocker.ai_suggestions.root_cause && (
                            <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-100">
                              <div className="text-xs font-bold text-indigo-950 flex items-center gap-1 mb-1">
                                <span>🔍</span> Root Cause
                              </div>
                              <p className="text-xs text-gray-800 leading-relaxed">{selectedBlocker.ai_suggestions.root_cause}</p>
                            </div>
                          )}

                          {Array.isArray(selectedBlocker.ai_suggestions.recommended_fix_steps) && (
                            <div className="p-3 bg-white rounded-lg border border-gray-200">
                              <div className="text-xs font-bold text-gray-900 mb-2">🛠️ Fix Steps</div>
                              <ol className="space-y-1.5 pl-0.5">
                                {selectedBlocker.ai_suggestions.recommended_fix_steps.map((step: string, sIdx: number) => (
                                  <li key={sIdx} className="text-xs text-gray-800 flex items-start gap-2">
                                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold mt-0.5">
                                      {sIdx + 1}
                                    </span>
                                    <span className="flex-1 font-mono text-[11px] bg-slate-50 px-2 py-1 rounded border border-gray-200 text-gray-900">
                                      {step.replace(/^Step\s*\d+:\s*/i, '')}
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {Array.isArray(selectedBlocker.ai_suggestions.matched_past_solutions) && selectedBlocker.ai_suggestions.matched_past_solutions.length > 0 && (
                            <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200">
                              <div className="text-xs font-bold text-amber-900 mb-2">💡 Matched Tickets ({selectedBlocker.ai_suggestions.matched_past_solutions.length})</div>
                              <div className="space-y-2">
                                {selectedBlocker.ai_suggestions.matched_past_solutions.map((match: any, mIdx: number) => (
                                  <div key={mIdx} className="p-2 bg-white rounded border border-amber-100 text-xs">
                                    <div className="flex items-center justify-between font-semibold text-amber-950">
                                      <span>{match.title}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleCopySolution(match.resolution_notes, match.blocker_id || `match-${mIdx}`)}
                                        className="text-[10px] px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold rounded"
                                      >
                                        {copiedId === (match.blocker_id || `match-${mIdx}`) ? '✓ Copied' : 'Copy'}
                                      </button>
                                    </div>
                                    {match.resolution_notes && (
                                      <div className="mt-1 font-mono text-[10px] text-gray-700 bg-amber-50/50 p-1.5 rounded">{match.resolution_notes}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-xs text-gray-500 mb-3">No AI resolution cached for this ticket yet.</p>
                          <button
                            type="button"
                            onClick={handleAutoResolve}
                            disabled={autoResolving}
                            className="btn-primary text-xs"
                          >
                            Run AI Auto-Resolver 🚀
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : activeBlockerTab === 'ai_resolver' ? (
                  /* AI Auto-Resolver Tab View */
                  <div className="pro-card p-6" data-testid="ai-resolver-panel">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">🤖</span>
                        <div>
                          <h3 className="font-bold text-gray-900 text-base">Groq AI Auto-Resolver & Knowledge Match</h3>
                          <p className="text-xs text-gray-500">Synthesized against past resolved tickets and institutional memory</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveBlockerTab('discussion')}
                          className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                        >
                          <span>💬</span>
                          <span>Team Discussion</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleAutoResolve}
                          disabled={autoResolving}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1 disabled:opacity-50"
                        >
                          {autoResolving ? 'Analyzing...' : '⚡ Re-run AI Resolver'}
                        </button>
                      </div>
                    </div>

                    {selectedBlocker.ai_suggestions && typeof selectedBlocker.ai_suggestions === 'object' && !Array.isArray(selectedBlocker.ai_suggestions) ? (
                      <div className="space-y-4">
                        {/* Root cause */}
                        {selectedBlocker.ai_suggestions.root_cause && (
                          <div className="p-4 bg-indigo-50/70 rounded-xl border border-indigo-100">
                            <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5 mb-1.5">
                              <span>🔍</span> Identified Root Cause
                            </div>
                            <p className="text-xs text-gray-800 leading-relaxed font-sans">{selectedBlocker.ai_suggestions.root_cause}</p>
                          </div>
                        )}

                        {/* Fix steps */}
                        {Array.isArray(selectedBlocker.ai_suggestions.recommended_fix_steps) && selectedBlocker.ai_suggestions.recommended_fix_steps.length > 0 && (
                          <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-2xs">
                            <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5 mb-2.5">
                              <span>🛠️</span> Actionable Fix Steps
                            </div>
                            <ol className="space-y-2">
                              {selectedBlocker.ai_suggestions.recommended_fix_steps.map((step: string, sIdx: number) => (
                                <li key={sIdx} className="text-xs text-gray-800 flex items-start gap-2.5">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold mt-0.5">
                                    {sIdx + 1}
                                  </span>
                                  <span className="flex-1 font-mono text-xs bg-slate-50 px-3 py-2 rounded-lg border border-gray-200 text-gray-900">
                                    {step.replace(/^Step\s*\d+:\s*/i, '')}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {/* Matched Historical Solutions */}
                        {Array.isArray(selectedBlocker.ai_suggestions.matched_past_solutions) && selectedBlocker.ai_suggestions.matched_past_solutions.length > 0 && (
                          <div className="p-4 bg-amber-50/80 rounded-xl border border-amber-200">
                            <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5 mb-2.5">
                              <span>💡</span> Past Solved Tickets in Workspace ({selectedBlocker.ai_suggestions.matched_past_solutions.length})
                            </div>
                            <div className="space-y-2.5">
                              {selectedBlocker.ai_suggestions.matched_past_solutions.map((match: any, mIdx: number) => (
                                <div key={mIdx} className="p-3 bg-white rounded-lg border border-amber-200 text-xs shadow-2xs">
                                  <div className="flex items-center justify-between font-semibold text-amber-950">
                                    <span>{match.title}</span>
                                    <span className="text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                                      {match.resolver_name ? `Solved by ${match.resolver_name}` : 'Solved'}
                                      {match.team_name ? ` (${match.team_name})` : ''}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-amber-900 mt-1 italic">{match.relevance_explanation}</p>
                                  {match.resolution_notes && (
                                    <div className="mt-2 p-2.5 bg-amber-50/50 rounded border border-amber-200/80 flex items-start justify-between gap-2">
                                      <div className="font-mono text-[11px] text-gray-800 flex-1 whitespace-pre-wrap">{match.resolution_notes}</div>
                                      <button
                                        type="button"
                                        onClick={() => handleCopySolution(match.resolution_notes, match.blocker_id || `match-${mIdx}`)}
                                        className="text-[10px] px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 font-semibold rounded flex-shrink-0 transition-all"
                                      >
                                        {copiedId === (match.blocker_id || `match-${mIdx}`) ? '✓ Copied' : 'Copy'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Preventative Tip */}
                        {selectedBlocker.ai_suggestions.preventative_tip && (
                          <div className="p-3 bg-purple-50/80 rounded-xl border border-purple-200 text-xs text-purple-950 flex items-center gap-2">
                            <span className="text-base">🛡️</span>
                            <span><strong>Preventative Tip:</strong> {selectedBlocker.ai_suggestions.preventative_tip}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-10 space-y-3">
                        <span className="text-3xl block">🤖</span>
                        <h4 className="font-bold text-gray-900 text-sm">No AI suggestions generated yet</h4>
                        <p className="text-xs text-gray-500 max-w-sm mx-auto">
                          Synthesize root cause analysis and actionable fix steps against past resolved tickets in your workspace.
                        </p>
                        <button
                          type="button"
                          onClick={handleAutoResolve}
                          disabled={autoResolving}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-600/20 transition-all"
                        >
                          {autoResolving ? 'Analyzing...' : 'Run AI Auto-Resolver 🚀'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Default Tab: Discussion & Team Collaboration */
                  <div className="pro-card p-6" data-testid="blocker-discussion-panel">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                      <div>
                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                          <span>💬 Discussion & Collaboration</span>
                          <span className="text-xs text-gray-500 font-normal">({messages.length} messages)</span>
                        </h3>
                        <p className="text-xs text-gray-500">Real-time team chat and problem-solving channel</p>
                      </div>

                      {selectedBlocker.ai_suggestions && (
                        <button
                          type="button"
                          onClick={() => setActiveBlockerTab('ai_resolver')}
                          className="text-xs px-2.5 py-1 text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg font-semibold flex items-center gap-1 transition-colors"
                        >
                          <span>🤖</span>
                          <span>View AI Fix Steps</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-3 mb-4 max-h-[420px] overflow-y-auto">
                      {messagesLoading ? (
                        <div role="status" className="text-center text-gray-500 py-6 text-sm">
                          <div className="spinner w-5 h-5 mx-auto mb-2"></div>
                          Loading messages...
                        </div>
                      ) : messagesError ? (
                        <div role="alert" className="text-center py-6">
                          <p className="text-red-600 text-sm mb-2">{messagesError}</p>
                          <button
                            type="button"
                            onClick={() => selectedBlocker && loadMessages(selectedBlocker.blocker_id, messagesRequestVersion.current, true)}
                            className="btn-secondary text-xs"
                          >
                            Retry
                          </button>
                        </div>
                      ) : (
                        <>
                          {messages.map((msg) => (
                            <div
                              key={msg.message_id}
                              className={`flex gap-3 ${msg.user_id === user?.user_id ? 'flex-row-reverse' : ''}`}
                            >
                              <div className="avatar w-8 h-8 text-xs flex-shrink-0">
                                {(msg.user?.full_name || 'User').split(/\s+/).filter(Boolean).map((n: string) => n[0] || '').join('').toUpperCase().slice(0, 2)}
                              </div>
                              <div className={`flex-1 ${msg.user_id === user?.user_id ? 'text-right' : ''}`}>
                                <div className="text-xs text-gray-600 mb-1">
                                  {msg.user?.full_name} • {new Date(msg.created_at).toLocaleTimeString()}
                                </div>
                                <div className={`inline-block p-3 rounded-lg ${
                                  msg.user_id === user?.user_id
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-900'
                                }`}>
                                  {msg.message_text}
                                </div>
                              </div>
                            </div>
                          ))}
                          {messages.length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-6">No messages yet. Start the discussion below.</p>
                          )}
                        </>
                      )}
                    </div>

                    <form onSubmit={handleSendMessage} className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="input-field flex-1 text-sm"
                      />
                      <button type="submit" className="btn-primary">
                        Send
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ) : (
              <div className="pro-card p-12 text-center">
                <div className="text-6xl mb-4">💬</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Blocker Selected</h3>
                <p className="text-gray-600">Select a blocker or create a new one</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="pro-card p-6 w-full max-w-md"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Report Blocker</h2>
              <form onSubmit={handleCreateBlocker} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                  <input
                    type="text"
                    value={newBlocker.title}
                    onChange={(e) => setNewBlocker({ ...newBlocker, title: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={newBlocker.description}
                    onChange={(e) => setNewBlocker({ ...newBlocker, description: e.target.value })}
                    className="input-field resize-none"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">What have you attempted?</label>
                  <textarea
                    value={newBlocker.attemptedSolutions}
                    onChange={(e) => setNewBlocker({ ...newBlocker, attemptedSolutions: e.target.value })}
                    placeholder="e.g. Tried restarting server, changed env var, checked network tab..."
                    className="input-field resize-none text-xs"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                    <select
                      value={newBlocker.blockerType}
                      onChange={(e) => setNewBlocker({ ...newBlocker, blockerType: e.target.value })}
                      className="input-field"
                    >
                      <option value="technical">Technical</option>
                      <option value="resource">Resource</option>
                      <option value="dependency">Dependency</option>
                      <option value="clarity">Clarity</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Severity</label>
                    <select
                      value={newBlocker.severity}
                      onChange={(e) => setNewBlocker({ ...newBlocker, severity: e.target.value })}
                      className="input-field"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Creating...' : 'Create Blocker'}
                  </button>
                  <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showResolveModal && selectedBlocker && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="pro-card p-6 w-full max-w-lg"
            >
              <div className="flex items-center gap-2 mb-2 text-green-700">
                <span className="text-xl">✅</span>
                <h2 className="text-xl font-bold text-gray-900">Resolve Blocker</h2>
              </div>
              <p className="text-xs text-gray-600 mb-4">
                Marking <strong>"{selectedBlocker.title}"</strong> as solved. Sharing your solution helps teammates and trains the AI Auto-Resolver!
              </p>
              <form onSubmit={handleConfirmResolve} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-1">
                    Applied Resolution & Notes (Optional but recommended)
                  </label>
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="e.g. Fixed by adding proxy target 127.0.0.1 in vite.config.ts and bumping Axios timeout to 20s..."
                    className="input-field resize-none font-mono text-xs"
                    rows={4}
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    💡 This resolution will be securely indexed into your team and classroom institutional memory.
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Resolving...' : 'Confirm Resolution'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResolveModal(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Blocker Work Activity Timeline Modal */}
      {showTimelineModal && selectedBlocker && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <WorkActivityTimeline
            artifactType="blocker"
            artifactId={selectedBlocker.blocker_id}
            title={selectedBlocker.title}
            onClose={() => setShowTimelineModal(false)}
          />
        </div>
      )}
    </div>
  );
}
