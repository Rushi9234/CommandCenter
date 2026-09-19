import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import * as api from '../services/api';

type Message = { role: 'user' | 'assistant'; content: string };

export default function GlobalAIAssistant() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [personalContext, setPersonalContext] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

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
        <div className="fixed bottom-24 right-5 z-[70] w-[min(390px,calc(100vw-2rem))]">
          <div className="overflow-hidden rounded-2xl border border-purple-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 text-white">
              <div>
                <div className="flex items-center gap-2 font-bold text-sm">
                  <span>✦</span>
                  <span>CommandCenter AI</span>
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] uppercase tracking-wide">Personal</span>
                </div>
                <p className="mt-0.5 text-[10px] text-white/80">Help, summaries and next steps for your work</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Close AI assistant">✕</button>
            </div>

            <div className="max-h-[360px] space-y-2 overflow-y-auto bg-slate-50 p-3">
              {history.length === 0 && (
                <div className="rounded-xl border border-purple-100 bg-white p-3 text-xs leading-relaxed text-slate-600">
                  <p className="mb-1 font-semibold text-slate-900">Hi! 👋</p>
                  I can explain CommandCenter, summarize <strong>your</strong> tasks and logs, draft updates, or suggest next steps.
                </div>
              )}
              {history.map((item, index) => (
                <div key={index} className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed ${item.role === 'user' ? 'ml-auto bg-blue-600 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>
                  {item.content}
                </div>
              ))}
              {loading && <div className="max-w-[88%] rounded-xl bg-white px-3 py-2 text-xs italic text-slate-500 border border-slate-200">Thinking...</div>}
            </div>

            <div className="border-t border-slate-200 bg-white p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                <button onClick={() => quickAsk("Summarize my tasks for today.")} className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">My tasks today</button>
                <button onClick={() => quickAsk("Summarize my recent work.")} className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[10px] font-semibold text-purple-700">My recent work</button>
                <button onClick={() => quickAsk("How do I use CommandCenter?")} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-700">Help Center</button>
              </div>
              <div className="flex gap-2">
                <input ref={inputRef} value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask about your work..." className="input-field min-w-0 flex-1 text-xs" disabled={loading} />
                <button onClick={send} disabled={loading || !message.trim()} className="rounded-xl bg-blue-600 px-3 text-xs font-bold text-white disabled:opacity-40" aria-label="Send">➤</button>
              </div>
              <p className="mt-2 text-center text-[9px] text-slate-400">Personal scope only • AI can make mistakes</p>
            </div>
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
