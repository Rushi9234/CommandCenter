import { forwardRef } from 'react';
import MessageBubble from './MessageBubble';
import { ChatConversation, ChatMessage } from './types';
import { formatDateSeparator } from '../../utils/dateUtils';

interface Props {
  conversation: ChatConversation;
  messages: ChatMessage[];
  currentUserId: string;
  loading: boolean;
  error: string;
  onRetry: () => void;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  getSenderName: (userId: string) => string | undefined;
}

const MessageList = forwardRef<HTMLDivElement, Props>(function MessageList(
  { conversation, messages, currentUserId, loading, error, onRetry, hasOlder, loadingOlder, onLoadOlder, getSenderName },
  ref
) {
  return (
    <div ref={ref} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-2 bg-gray-50/40">
      {loading && (
        <div role="status" className="text-sm text-gray-500 text-center py-12">
          <div className="spinner w-5 h-5 mx-auto mb-2 text-blue-600"></div>
          Loading messages...
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="text-sm text-center py-10">
          <p className="text-red-600 mb-3">{error}</p>
          <button type="button" onClick={onRetry} className="btn-secondary text-xs">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-center py-16 px-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3 text-blue-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-gray-900 mb-1">No messages yet</h3>
          <p className="text-xs text-gray-500 max-w-sm">Send a message below to start the conversation.</p>
        </div>
      )}

      {!loading && !error && messages.length > 0 && (
        <>
          {hasOlder && (
            <div className="text-center py-2">
              <button
                type="button"
                onClick={onLoadOlder}
                disabled={loadingOlder}
                className="btn-secondary text-xs px-3 py-1.5 shadow-xs disabled:opacity-50"
              >
                {loadingOlder ? 'Loading...' : 'Load older messages'}
              </button>
            </div>
          )}
          {messages.map((message, index) => {
            const previous = index > 0 ? messages[index - 1] : null;
            const currentSeparator = formatDateSeparator(message.created_at);
            const previousSeparator = previous ? formatDateSeparator(previous.created_at) : null;
            const showDateSeparator = Boolean(currentSeparator && currentSeparator !== previousSeparator);
            const isNewGroup = Boolean(!previous || previous.sender_user_id !== message.sender_user_id || showDateSeparator);
            const isOwn = message.sender_user_id === currentUserId;

            return (
              <div key={message.message_id} className="space-y-2">
                {showDateSeparator && (
                  <div className="flex items-center justify-center my-4">
                    <span className="text-[11px] font-semibold text-gray-500 bg-gray-200/70 px-3 py-1 rounded-full shadow-xs">
                      {currentSeparator}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={message}
                  isOwn={isOwn}
                  showSenderName={conversation.type === 'team' && isNewGroup}
                  senderName={conversation.type === 'team' ? getSenderName(message.sender_user_id) : undefined}
                  showTimestamp={isNewGroup}
                />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
});

export default MessageList;
