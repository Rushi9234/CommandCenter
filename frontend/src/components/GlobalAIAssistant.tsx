import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';
import SafeMarkdown from './ai/SafeMarkdown';

type Message = { role: 'user' | 'assistant'; content: string };

export default function GlobalAIAssistant() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [personalContext, setPersonalContext] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const openHelp = () => {
      setOpen(true);
      setMessage('How do I use CommandCenter?');
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener('commandcenter:open-ai-help', openHelp);
    return () => window.removeEventListener('commandcenter:open-ai-help', openHelp);
  }, []);

  useEffect(() => {
    if (open) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const loadPersonalContext = async () => {
      try {
        const [tasksRes, logsRes] = await Promise.all([
          api.getMyTasks(),
          api.getMyLogs(10),
        ]);

        if (cancelled) return;

        const tasks = (tasksRes?.data?.data || []).slice(0, 12).map((task: any) => ({
          title: task.title,
          status: task.status,
          priority: task.priority,
          due_date: task.due_date,
        }));

        const logs = (logsRes?.data?.data || []).slice(0, 10).map((log: any) => ({
          date: log.log_date,
          summary: log.entry_summary || log.entry_text?.slice(0, 300),
        }));

        setPersonalContext(JSON.stringify({
          scope: 'PERSONAL_ONLY',
          user_id: user?.user_id,
          user_name: user?.full_name,
          tasks,
          recent_logs: logs,
          privacy_rule: 'Use only the authenticated user’s own tasks and logs. Never infer, retrieve, summarize, or expose another member’s data, including data visible to a team leader or class owner.'
        }));
      } catch {
        if (!cancelled) {
          setPersonalContext(JSON.stringify({
            scope: 'PERSONAL_ONLY',
            user_id: user?.user_id,
            privacy_rule: 'Use only the authenticated user’s own data. Never expose another member’s data.'
          }));
        }
      }
    };

    loadPersonalContext();
    return () => { cancelled = true; };
  }, [open, user?.user_id, user?.full_name]);

  const send = async () => {
    const text = message.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: 'user', content: text };
    const nextHistory = [...history, userMessage];
    setHistory(nextHistory);
    setMessage('');
    setLoading(true);

    try {
      const response = await api.chatWithAI(
        text,
        `CommandCenter global assistant. Answer help/productivity questions and summarize only the authenticated user's personal data. Never expose another member's data. Authenticated user: ${user?.full_name || 'current user'}. Personal context: ${personalContext}`
      );
      const answer = response.data.data || response.data;
      setHistory([...nextHistory, { role: 'assistant', content: answer }]);
    } catch (error: any) {
      setHistory([
        ...nextHistory,
        {
          role: 'assistant',
          content: error.response?.data?.error || 'I could not answer that right now. Please try again.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickAsk = (text: string) => {
    setMessage(text);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 sm:right-6 z-[70] w-[min(420px,calc(100vw-2rem))] h-[560px] max-h-[calc(100vh-6rem)] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between bg-white border-b border-slate-200 px-4 py-3.5 text-slate-900">
            <div>
              <div className="flex items-center gap-2 font-bold text-sm">
                <span className="text-blue-600">✦</span>
                <span className="text-slate-900 font-bold">CommandCenter AI Copilot</span>
                <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[9px] uppercase tracking-wide font-semibold">
                  Personal
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">Help, task summaries & work insights</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Close AI assistant"
            >
              ✕
            </button>
          </div>

          {/* Conversation Body */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-[#F8FAFC] p-4 space-y-3">
            {history.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600 shadow-xs space-y-2">
                <p className="font-bold text-slate-900 text-sm">Hi! 👋 How can I help you today?</p>
                <p>
                  I can explain CommandCenter features, summarize <strong>your personal tasks and daily logs</strong>, draft status updates, or guide you through platform workflows.
                </p>
              </div>
            )}
            {history.map((item, index) => (
              <div
                key={index}
                className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  item.role === 'user'
                    ? 'ml-auto bg-[#EFF6FF] text-blue-950 border border-blue-200/80 shadow-2xs font-medium'
                    : 'bg-white text-slate-800 border border-slate-200 shadow-2xs'
                }`}
              >
                {item.role === 'assistant' ? <SafeMarkdown text={item.content} /> : item.content}
              </div>
            ))}
            {loading && (
              <div className="max-w-[88%] rounded-xl bg-white px-3.5 py-2.5 text-xs italic text-slate-500 border border-slate-200 shadow-2xs">
                Thinking...
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Footer & Controls */}
          <div className="shrink-0 border-t border-slate-200 bg-white p-3.5 space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => quickAsk("Summarize my tasks for today.")}
                className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
              >
                My tasks today
              </button>
              <button
                onClick={() => quickAsk("Summarize my recent work.")}
                className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[10px] font-semibold text-purple-700 hover:bg-purple-100 transition-colors"
              >
                My recent work
              </button>
              <button
                onClick={() => quickAsk("How do I use CommandCenter?")}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Help Center
              </button>
            </div>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Ask about your work..."
                className="input-field min-w-0 flex-1 text-xs bg-white border border-slate-200 text-slate-900 placeholder-slate-400"
                disabled={loading}
              />
              <button
                onClick={send}
                disabled={loading || !message.trim()}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-40 transition-colors flex items-center justify-center"
                aria-label="Send"
              >
                ➤
              </button>
            </div>
            <p className="text-center text-[9px] text-slate-400">
              Personal scope only • CommandCenter AI
            </p>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-5 right-5 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-blue-600 text-xl text-white shadow-lg shadow-purple-600/25 transition-transform hover:scale-105"
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
        title="CommandCenter AI"
      >
        {open ? '✕' : '✦'}
      </button>
    </>
  );
}
