import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { sendAIAssistantMessage } from '../../services/api';
import { AIAction } from '../../utils/aiActionRoutes';
import ActionGroup from './ActionGroup';
import AttentionCard from './AttentionCard';
import ProjectSummaryCard, { ProjectSummaryData } from './ProjectSummaryCard';
import TeamSummaryCard, { TeamSummaryData } from './TeamSummaryCard';
import FollowUpChips from './FollowUpChips';
import SafeMarkdown from './SafeMarkdown';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isError?: boolean;
  sources?: Array<{ title: string; internalUrl?: string }>;
  disambiguation?: {
    message: string;
    options: Array<{ label: string; scopeType: string; scopeId: string }>;
  };
  structuredData?: any;
  actions?: AIAction[];
  followUpChips?: string[];
}

function cleanSourceTitle(title: string): string {
  switch (title) {
    case 'getMyTasks':
    case 'getMyWorkLogs':
    case 'getPersonalAttentionItems':
      return 'Personal Work';
    case 'getProjectSummary':
      return 'Project Execution';
    case 'getTeamSummary':
    case 'getClassSummary':
    case 'getClassMemberWork':
      return 'Team Progress';
    case 'searchProductHelp':
      return 'Product Help';
    default:
      return title;
  }
}

interface AIAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIAssistantDrawer: React.FC<AIAssistantDrawerProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const params = useParams<{ classId?: string; teamId?: string; projectId?: string }>();
  const searchParams = new URLSearchParams(location.search);
  const activeProjectId = params.projectId || searchParams.get('projectId') || null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Position & Minimized Persistence (Sections 11 & 12)
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('cc_copilot_position');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { x: 0, y: 0 };
  });

  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cc_copilot_minimized') === 'true';
    } catch {
      return false;
    }
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const toggleMinimize = () => {
    setIsMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cc_copilot_minimized', String(next));
      } catch {}
      return next;
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (window.innerWidth < 640) return;

    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    e.preventDefault();

    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;

    const rawX = dragStartRef.current.initialX + deltaX;
    const rawY = dragStartRef.current.initialY + deltaY;

    const drawerWidth = Math.min(window.innerWidth - 32, 420);
    const drawerHeight = isMinimized ? 64 : Math.min(window.innerHeight - 30, 720);

    const maxLeftDelta = -(window.innerWidth - drawerWidth - 32);
    const maxRightDelta = 0;
    const clampedX = Math.max(maxLeftDelta, Math.min(maxRightDelta, rawX));

    const maxTopDelta = 0;
    const maxBottomDelta = Math.max(0, window.innerHeight - drawerHeight - 32);
    const clampedY = Math.max(maxTopDelta, Math.min(maxBottomDelta, rawY));

    setPosition({ x: clampedX, y: clampedY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      try {
        localStorage.setItem('cc_copilot_position', JSON.stringify(position));
      } catch {}
      dragStartRef.current = null;
    }
  };

  // Re-clamp position on window resize (Section 12)
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const drawerWidth = Math.min(window.innerWidth - 32, 420);
        const drawerHeight = isMinimized ? 64 : Math.min(window.innerHeight - 30, 720);
        const maxLeftDelta = -(window.innerWidth - drawerWidth - 32);
        const maxRightDelta = 0;
        const maxTopDelta = 0;
        const maxBottomDelta = Math.max(0, window.innerHeight - drawerHeight - 32);

        return {
          x: Math.max(maxLeftDelta, Math.min(maxRightDelta, prev.x)),
          y: Math.max(maxTopDelta, Math.min(maxBottomDelta, prev.y)),
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMinimized]);

  // Context Badging (Section 3)
  const path = location.pathname;
  let activeContextBadge = 'Personal Work';

  if (path.includes('/teams') || params.teamId) {
    activeContextBadge = 'Team Progress';
  } else if (path.includes('/projects') || activeProjectId) {
    activeContextBadge = 'Project Execution';
  } else if (path.includes('/help') || path.includes('/sos')) {
    activeContextBadge = 'Product Help';
  } else {
    activeContextBadge = 'Personal Work';
  }

  // Section 2 Prompts
  const defaultPrompts = [
    'My tasks for today',
    'What needs my attention?',
    'What should I focus on?',
    'My pending goals',
    'My team overview',
    'What can you help me with?',
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, isMinimized]);

  if (!isOpen) return null;

  const handleSend = async (messageText?: string, explicitScopeType?: string, explicitScopeId?: string) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!messageText) setInput('');
    setLoading(true);

    const pageContext = {
      path,
      classId: params.classId || null,
      teamId: params.teamId || null,
      projectId: activeProjectId,
    };

    try {
      const response = await sendAIAssistantMessage(textToSend, explicitScopeType, explicitScopeId, pageContext);
      const data = response.data?.data || response.data;

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: data.answer || 'Response received.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: data.sources,
        disambiguation: data.disambiguation,
        structuredData: data.structuredData,
        actions: data.actions,
        followUpChips: data.followUpChips,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      // Section 15 Clean Error State
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        isError: true,
        text: 'Something went wrong while retrieving that information.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDisambiguationClick = (opt: { label: string; scopeType: string; scopeId: string }) => {
    handleSend(opt.label, opt.scopeType, opt.scopeId);
  };

  const isAttentionTool = (msg: Message) =>
    msg.sources?.some((s) => s.title === 'getPersonalAttentionItems') ||
    (msg.structuredData && (msg.structuredData.overdue_tasks || msg.structuredData.high_priority_tasks));

  const isProjectTool = (msg: Message) =>
    msg.sources?.some((s) => s.title === 'getProjectSummary') ||
    (msg.structuredData && msg.structuredData.project_id && msg.structuredData.project_name);

  const isTeamTool = (msg: Message) =>
    msg.sources?.some((s) => s.title === 'getTeamSummary') ||
    (msg.structuredData && msg.structuredData.team_id && msg.structuredData.team_name);

  return (
    <div
      className="fixed top-16 right-4 z-50 pointer-events-auto"
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0px)`,
        touchAction: 'none',
      }}
      data-testid="ai-drawer"
    >
      <div
        className={`w-full sm:w-[420px] bg-white rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden transition-all duration-200 ${
          isMinimized ? 'h-14' : 'h-[calc(100vh-5rem)] max-h-[720px]'
        }`}
      >
        {/* Header (Section 1) */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900 text-white select-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          title="Drag by header to move copilot panel"
          aria-label="Draggable Work Copilot Header"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-indigo-400 font-bold text-sm">✦</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-xs tracking-tight text-white">Work Copilot</h2>
                <span className="text-[10px] text-slate-400 font-medium border-l border-slate-700 pl-2">
                  Automatic Context AI
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Minimize / Expand (Section 1) */}
            <button
              onClick={toggleMinimize}
              className="text-slate-400 hover:text-white px-2 py-0.5 rounded text-sm font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-400"
              aria-label={isMinimized ? 'Expand Copilot Panel' : 'Minimize Copilot Panel'}
              title={isMinimized ? 'Expand Copilot' : 'Minimize Copilot'}
            >
              −
            </button>

            {/* Close (Section 1) */}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white px-2 py-0.5 rounded text-sm font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-400"
              aria-label="Close Work Copilot"
              title="Close Copilot"
            >
              ×
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Context Badge Bar (Section 3) */}
            <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200/70 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium text-[11px]">Context:</span>
                <span className="font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full text-[11px]">
                  {activeContextBadge}
                </span>
              </div>

              {/* Explain Page Action (Section 18) */}
              <button
                onClick={() => handleSend('Explain this page')}
                disabled={loading}
                className="px-2.5 py-0.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-[11px] rounded-lg border border-slate-200 transition-colors flex items-center gap-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                title="Get concise overview of current page"
                aria-label="Explain current page"
              >
                <span>Explain Page</span>
              </button>
            </div>

            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 select-text">
              {/* Empty State (Section 2) */}
              {messages.length === 0 && (
                <div className="py-6 px-3 text-center space-y-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center mx-auto text-base font-bold">
                    ✦
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">What do you need help with?</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                      Ask about your work, priorities, teams, projects, or CommandCenter.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-left">
                    {defaultPrompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSend(prompt)}
                        className="px-3 py-2 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-slate-800 text-xs font-semibold rounded-xl border border-slate-200/80 transition-all flex items-center justify-between group focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      >
                        <span>{prompt}</span>
                        <span className="text-slate-400 group-hover:text-indigo-600 text-xs transition-colors">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message List */}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[94%] rounded-2xl p-3.5 text-xs leading-relaxed space-y-3 ${
                      msg.sender === 'user'
                        ? 'bg-slate-900 text-white rounded-tr-xs shadow-2xs font-medium'
                        : msg.isError
                        ? 'bg-rose-50 border border-rose-200 text-rose-900 rounded-tl-xs shadow-2xs'
                        : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs shadow-2xs'
                    }`}
                  >
                    {/* Error State with Try Again (Section 15) */}
                    {msg.isError ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-rose-700 font-bold">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span>Request Error</span>
                        </div>
                        <p className="text-slate-700">{msg.text}</p>
                        <button
                          onClick={() => handleSend(messages[messages.length - 2]?.text || 'Retry')}
                          className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition-colors shadow-2xs"
                        >
                          Try Again
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Safe Markdown Rendering (Section 17) */}
                        <SafeMarkdown text={msg.text} />

                        {/* Structured Cards */}
                        {msg.sender === 'assistant' && isAttentionTool(msg) && (
                          <AttentionCard data={msg.structuredData || {}} onActionClick={onClose} />
                        )}

                        {msg.sender === 'assistant' && isProjectTool(msg) && msg.structuredData && (
                          <ProjectSummaryCard summary={msg.structuredData as ProjectSummaryData} onActionClick={onClose} />
                        )}

                        {msg.sender === 'assistant' && isTeamTool(msg) && msg.structuredData && (
                          <TeamSummaryCard summary={msg.structuredData as TeamSummaryData} onActionClick={onClose} />
                        )}

                        {/* Primary & Secondary Actions (Section 10) */}
                        {msg.sender === 'assistant' && msg.actions && msg.actions.length > 0 && (
                          <ActionGroup actions={msg.actions} onActionClick={onClose} />
                        )}

                        {/* Disambiguation Pills */}
                        {msg.disambiguation && (
                          <div className="mt-3 pt-2.5 border-t border-slate-100">
                            <p className="text-xs font-semibold text-slate-700 mb-2">{msg.disambiguation.message}</p>
                            <div className="space-y-1.5">
                              {msg.disambiguation.options.map((opt, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => handleDisambiguationClick(opt)}
                                  className="w-full text-left px-3 py-2 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-950 font-semibold rounded-xl text-xs transition-colors flex items-center justify-between border border-indigo-100"
                                >
                                  <span>{opt.label}</span>
                                  <span className="text-[10px] text-indigo-600 font-bold">Select Target →</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Follow-up Chips (Section 9) */}
                        {msg.sender === 'assistant' && msg.followUpChips && msg.followUpChips.length > 0 && (
                          <FollowUpChips
                            chips={msg.followUpChips}
                            onChipClick={(prompt) => handleSend(prompt)}
                            disabled={loading}
                          />
                        )}

                        {/* Source Attribution */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                            <span className="font-semibold text-slate-500">Source: </span>
                            {msg.sources.map((s, idx) => {
                              const cleanLabel = cleanSourceTitle(s.title);
                              return (
                                <span key={idx} className="mr-2 font-medium text-slate-600">
                                  {cleanLabel}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.timestamp}</span>
                </div>
              ))}

              {/* Skeleton Loading State (Section 14) */}
              {loading && (
                <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-3 shadow-2xs max-w-[90%] animate-pulse">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-indigo-200" />
                    <div className="h-3 bg-slate-200 rounded w-1/3" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2.5 bg-slate-100 rounded w-full" />
                    <div className="h-2.5 bg-slate-100 rounded w-5/6" />
                    <div className="h-2.5 bg-slate-100 rounded w-4/6" />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-7 bg-indigo-100 rounded-xl w-24" />
                    <div className="h-7 bg-slate-100 rounded-xl w-20" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer Input Area (Section 13) */}
            <div className="p-3 bg-white border-t border-slate-200/80">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Ask a question about your work..."
                  className="flex-1 bg-slate-100 text-slate-900 placeholder-slate-400 text-xs px-3.5 py-2.5 rounded-xl border border-transparent focus:border-indigo-500 focus:bg-white focus:outline-none transition-colors resize-none max-h-24 font-normal"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500 shrink-0"
                  title="Send Message"
                  aria-label="Send Message"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AIAssistantDrawer;
