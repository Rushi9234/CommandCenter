import { useState } from 'react';

const MAX_LENGTH = 4000;

export default function ChatComposer({
  onSend,
  disabled,
}: {
  onSend: (body: string) => Promise<void>;
  disabled: boolean;
}) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const trimmedLength = value.trim().length;
  const canSend = trimmedLength > 0 && trimmedLength <= MAX_LENGTH && !sending && !disabled;

  const handleSend = async () => {
    const body = value.trim();
    if (!body || body.length > MAX_LENGTH || sending) return;
    setSending(true);
    setError('');
    try {
      await onSend(body);
      setValue('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200/90 bg-white px-4 sm:px-6 py-3.5 shadow-sm">
      {error && (
        <p role="alert" className="text-xs text-red-600 mb-2 font-medium">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2.5">
        <div className="flex-1 relative">
          <label htmlFor="chat-composer" className="sr-only">
            Type a message
          </label>
          <textarea
            id="chat-composer"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || sending}
            placeholder="Type a message... (Press Enter to send, Shift+Enter for newline)"
            rows={2}
            maxLength={MAX_LENGTH + 200}
            className="w-full text-sm rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none px-3.5 py-2.5 outline-hidden transition-all disabled:bg-gray-50 text-gray-900 placeholder:text-gray-400"
          />
          <div className="text-[10px] text-gray-400 mt-1 text-right font-medium">
            {value.length} / {MAX_LENGTH}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          aria-label="Send message"
          className="btn-primary p-3 rounded-xl shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 transition-transform active:scale-95 mb-4"
        >
          {sending ? (
            <div className="spinner w-4 h-4 text-white"></div>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
