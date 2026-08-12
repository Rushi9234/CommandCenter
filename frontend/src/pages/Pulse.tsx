import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

export default function Pulse() {
  const { user } = useAuth();
  const [entryText, setEntryText] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [aiChatMessage, setAiChatMessage] = useState('');
  const [aiChatHistory, setAiChatHistory] = useState<any[]>([]);
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  // Milestone 52: Daily Work is team-scoped (unlike the personal daily_logs
  // flow above), so it needs its own explicit team selector -- no default,
  // matching Goals.tsx/Projects.tsx's existing page-local pattern rather
  // than inventing a global team context.
  const [myTeams, setMyTeams] = useState<any[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [teamDataLoading, setTeamDataLoading] = useState(false);
  const [todaysSubmission, setTodaysSubmission] = useState<any>(null);
  const [workEntries, setWorkEntries] = useState<any[]>([]);
  const [newEntryText, setNewEntryText] = useState('');
  const [draftSummary, setDraftSummary] = useState<string | null>(null);
  const [confirmedSummary, setConfirmedSummary] = useState('');
  const [addingEntry, setAddingEntry] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [submittingWork, setSubmittingWork] = useState(false);

  // Milestone 53: personal Daily Work history -- collapsed by default
  // (on-demand load, not fetched automatically on team selection, to
  // avoid a third automatic request per team switch on top of M52's
  // existing two). Independent of today's Daily Work state above.
  const [showHistory, setShowHistory] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const wordCount = entryText.trim().split(/\s+/).filter(Boolean).length;
  const charCount = entryText.length;
  const progress = Math.min((charCount / 200) * 100, 100);

  useEffect(() => {
    loadLogs();
    loadSuggestions();
    loadMyTeams();
  }, []);

  // Milestone 52: selecting/switching teams always resets Daily-Work-
  // specific state before loading the newly selected team's data -- never
  // leaves a previous team's entries/submission visible while a new
  // team's data loads, and never fires a Daily Work call while
  // selectedTeam is ''.
  useEffect(() => {
    setTodaysSubmission(null);
    setWorkEntries([]);
    setDraftSummary(null);
    setConfirmedSummary('');
    setNewEntryText('');

    // Milestone 53: switching teams also collapses/resets history --
    // no team's history can appear while a different team is selected.
    setShowHistory(false);
    setHistoryRecords([]);
    setHistoryLoaded(false);

    if (!selectedTeam) return;

    loadTeamWorkState(selectedTeam);
  }, [selectedTeam]);

  const loadMyTeams = async () => {
    try {
      const response = await api.getMyTeams();
      setMyTeams(response.data.data);
    } catch (error) {
      console.error('Failed to load teams:', error);
    } finally {
      setTeamsLoading(false);
    }
  };

  // Milestone 52: already-submitted state is derived from the existing
  // GET /teams/:teamId/work-submissions read path (matching this user's
  // own row via user_id === user?.user_id, the same pattern Teams.tsx/
  // Grid.tsx/SOSHub.tsx/ExecutiveBrief.tsx already use) -- deliberately
  // NOT a 409 probe. getTodaysWorkEntries is only called when no
  // submission is found; there is nothing to show it otherwise.
  const loadTeamWorkState = async (teamId: string) => {
    setTeamDataLoading(true);
    try {
      const submissionsRes = await api.getTeamWorkSubmissions(teamId);
      const mine = submissionsRes.data.data.find((s: any) => s.user_id === user?.user_id);

      if (mine) {
        setTodaysSubmission(mine);
      } else {
        const entriesRes = await api.getTodaysWorkEntries(teamId);
        setWorkEntries(entriesRes.data.data);
      }
    } catch (error) {
      console.error('Failed to load daily work state:', error);
    } finally {
      setTeamDataLoading(false);
    }
  };

  // Milestone 52: a 409 here is a genuine write conflict (e.g. a second
  // tab submitted first), not a state-discovery mechanism -- resync by
  // re-reading the same existing endpoint loadTeamWorkState already uses.
  const resyncSubmissionState = async () => {
    if (!selectedTeam) return;
    try {
      const submissionsRes = await api.getTeamWorkSubmissions(selectedTeam);
      const mine = submissionsRes.data.data.find((s: any) => s.user_id === user?.user_id);
      if (mine) {
        setTodaysSubmission(mine);
        setWorkEntries([]);
      }
    } catch (error) {
      console.error('Failed to resync daily work submission state:', error);
    }
  };

  const handleAddEntry = async () => {
    if (!selectedTeam || newEntryText.trim().length === 0) return;

    setAddingEntry(true);
    try {
      const response = await api.createWorkEntry(selectedTeam, newEntryText);
      setWorkEntries([...workEntries, response.data.data]);
      setNewEntryText('');
    } catch (error: any) {
      if (error.response?.status === 409) {
        await resyncSubmissionState();
      } else {
        alert(error.response?.data?.error || 'Failed to add entry');
      }
    } finally {
      setAddingEntry(false);
    }
  };

  const handleSummarizeWork = async () => {
    if (!selectedTeam || workEntries.length === 0) return;

    setSummarizing(true);
    try {
      const response = await api.summarizeWork(selectedTeam);
      setDraftSummary(response.data.data.draftSummary);
      setConfirmedSummary(response.data.data.draftSummary);
    } catch (error: any) {
      if (error.response?.status === 409) {
        await resyncSubmissionState();
      } else {
        alert(error.response?.data?.error || 'Failed to generate summary');
      }
    } finally {
      setSummarizing(false);
    }
  };

  const handleSubmitWork = async () => {
    if (!selectedTeam || confirmedSummary.trim().length < 10) return;

    setSubmittingWork(true);
    try {
      const response = await api.submitWork(selectedTeam, confirmedSummary, draftSummary || undefined);
      // Milestone 52: uses the submit call's own response directly --
      // no refetch of getTeamWorkSubmissions needed or performed.
      setTodaysSubmission(response.data.data);
      setWorkEntries([]);
      setDraftSummary(null);
      setConfirmedSummary('');
    } catch (error: any) {
      if (error.response?.status === 409) {
        await resyncSubmissionState();
      } else {
        alert(error.response?.data?.error || 'Failed to submit work');
      }
    } finally {
      setSubmittingWork(false);
    }
  };

  // Milestone 53: loads history only the first time it's opened for the
  // currently selected team (historyLoaded guards against a needless
  // refetch on every collapse/expand toggle within the same team).
  const handleToggleHistory = async () => {
    const opening = !showHistory;
    setShowHistory(opening);

    if (opening && !historyLoaded && selectedTeam) {
      setHistoryLoading(true);
      try {
        const response = await api.getWorkHistory(selectedTeam, 30);
        setHistoryRecords(response.data.data);
        setHistoryLoaded(true);
      } catch (error: any) {
        alert(error.response?.data?.error || 'Failed to load past submissions');
      } finally {
        setHistoryLoading(false);
      }
    }
  };

  const loadLogs = async () => {
    try {
      const response = await api.getMyLogs(30);
      setLogs(response.data.data);
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  const loadSuggestions = async () => {
    try {
      const response = await api.getLogSuggestions();
      setSuggestions(response.data.data);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  };

  const handleSubmit = async () => {
    if (charCount < 10 || charCount > 5000) return;

    setLoading(true);
    try {
      await api.createLog(entryText);
      setSuccess(true);
      setEntryText('');
      
      setTimeout(() => setSuccess(false), 3000);
      loadLogs();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create log');
    } finally {
      setLoading(false);
    }
  };

  const handleAIChat = async () => {
    if (!aiChatMessage.trim()) return;

    const userMessage = { role: 'user', content: aiChatMessage };
    const newHistory = [...aiChatHistory, userMessage];
    setAiChatHistory(newHistory);
    setAiChatMessage('');
    setAiChatLoading(true);

    try {
      const context = `User is logging daily work. Recent logs: ${logs.slice(0, 2).map(l => l.entry_summary || l.entry_text.substring(0, 100)).join('. ')}`;
      const response = await api.chatWithAI(aiChatMessage, context);
      const aiMessage = { role: 'assistant', content: response.data.data || response.data };
      setAiChatHistory([...newHistory, aiMessage]);
    } catch (error: any) {
      console.error('AI chat error:', error);
      const errorMessage = { 
        role: 'assistant', 
        content: `Sorry, I encountered an error: ${error.response?.data?.error || error.message || 'Please try again.'}` 
      };
      setAiChatHistory([...newHistory, errorMessage]);
    } finally {
      setAiChatLoading(false);
    }
  };

  const todayLogs = logs.filter(log => {
    const logDate = new Date(log.log_date).toDateString();
    const today = new Date().toDateString();
    return logDate === today;
  });

  const getSentimentBadge = (score: number) => {
    if (score > 0.3) return { text: 'Positive', class: 'badge-green' };
    if (score < -0.3) return { text: 'Challenging', class: 'badge-yellow' };
    return { text: 'Neutral', class: 'badge-gray' };
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Daily Pulse</h1>
              <p className="text-gray-600 mt-2">Track your work progress throughout the day</p>
            </div>
            
            <div className="flex items-center gap-8">
              <div className="text-center">
                <div className="text-4xl font-bold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
                  {user?.streak_count || 0}
                </div>
                <div className="text-sm text-gray-600 mt-1">Day Streak</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  {user?.impact_score || 0}
                </div>
                <div className="text-sm text-gray-600 mt-1">Impact Score</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-green-600">
                  {todayLogs.length}
                </div>
                <div className="text-sm text-gray-600 mt-1">Today's Logs</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* New Log Entry */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="pro-card p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Add New Log</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAIChat(!showAIChat)}
                    className="btn-secondary text-sm"
                  >
                    {showAIChat ? 'Hide' : 'AI Chat'}
                  </button>
                  {!showSuggestions && suggestions && (
                    <button
                      onClick={() => setShowSuggestions(true)}
                      className="btn-secondary text-sm"
                    >
                      Get Suggestions
                    </button>
                  )}
                </div>
              </div>

              {/* AI Chat */}
              {showAIChat && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-purple-900">Chat with AI Assistant</h3>
                    <button 
                      onClick={() => setShowAIChat(false)} 
                      className="text-purple-600 text-sm hover:text-purple-800"
                    >
                      Close
                    </button>
                  </div>
                  <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                    {aiChatHistory.map((msg, i) => (
                      <div key={i} className={`p-2 rounded text-sm ${
                        msg.role === 'user' 
                          ? 'bg-blue-100 text-blue-900 ml-8' 
                          : 'bg-purple-100 text-purple-900 mr-8'
                      }`}>
                        {msg.content}
                      </div>
                    ))}
                    {aiChatLoading && (
                      <div className="p-2 bg-purple-100 text-purple-900 mr-8 rounded text-sm">
                        <span className="spinner w-3 h-3 inline-block mr-2"></span>
                        Thinking...
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={aiChatMessage}
                      onChange={(e) => setAiChatMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAIChat()}
                      placeholder="Ask AI for help..."
                      className="input-field flex-1 text-sm"
                      disabled={aiChatLoading}
                    />
                    <button 
                      onClick={handleAIChat} 
                      disabled={aiChatLoading} 
                      className="btn-primary text-sm"
                    >
                      {aiChatLoading ? '...' : 'Send'}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* AI Suggestions */}
              {showSuggestions && suggestions && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-blue-900">AI Suggestions</h3>
                    <button onClick={() => setShowSuggestions(false)} className="text-blue-600 text-sm">
                      Hide
                    </button>
                  </div>
                  <div className="space-y-2">
                    {suggestions.suggestions?.map((s: string, i: number) => (
                      <div key={i} className="text-sm text-blue-700 flex items-start gap-2">
                        <span className="text-blue-400">•</span>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              <textarea
                value={entryText}
                onChange={(e) => setEntryText(e.target.value)}
                placeholder="What are you working on? Be specific about your progress, challenges, and next steps..."
                className="input-field min-h-[200px] resize-none font-body text-base leading-relaxed"
                maxLength={5000}
              />

              {charCount > 0 && (
                <div className="mt-3">
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-600">
                  <span className={wordCount < 10 ? 'text-red-600 font-medium' : 'text-gray-900 font-medium'}>
                    {wordCount} words
                  </span>
                  {' • '}
                  <span>{charCount}/5000 characters</span>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={loading || charCount < 10}
                  className="btn-primary disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="spinner w-4 h-4"></span>
                      Submitting...
                    </span>
                  ) : (
                    'Submit Log'
                  )}
                </button>
              </div>
            </motion.div>

            {/* Daily Work (Milestone 52) -- team-scoped, independent of the
                personal daily_logs flow above; requires an explicitly
                selected team before any Daily Work API call fires. */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="pro-card p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Daily Work</h2>
                <select
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className="input-field text-sm"
                  disabled={teamsLoading}
                >
                  <option value="">{teamsLoading ? 'Loading teams...' : 'Select a team'}</option>
                  {myTeams.map((team) => (
                    <option key={team.team_id} value={team.team_id}>
                      {team.team_name}
                    </option>
                  ))}
                </select>
              </div>

              {!teamsLoading && myTeams.length === 0 && (
                <p className="text-sm text-gray-600">
                  You're not on any team yet. Join or create one from the Teams page to log team work.
                </p>
              )}

              {myTeams.length > 0 && !selectedTeam && (
                <p className="text-sm text-gray-600">Select a team above to log or view today's work.</p>
              )}

              {selectedTeam && teamDataLoading && (
                <p className="text-sm text-gray-600">Loading...</p>
              )}

              {selectedTeam && !teamDataLoading && todaysSubmission && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-green-900">Today's work submitted</span>
                    {todaysSubmission.confirmed_at && (
                      <span className="text-xs text-green-700">
                        {new Date(todaysSubmission.confirmed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-green-800 whitespace-pre-wrap">{todaysSubmission.confirmed_summary}</p>
                </div>
              )}

              {selectedTeam && !teamDataLoading && !todaysSubmission && (
                <div className="space-y-4">
                  {workEntries.length === 0 ? (
                    <p className="text-sm text-gray-600">No entries yet today for this team.</p>
                  ) : (
                    <div className="space-y-2">
                      {workEntries.map((entry) => (
                        <div key={entry.entry_id} className="text-sm text-gray-700 p-2 bg-gray-50 rounded">
                          {entry.entry_text}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newEntryText}
                      onChange={(e) => setNewEntryText(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddEntry()}
                      placeholder="What did you work on?"
                      className="input-field flex-1 text-sm"
                      maxLength={1000}
                      disabled={addingEntry}
                    />
                    <button
                      onClick={handleAddEntry}
                      disabled={addingEntry || newEntryText.trim().length === 0}
                      className="btn-secondary text-sm disabled:opacity-50"
                    >
                      {addingEntry ? 'Adding...' : 'Add Entry'}
                    </button>
                  </div>

                  {workEntries.length > 0 && draftSummary === null && (
                    <button
                      onClick={handleSummarizeWork}
                      disabled={summarizing}
                      className="btn-secondary text-sm disabled:opacity-50"
                    >
                      {summarizing ? 'Generating...' : 'Get AI Summary'}
                    </button>
                  )}

                  {draftSummary !== null && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Review and confirm your summary
                      </label>
                      <textarea
                        value={confirmedSummary}
                        onChange={(e) => setConfirmedSummary(e.target.value)}
                        className="input-field min-h-[120px] text-sm resize-none"
                        maxLength={5000}
                      />
                      <button
                        onClick={handleSubmitWork}
                        disabled={submittingWork || confirmedSummary.trim().length < 10}
                        className="btn-primary text-sm disabled:opacity-50"
                      >
                        {submittingWork ? 'Submitting...' : "Submit Today's Work"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Personal history (Milestone 53) -- collapsed by default,
                  loaded on first expand; independent of today's state above. */}
              {selectedTeam && !teamDataLoading && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={handleToggleHistory}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    {showHistory ? 'Hide past submissions' : 'View past submissions'}
                  </button>

                  {showHistory && (
                    <div className="mt-3 space-y-2">
                      {historyLoading ? (
                        <p className="text-sm text-gray-600">Loading...</p>
                      ) : historyRecords.length === 0 ? (
                        <p className="text-sm text-gray-600">No past submissions yet for this team.</p>
                      ) : (
                        historyRecords.map((record) => (
                          <div key={record.work_date} className="p-3 bg-gray-50 rounded-lg">
                            <div className="text-sm font-medium text-gray-900 mb-1">
                              {new Date(record.work_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.confirmed_summary}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>

            {/* Today's Logs */}
            {todayLogs.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="pro-card p-6"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Today's Logs ({todayLogs.length})</h2>
                <div className="space-y-4">
                  {todayLogs.map((log) => (
                    <div key={log.log_id} className="pro-card-hover p-4 border-l-4 border-blue-500">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">
                          {new Date(log.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{log.word_count} words</span>
                          {log.sentiment_score !== null && (
                            <span className={`badge ${getSentimentBadge(log.sentiment_score).class} text-xs`}>
                              {getSentimentBadge(log.sentiment_score).text}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {log.bullet_points && log.bullet_points.length > 0 ? (
                        <div className="space-y-1">
                          {log.bullet_points.map((point: string, i: number) => (
                            <div key={i} className="text-sm text-gray-700 flex items-start gap-2">
                              <span className="text-blue-500 mt-1">•</span>
                              <span>{point}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-700 line-clamp-3">{log.entry_text}</p>
                      )}
                      
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-xs text-blue-600 hover:text-blue-700 mt-2"
                      >
                        View Full Log
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            <AnimatePresence>
              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="alert alert-success"
                >
                  <div>
                    <div className="font-semibold">Log submitted successfully!</div>
                    <div className="text-sm">AI analysis complete</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sidebar */}
          <div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="pro-card p-6"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {logs.slice(0, 15).map((log) => (
                  <div key={log.log_id} className="pro-card-hover p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        {new Date(log.log_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(log.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {log.entry_summary || log.entry_text}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Full Log Modal */}
      <AnimatePresence>
        {selectedLog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedLog(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="pro-card p-6 w-full max-w-2xl max-h-[80vh] overflow-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {new Date(selectedLog.created_at).toLocaleString()}
                </h2>
                <button onClick={() => setSelectedLog(null)} className="btn-ghost">
                  Close
                </button>
              </div>
              
              {selectedLog.bullet_points && selectedLog.bullet_points.length > 0 && (
                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-semibold text-blue-900 mb-2">Key Points</h3>
                  <div className="space-y-2">
                    {selectedLog.bullet_points.map((point: string, i: number) => (
                      <div key={i} className="text-sm text-blue-800 flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="prose max-w-none">
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedLog.entry_text}</p>
              </div>
              
              {selectedLog.entry_summary && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">AI Summary</h3>
                  <p className="text-gray-700 text-sm">{selectedLog.entry_summary}</p>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
