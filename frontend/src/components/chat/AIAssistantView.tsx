import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import * as api from '../../services/api';

interface AIMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  data?: any;
  timestamp: string;
}

interface QuickActionItem {
  id: string;
  title: string;
  desc: string;
  prompt: string;
  iconBg: string;
  icon: React.ReactNode;
  leaderOnly?: boolean;
}

const ALL_QUICK_CARDS: QuickActionItem[] = [
  {
    id: 'tasks-today',
    title: 'My tasks for today',
    desc: 'See assigned tasks and priorities',
    prompt: 'My tasks for today',
    iconBg: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: 'attention',
    title: 'What needs attention?',
    desc: 'High priority & overdue work',
    prompt: 'What needs my attention?',
    iconBg: 'bg-red-50 text-red-600 border-red-100',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  {
    id: 'proj-summary',
    title: 'Project summary',
    desc: 'Status & progress overview',
    prompt: 'Project summary',
    iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'team-overview',
    title: 'Team overview',
    desc: 'See how your team is progressing',
    prompt: 'How is my team progressing?',
    leaderOnly: true,
    iconBg: 'bg-blue-50 text-blue-600 border-blue-100',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    id: 'create-team',
    title: 'Create a team',
    desc: 'Step-by-step guidance',
    prompt: 'How do I create a team?',
    iconBg: 'bg-amber-50 text-amber-600 border-amber-100',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
];

const SUGGESTION_CHIPS = [
  'What should I focus on?',
  'My pending goals',
  'Summarize this project',
  'Who needs my attention?',
  'Explain this page',
  'How do task submissions work?',
  'Show overdue tasks',
  'How do I create a class?',
];

export default function AIAssistantView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.full_name?.split(' ')[0] || user?.username || 'there';
  const isLeader = user?.role === 'team_leader' || user?.role === 'admin' || user?.role === 'classroom_coordinator';

  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const personalizedQuickCards = ALL_QUICK_CARDS.filter(
    (card) => !card.leaderOnly || isLeader
  );

  const scrollToBottom = () => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSendPrompt = async (promptText: string) => {
    const text = promptText.trim();
    if (!text || loading) return;

    const userMsg: AIMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setLoading(true);

    try {
      const res = await api.sendAIAssistantMessage(text, undefined, undefined, { path: '/chat' });
      const payload = res.data?.data;

      const aiMsg: AIMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: payload?.answer || payload?.message || 'I could not process that request.',
        data: payload,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg: AIMessage = {
        id: `ai-err-${Date.now()}`,
        sender: 'ai',
        text: err.response?.data?.error || 'An error occurred while connecting to CommandCenter AI.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/60 overflow-hidden">
      {/* AI Assistant Header */}
      <div className="px-4 py-3 bg-white border-b border-slate-200/80 flex items-center justify-between shadow-2xs shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-extrabold text-slate-900 leading-none">AI Assistant</h2>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                Copilot
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">Your CommandCenter Work Copilot</p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearChat}
            className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear
          </button>
        )}
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* COMPACT HERO PANEL */}
        {messages.length === 0 && (
          <div className="bg-gradient-to-r from-indigo-600 via-indigo-600 to-indigo-700 rounded-xl p-4 text-white shadow-xs relative overflow-hidden shrink-0">
            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-xs text-white text-[10px] font-extrabold uppercase tracking-wider">
                  <svg className="w-3 h-3 text-amber-300" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
                  </svg>
                  WORK COPILOT
                </div>
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight leading-tight">
                  Hi {firstName}! What do you need to know about your work?
                </h1>
                <p className="text-xs text-indigo-100/90 leading-normal">
                  Ask about your tasks, projects, teams, classes, or CommandCenter guidance.
                </p>
              </div>

              {/* Robot Vector Artwork */}
              <div className="hidden sm:flex items-center justify-center shrink-0 w-14 h-14 rounded-xl bg-white/15 border border-white/20 text-amber-300">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* COMPACT QUICK ACTION BUTTONS */}
        {messages.length === 0 && (
          <div className="space-y-2">
            <h3 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Quick Actions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {personalizedQuickCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleSendPrompt(card.prompt)}
                  className="bg-white rounded-xl border border-slate-200/80 p-2.5 text-left shadow-2xs hover:shadow-xs hover:border-indigo-300 transition-all group cursor-pointer flex items-center gap-2.5"
                >
                  <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${card.iconBg}`}>
                    {card.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                      {card.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate">{card.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SUGGESTION CHIPS */}
        {messages.length === 0 && (
          <div className="space-y-2">
            <h3 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">You can also ask...</h3>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTION_CHIPS.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendPrompt(chip)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
                >
                  <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI CONVERSATION STREAM */}
        {messages.length > 0 && (
          <div className="space-y-4 pt-1">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  {isUser ? (
                    <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                      {firstName.slice(0, 2).toUpperCase()}
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-slate-900 text-amber-300 font-extrabold text-xs flex items-center justify-center shrink-0 shadow-2xs border border-slate-800">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 shadow-2xs text-xs leading-relaxed ${
                      isUser
                        ? 'bg-indigo-600 text-white font-medium rounded-tr-xs'
                        : 'bg-white border border-slate-200/90 text-slate-800 rounded-tl-xs space-y-2'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.text}</div>

                    {/* Action Cards Navigation */}
                    {msg.data?.action?.type === 'navigate' && msg.data?.action?.targetUrl && (
                      <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(msg.data.action.targetUrl)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                        >
                          {msg.data.action.label || 'Open View'}
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-slate-900 text-amber-300 flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="bg-white rounded-2xl rounded-tl-xs p-3 border border-slate-200 text-xs text-slate-500 flex items-center gap-2 shadow-2xs">
                  <div className="spinner w-3.5 h-3.5 text-indigo-600" />
                  Analyzing workspace data...
                </div>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>
        )}
      </div>

      {/* AI COMPOSER */}
      <div className="p-3 bg-white border-t border-slate-200/80 space-y-1.5 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendPrompt(inputMessage);
          }}
          className="flex items-center gap-2"
        >
          {/* Attachment Paperclip Button (Disabled with Tooltip) */}
          <button
            type="button"
            disabled
            title="File uploads for AI processing are coming soon. Normal chat supports text & attachments."
            className="w-8 h-8 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 opacity-60 flex items-center justify-center shrink-0 cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          <div className="relative flex-1">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask me anything about your work..."
              className="w-full text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 py-2 px-3.5 outline-hidden transition-all text-slate-900 placeholder:text-slate-400"
            />
          </div>

          <button
            type="submit"
            disabled={!inputMessage.trim() || loading}
            className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white flex items-center justify-center shrink-0 shadow-xs transition-colors cursor-pointer"
            title="Send prompt"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </form>

        <p className="text-[10px] text-slate-400 text-center">
          Tip: You can ask about tasks, projects, teams, or get help using CommandCenter.
        </p>
      </div>
    </div>
  );
}

