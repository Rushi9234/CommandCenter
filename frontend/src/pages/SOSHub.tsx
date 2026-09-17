import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useRealtime, type RealtimeEvent } from '../hooks/useRealtime';
import * as api from '../services/api';
import WorkActivityTimeline from '../components/WorkActivityTimeline';

export default function SOSHub() {
  const { user } = useAuth();
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

  const [newBlocker, setNewBlocker] = useState({
    title: '',
    description: '',
    blockerType: 'technical',
    severity: 'medium',
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
      setNewBlocker({ title: '', description: '', blockerType: 'technical', severity: 'medium' });
      loadBlockers(selectedTeam.team_id, blockersRequestVersion.current, true);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create blocker');
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
      alert(error.response?.data?.error || 'Failed to send message');
    }
  };

  const handleResolve = async () => {
    if (!selectedBlocker) return;
    try {
      await api.updateBlocker(selectedBlocker.blocker_id, { status: 'resolved' });
      setSelectedBlocker(null);
      loadBlockers(selectedTeam.team_id, blockersRequestVersion.current, true);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to resolve blocker');
    }
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
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Active Blockers</h2>
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
                  {blockers.filter(b => b.status !== 'resolved').map((blocker) => (
                    <button
                      key={blocker.blocker_id}
                      onClick={() => setSelectedBlocker(blocker)}
                      className={`w-full text-left p-3 rounded-lg transition-all ${
                        selectedBlocker?.blocker_id === blocker.blocker_id
                          ? 'bg-blue-50 border-2 border-blue-500'
                          : 'hover:bg-gray-50 border-2 border-transparent'
                      }`}
                    >
                      <div className="font-medium text-gray-900 text-sm">{blocker.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`badge badge-${getSeverityColor(blocker.severity)} text-xs`}>
                          {blocker.severity}
                        </span>
                        <span className="text-xs text-gray-500">{blocker.message_count} msgs</span>
                      </div>
                    </button>
                  ))}
                  {blockers.filter(b => b.status !== 'resolved').length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">No active blockers.</p>
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
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowTimelineModal(true)}
                        data-testid="blocker-timeline-btn"
                        className="btn-secondary flex items-center gap-1 text-xs"
                      >
                        📜 View Timeline
                      </button>
                      <button onClick={handleGetAIAdvice} disabled={loading} className="btn-secondary text-xs">
                        🤖 AI Help
                      </button>
                      {selectedBlocker.status !== 'resolved' && (
                        <button onClick={handleResolve} className="btn-primary text-xs">
                          ✅ Resolve
                        </button>
                      )}
                    </div>
                  </div>

                  {aiAdvice && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="p-4 bg-purple-50 border border-purple-200 rounded-lg mb-4"
                    >
                      <div className="font-semibold text-purple-900 mb-2">🤖 AI Mentor Advice</div>
                      <p className="text-purple-800 whitespace-pre-wrap">{aiAdvice}</p>
                      <button onClick={() => setAiAdvice('')} className="text-purple-600 text-sm mt-2">
                        Hide
                      </button>
                    </motion.div>
                  )}
                </div>

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
