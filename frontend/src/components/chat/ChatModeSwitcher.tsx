export type ChatMode = 'team' | 'ai';

interface ChatModeSwitcherProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  className?: string;
}

export default function ChatModeSwitcher({ mode, onModeChange, className = '' }: ChatModeSwitcherProps) {
  return (
    <div className={`flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80 ${className}`}>
      <button
        type="button"
        onClick={() => onModeChange('team')}
        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
          mode === 'team'
            ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/60'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        Team & Direct
      </button>

      <button
        type="button"
        onClick={() => onModeChange('ai')}
        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
          mode === 'ai'
            ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/60'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        AI Assistant
      </button>
    </div>
  );
}
