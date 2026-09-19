import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';
import AttentionActionCenter from '../components/AttentionActionCenter';
import CompactTeamSelector from '../components/common/CompactTeamSelector';
import WorkPulseFeed from '../components/WorkPulseFeed';

export default function Pulse() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [entryText, setEntryText] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const aiChatPanelRef = useRef<HTMLDivElement | null>(null);
  const suggestionsPanelRef = useRef<HTMLDivElement | null>(null);
  const [aiChatMessage, setAiChatMessage] = useState('');
  const [aiChatHistory, setAiChatHistory] = useState<any[]>([]);
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  // Assigned Tasks
  const [assignedTasks, setAssignedTasks] = useState<any[]>([]);
  const [assignedTasksLoading, setAssignedTasksLoading] = useState(false);

  // Daily Work (Team Scoped)
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

  // History
  const [showHistory, setShowHistory] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const wordCount = entryText.trim().split(/\s+/).filter(Boolean).length;
  const charCount = entryText.length;
  const progress = Math.min((charCount / 200) * 100, 100);

  const currentDateFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  useEffect(() => {
    loadLogs();
    loadSuggestions();
    loadMyTeams();
    loadAssignedTasks();
  }, []);

  // When a quick action opens a panel, bring the panel into view so the
  // button click has an immediate, visible effect instead of only toggling state.
  useEffect(() => {
    if (showAIChat) {
      requestAnimationFrame(() => {
        aiChatPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [showAIChat]);

  useEffect(() => {
    if (showSuggestions && suggestions) {
      requestAnimationFrame(() => {
        suggestionsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [showSuggestions, suggestions]);

  useEffect(() => {
    setTodaysSubmission(null);
    setWorkEntries([]);
    setDraftSummary(null);
    setConfirmedSummary('');
    setNewEntryText('');

    setShowHistory(false);
    setHistoryRecords([]);
    setHistoryLoaded(false);

    if (!selectedTeam) return;

    loadTeamWorkState(selectedTeam);
  }, [selectedTeam]);

  const loadMyTeams = async () => {
    try {
      const response = await api.getMyTeams();
      setMyTeams(response.data.data || []);
    } catch (error) {
      console.error('Failed to load teams:', error);
    } finally {
      setTeamsLoading(false);
    }
  };

  const loadAssignedTasks = async () => {
    setAssignedTasksLoading(true);
    try {
      const response = await api.getMyTasks();
      setAssignedTasks(response?.data?.data || []);
    } catch (error) {
      // Safe catch for unit tests / network error
    } finally {
      setAssignedTasksLoading(false);
    }
  };

  const loadTeamWorkState = async (teamId: string) => {
    setTeamDataLoading(true);
    try {
      const submissionsRes = await api.getTeamWorkSubmissions(teamId);
      const mine = (submissionsRes.data.data || []).find((s: any) => s.user_id === user?.user_id);

      if (mine) {
        setTodaysSubmission(mine);
      } else {
        const entriesRes = await api.getTodaysWorkEntries(teamId);
        setWorkEntries(entriesRes.data.data || []);
      }
    } catch (error) {
      console.error('Failed to load daily work state:', error);
    } finally {
      setTeamDataLoading(false);
    }
  };

  const resyncSubmissionState = async () => {
    if (!selectedTeam) return;
    try {
      const submissionsRes = await api.getTeamWorkSubmissions(selectedTeam);
      const mine = (submissionsRes.data.data || []).find((s: any) => s.user_id === user?.user_id);
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

  const handleToggleHistory = async () => {
    const opening = !showHistory;
    setShowHistory(opening);

    if (opening && !historyLoaded && selectedTeam) {
      setHistoryLoading(true);
      try {
        const response = await api.getWorkHistory(selectedTeam, 30);
        setHistoryRecords(response.data.data || []);
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
      setLogs(response.data.data || []);
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
      const context = `User is logging daily work. Recent logs: ${logs.slice(0, 2).map((l) => l.entry_summary || l.entry_text.substring(0, 100)).join('. ')}`;
      const response = await api.chatWithAI(aiChatMessage, context);
      const aiMessage = { role: 'assistant', content: response.data.data || response.data };
      setAiChatHistory([...newHistory, aiMessage]);
    } catch (error: any) {
      console.error('AI chat error:', error);
      const errorMessage = {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.response?.data?.error || error.message || 'Please try again.'}`,
      };
      setAiChatHistory([...newHistory, errorMessage]);
    } finally {
      setAiChatLoading(false);
    }
  };

  const handleOpenTask = (projectId: string, taskId: string) => {
    navigate(`/projects?projectId=${projectId}&taskId=${taskId}`);
  };

  const todayLogs = logs.filter((log) => {
    const logDate = new Date(log.log_date).toDateString();
    const today = new Date().toDateString();
    return logDate === today;
  });

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'medium':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'low':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16 font-sans">
      {/* LEVEL 1 — INDIVIDUAL HIERARCHICAL CONTEXT BAR */}
      <div className="bg-slate-900 text-slate-100 border-b border-slate-800 px-6 py-2.5 text-xs" data-testid="individual-hierarchy-bar">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-400">Context:</span>
            <span className="bg-blue-900/60 border border-blue-700/60 text-blue-200 px-2.5 py-0.5 rounded-md font-bold flex items-center gap-1">
              <svg className="w-3.5 h-3.5 inline mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Individual (My Work)
            </span>
            {myTeams.length > 0 && (
              <>
                <span className="text-slate-500 font-mono">›</span>
                <CompactTeamSelector
                  teams={myTeams}
                  selectedTeamId={selectedTeam || null}
                  onSelectTeam={(t) => setSelectedTeam(t.team_id)}
                  compact={true}
                  placeholder="Filter my teams..."
                />
              </>
            )}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <svg className="w-3.5 h-3.5 inline text-slate-400 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Personal logs are private to you.</span>
          </div>
        </div>
      </div>

      {/* WORK ACTIVITY HEADER (LIGHT SAAS DESIGN) */}
      <div className="bg-white border-b border-gray-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-xs shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Work Activity</h1>
                <p className="text-sm text-slate-500 mt-0.5">Stay updated, track your work, and make meaningful progress.</p>
              </div>
            </div>

            <div className="flex items-center gap-4 sm:gap-6 flex-wrap self-stretch justify-between lg:self-auto lg:justify-end">
              <div className="hidden sm:flex items-center gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-semibold text-slate-700">
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>{currentDateFormatted}</span>
              </div>

              <div className="flex items-center gap-2 px-3.5 py-2 bg-amber-50/70 border border-amber-200/60 rounded-xl text-xs font-medium text-amber-900">
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span className="hidden sm:inline">Small steps every day lead to big results.</span>
                <span className="sm:hidden">Keep pushing forward.</span>
              </div>

              <div className="flex items-center gap-4 border-l border-slate-200 pl-4 sm:pl-6">
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-black bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
                    {user?.streak_count || 0}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Streak</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    {user?.impact_score || 0}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Impact</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-black text-emerald-600">
                    {todayLogs.length}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Today's Logs</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* QUICK ACTION CARDS (4 CARD GRID) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Add Daily Log */}
          <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-5 transition-all hover:shadow-md hover:border-blue-200 flex flex-col justify-between group">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <h3 className="font-bold text-slate-900 text-base">Add Daily Log</h3>
              <p className="text-xs text-slate-600 leading-relaxed">Record what you worked on today.</p>
            </div>
            <div className="pt-4">
              <button
                onClick={() => {
                  const el = document.getElementById('new-log-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full py-2 px-3 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs shadow-blue-600/20 transition-all flex items-center justify-center gap-1.5"
              >
                <span>+ Add Daily Log</span>
                <span>→</span>
              </button>
            </div>
          </div>

          {/* Card 2: AI Chat */}
          <div className="bg-purple-50/60 border border-purple-100 rounded-2xl p-5 transition-all hover:shadow-md hover:border-purple-200 flex flex-col justify-between group">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l1.5 4.5L19 9l-4.5 1.5L13 15l-1.5-4.5L7 9l4.5-1.5L13 3z" />
                </svg>
              </div>
              <h3 className="font-bold text-slate-900 text-base">AI Chat</h3>
              <p className="text-xs text-slate-600 leading-relaxed">Get help, ideas, and suggestions.</p>
            </div>
            <div className="pt-4">
              <button
                onClick={() => setShowAIChat((visible) => !visible)}
                className="w-full py-2 px-3 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-xs shadow-purple-600/20 transition-all flex items-center justify-center gap-1.5"
              >
                <span>{showAIChat ? 'Hide AI Chat' : 'Open AI Chat'}</span>
                <span>→</span>
              </button>
            </div>
          </div>

          {/* Card 3: Get Suggestions */}
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-5 transition-all hover:shadow-md hover:border-emerald-200 flex flex-col justify-between group">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3a7 7 0 00-7 7c0 2.38 1.156 4.49 2.94 5.819.516.384.82.997.82 1.641V18a1 1 0 001 1h4a1 1 0 001-1v-.54c0-.644.304-1.257.82-1.641C17.844 14.49 19 12.38 19 10a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="font-bold text-slate-900 text-base">Get Suggestions</h3>
              <p className="text-xs text-slate-600 leading-relaxed">Find focus areas and next steps.</p>
            </div>
            <div className="pt-4">
              <button
                onClick={() => {
                  if (!suggestions) loadSuggestions();
                  setShowSuggestions(!showSuggestions);
                }}
                className="w-full py-2 px-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5"
              >
                <span>{showSuggestions ? 'Hide Suggestions' : 'View Suggestions'}</span>
                <span>→</span>
              </button>
            </div>
          </div>

          {/* Card 4: View Reports */}
          <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-5 transition-all hover:shadow-md hover:border-amber-200 flex flex-col justify-between group">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="font-bold text-slate-900 text-base">View Reports</h3>
              <p className="text-xs text-slate-600 leading-relaxed">See your work insights and progress.</p>
            </div>
            <div className="pt-4">
              <button
                onClick={() => navigate('/analytics')}
                className="w-full py-2 px-3 text-xs font-bold bg-white hover:bg-amber-100/60 text-amber-800 border border-amber-300/80 rounded-xl transition-all flex items-center justify-center gap-1.5"
              >
                <span>View Analytics</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>

        {/* TWO-COLUMN LAYOUT: MY ASSIGNED WORK + TODAY'S DAILY WORK */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: MY ASSIGNED WORK & ADD LOG FORM */}
          <div className="lg:col-span-7 space-y-6">
            {/* MY ASSIGNED WORK CARD */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-base">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 text-lg tracking-tight">My Assigned Work</h2>
                    <p className="text-xs text-slate-500">Tasks assigned to you from all your teams and projects.</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/projects')}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <span>View All</span>
                  <span>→</span>
                </button>
              </div>

              {assignedTasksLoading ? (
                <div className="space-y-3 py-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="animate-pulse bg-slate-50 rounded-xl p-4 border border-slate-100 flex items-center justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                        <div className="h-3 bg-slate-200 rounded w-1/3"></div>
                      </div>
                      <div className="h-8 bg-slate-200 rounded w-24"></div>
                    </div>
                  ))}
                </div>
              ) : assignedTasks.length === 0 ? (
                <div className="py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 space-y-2">
                  <div className="w-8 h-8 text-slate-400 mx-auto flex items-center justify-center">
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">No tasks currently assigned to you</p>
                  <p className="text-xs text-slate-500">Tasks assigned to you across teams will appear here automatically.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {assignedTasks.slice(0, 6).map((task) => (
                    <div
                      key={task.task_id}
                      className="p-4 rounded-xl border border-slate-200/80 bg-white hover:border-blue-300 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{task.title}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getPriorityBadgeClass(task.priority)}`}>
                            {task.priority || 'Medium'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                          <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                            <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            {task.project_name || 'Project'}
                          </span>
                          {task.team_name && (
                            <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                              <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              {task.team_name}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Assigned by <strong className="text-slate-600">{task.reviewer_name || task.assigned_by || 'Team Leader'}</strong>
                          {task.created_at && ` · ${new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                        </p>
                      </div>

                      <button
                        onClick={() => handleOpenTask(task.project_id, task.task_id)}
                        className="px-3.5 py-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50/70 hover:bg-blue-100/80 border border-blue-200/80 rounded-xl transition-all self-end sm:self-center shrink-0 flex items-center gap-1"
                      >
                        <span>Open Task</span>
                        <span>→</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ATTENTION ACTION CENTER */}
            <AttentionActionCenter scope="INDIVIDUAL" />

            {/* ADD NEW LOG ENTRY SECTION */}
            <div id="new-log-section" className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">Add New Log</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Capture what you worked on while your AI Assistant stays available alongside you.</p>
                </div>
              </div>

              <textarea
                value={entryText}
                onChange={(e) => setEntryText(e.target.value)}
                placeholder="What are you working on? Be specific about your progress, challenges, and next steps..."
                className="input-field min-h-[160px] resize-none font-body text-sm leading-relaxed"
                maxLength={5000}
              />

              {charCount > 0 && (
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full bg-blue-600" />
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <div className="text-xs text-slate-500">
                  <span className={wordCount < 10 ? 'text-rose-600 font-semibold' : 'text-slate-900 font-semibold'}>{wordCount} words</span>
                  {' • '}
                  <span>{charCount}/5000 characters</span>
                </div>

                <button onClick={handleSubmit} disabled={loading || charCount < 10} className="btn-primary text-xs disabled:opacity-50">
                  {loading ? 'Submitting...' : 'Submit Log'}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: TODAY'S DAILY WORK */}
          <div className="lg:col-span-5 space-y-6">
            {/* TODAY'S DAILY WORK CARD */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-base">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 text-lg tracking-tight">Today's Daily Work</h2>
                    <p className="text-xs text-slate-500">Your submitted work for today.</p>
                  </div>
                </div>
                <button onClick={() => handleToggleHistory()} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  <span>View All</span>
                  <span>→</span>
                </button>
              </div>

              {/* Team Selector Combobox */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Team Context</label>
                <select
                  aria-label="Select a team"
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className="input-field text-xs py-2"
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

              {/* Submission Ring / Metrics Banner */}
              <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full border-4 border-emerald-500 flex items-center justify-center text-emerald-800 font-black text-lg bg-white shrink-0">
                  {todaysSubmission ? 1 : workEntries.length}
                </div>
                <div>
                  <div className="font-bold text-emerald-900 text-sm">Logs submitted</div>
                  <div className="text-xs text-emerald-700 mt-0.5">Keep going! Great progress.</div>
                </div>
              </div>

              {/* Empty / Loading States */}
              {!teamsLoading && myTeams.length === 0 && (
                <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  You're not on any team yet. Join or create one from the Teams page to log team work.
                </p>
              )}

              {myTeams.length > 0 && !selectedTeam && (
                <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  Select a team above to log or view today's work.
                </p>
              )}

              {selectedTeam && teamDataLoading && <p className="text-xs text-slate-500">Loading...</p>}

              {/* Submitted Work Display */}
              {selectedTeam && !teamDataLoading && todaysSubmission && (
                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-900 text-xs">Today's work submitted</span>
                    {todaysSubmission.confirmed_at && (
                      <span className="text-[11px] font-semibold text-emerald-700">
                        {new Date(todaysSubmission.confirmed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-emerald-800 whitespace-pre-wrap leading-relaxed">{todaysSubmission.confirmed_summary}</p>
                </div>
              )}

              {/* Unsubmitted Work Entries & Log Submission Form */}
              {selectedTeam && !teamDataLoading && !todaysSubmission && (
                <div className="space-y-3">
                  {workEntries.length === 0 ? (
                    <p className="text-xs text-slate-500 py-1">No entries yet today for this team.</p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {workEntries.map((entry) => (
                        <div key={entry.entry_id} className="text-xs text-slate-700 p-2.5 bg-slate-50 rounded-lg border border-slate-200/70">
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
                      className="input-field flex-1 text-xs"
                      maxLength={1000}
                      disabled={addingEntry}
                    />
                    <button onClick={handleAddEntry} disabled={addingEntry || newEntryText.trim().length === 0} className="btn-secondary text-xs disabled:opacity-50">
                      {addingEntry ? 'Adding...' : 'Add Entry'}
                    </button>
                  </div>

                  {workEntries.length > 0 && draftSummary === null && (
                    <button onClick={handleSummarizeWork} disabled={summarizing} className="w-full btn-secondary text-xs disabled:opacity-50">
                      {summarizing ? 'Generating...' : 'Get AI Summary'}
                    </button>
                  )}

                  {draftSummary !== null && (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="block text-xs font-bold text-slate-700">Review and confirm your summary</label>
                      <textarea
                        value={confirmedSummary}
                        onChange={(e) => setConfirmedSummary(e.target.value)}
                        className="input-field min-h-[100px] text-xs resize-none"
                        maxLength={5000}
                      />
                      <button onClick={handleSubmitWork} disabled={submittingWork || confirmedSummary.trim().length < 10} className="w-full btn-primary text-xs disabled:opacity-50">
                        {submittingWork ? 'Submitting...' : "Submit Today's Work"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Past History Toggle */}
              {selectedTeam && !teamDataLoading && (
                <div className="pt-3 border-t border-slate-100">
                  <button onClick={handleToggleHistory} className="text-xs font-bold text-blue-600 hover:text-blue-700">
                    {showHistory ? 'Hide past submissions' : 'View past submissions'}
                  </button>

                  {showHistory && (
                    <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
                      {historyLoading ? (
                        <p className="text-xs text-slate-500">Loading...</p>
                      ) : historyRecords.length === 0 ? (
                        <p className="text-xs text-slate-500">No past submissions yet for this team.</p>
                      ) : (
                        historyRecords.map((record) => (
                          <div key={record.work_date} className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                            <div className="text-xs font-bold text-slate-900 mb-1">
                              {new Date(record.work_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <p className="text-xs text-slate-600 whitespace-pre-wrap">{record.confirmed_summary}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* AI ASSISTANT — PERSISTENT WORK COMPANION */}
              <motion.div
                ref={aiChatPanelRef}
                id="ai-assistant-panel"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-purple-50 via-white to-blue-50 border border-purple-200/80 rounded-2xl p-5 shadow-sm space-y-4 scroll-mt-24"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                      <span className="text-lg">✦</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-slate-900 text-base">AI Assistant</h2>
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Beta</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">Your intelligent work companion</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setAiChatMessage('How do I use CommandCenter?');
                      requestAnimationFrame(() => aiChatPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
                    }}
                    className="text-xs font-bold text-purple-700 hover:text-purple-900"
                  >
                    Help Center
                  </button>
                </div>

                <div className="p-3.5 bg-white/80 border border-purple-100 rounded-xl">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm shrink-0">🤖</div>
                    <div className="text-xs text-slate-700 leading-relaxed">
                      <p className="font-semibold text-slate-900 mb-1">Hi! 👋</p>
                      <p>I can help with your work, answer questions, suggest next steps, draft updates, and explain CommandCenter features.</p>
                    </div>
                  </div>
                </div>

                {aiChatHistory.length > 0 && (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {aiChatHistory.map((msg, i) => (
                      <div key={i} className={`p-2.5 rounded-xl text-xs ${msg.role === 'user' ? 'bg-blue-100 text-blue-900 ml-6' : 'bg-purple-100 text-purple-900 mr-6'}`}>
                        {msg.content}
                      </div>
                    ))}
                    {aiChatLoading && <div className="p-2.5 bg-purple-100 text-purple-900 mr-6 rounded-xl text-xs italic">Thinking...</div>}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => { setShowSuggestions(true); loadSuggestions(); }} className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 bg-white border border-emerald-200 rounded-full hover:bg-emerald-50">
                    💡 Suggest next steps
                  </button>
                  <button onClick={() => setAiChatMessage('Draft a status update from my recent work.')} className="px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 bg-white border border-blue-200 rounded-full hover:bg-blue-50">
                    📝 Draft a status update
                  </button>
                  <button onClick={() => setAiChatMessage('Summarize my recent tasks.')} className="px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 bg-white border border-blue-200 rounded-full hover:bg-blue-50">
                    🔎 Summarize my tasks
                  </button>
                  <button onClick={() => setAiChatMessage('How do I use CommandCenter?')} className="px-2.5 py-1.5 text-[11px] font-semibold text-purple-700 bg-white border border-purple-200 rounded-full hover:bg-purple-50">
                    ❓ Help Center
                  </button>
                </div>

                <div className="flex gap-2">
                  <input type="text" value={aiChatMessage} onChange={(e) => setAiChatMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAIChat()} placeholder="Ask me anything about your work..." className="input-field flex-1 text-xs bg-white" disabled={aiChatLoading} />
                  <button onClick={handleAIChat} disabled={aiChatLoading || !aiChatMessage.trim()} className="w-10 shrink-0 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center disabled:opacity-50" aria-label="Send message">
                    {aiChatLoading ? '…' : '➤'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 text-center">AI can make mistakes. Verify important information.</p>
              </motion.div>

              {/* Add Another Log Trigger */}
              <div className="pt-2">
                <button
                  onClick={() => {
                    const el = document.getElementById('new-log-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="w-full py-2 px-3 text-xs font-bold text-blue-600 bg-blue-50/50 hover:bg-blue-100/60 border border-blue-200 rounded-xl transition-all"
                >
                  + Add Another Log
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RECENT ACTIVITY CONTAINER */}
        <WorkPulseFeed scope={selectedTeam ? 'TEAM' : 'INDIVIDUAL'} teamId={selectedTeam || undefined} />
      </div>

      {/* SUCCESS NOTIFICATION ALERT */}
      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed bottom-6 right-6 z-50 alert alert-success shadow-lg">
            <div>
              <div className="font-bold text-xs">Log submitted successfully!</div>
              <div className="text-[11px]">AI analysis complete</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FULL LOG MODAL */}
      <AnimatePresence>
        {selectedLog && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setSelectedLog(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onClick={(e) => e.stopPropagation()} className="pro-card p-6 w-full max-w-2xl max-h-[80vh] overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900">{new Date(selectedLog.created_at).toLocaleString()}</h2>
                <button onClick={() => setSelectedLog(null)} className="btn-ghost text-xs">
                  Close
                </button>
              </div>

              {selectedLog.bullet_points && selectedLog.bullet_points.length > 0 && (
                <div className="mb-4 p-4 bg-blue-50/70 border border-blue-200 rounded-xl">
                  <h3 className="font-bold text-blue-900 text-xs mb-2">Key Points</h3>
                  <div className="space-y-1.5">
                    {selectedLog.bullet_points.map((point: string, i: number) => (
                      <div key={i} className="text-xs text-blue-800 flex items-start gap-1.5">
                        <span className="text-blue-500">•</span>
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{selectedLog.entry_text}</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}