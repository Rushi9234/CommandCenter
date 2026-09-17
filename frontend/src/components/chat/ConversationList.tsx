import { useState } from 'react';
import ConversationListItem from './ConversationListItem';
import NewConversationPanel from './NewConversationPanel';
import { ChatConversation, getConversationTitle } from './types';

export default function ConversationList({
  conversations,
  loading,
  error,
  onRetry,
  selectedConversationId,
  currentUserId,
  onSelect,
  onConversationCreated,
  className = '',
}: {
  conversations: ChatConversation[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  selectedConversationId: string | null;
  currentUserId: string;
  onSelect: (conversationId: string) => void;
  onConversationCreated: (conversationId: string) => void;
  className?: string;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewConversation, setShowNewConversation] = useState(false);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredConversations = trimmedQuery
    ? conversations.filter((conversation) => {
        const title = getConversationTitle(conversation).toLowerCase();
        const preview = (conversation.last_message_preview || '').toLowerCase();
        return title.includes(trimmedQuery) || preview.includes(trimmedQuery);
      })
    : conversations;

  return (
    <div className={`flex flex-col h-full bg-white ${className}`}>
      <div className="p-4 border-b border-gray-200/90 relative bg-white">
        <div className="flex items-center justify-between mb-3.5">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Chats</h1>
          <button
            type="button"
            onClick={() => setShowNewConversation((prev) => !prev)}
            aria-label="Start a new conversation"
            aria-expanded={showNewConversation}
            className="p-2 rounded-xl text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors bg-blue-50/50"
            title="New Chat"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        <div className="relative">
          <label htmlFor="chat-search" className="sr-only">
            Search conversations
          </label>
          <input
            id="chat-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full text-sm rounded-xl border border-gray-200 bg-gray-50/70 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 py-2 pl-9 pr-8 outline-hidden transition-all text-gray-900 placeholder:text-gray-400"
          />
          <svg
            className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {showNewConversation && (
          <NewConversationPanel
            currentUserId={currentUserId}
            onClose={() => setShowNewConversation(false)}
            onCreated={(conversationId) => {
              setShowNewConversation(false);
              onConversationCreated(conversationId);
            }}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && (
          <div role="status" className="text-sm text-gray-500 text-center py-10">
            <div className="spinner w-5 h-5 mx-auto mb-2 text-blue-600"></div>
            Loading conversations...
          </div>
        )}

        {!loading && error && (
          <div role="alert" className="text-sm text-center py-8 px-3">
            <p className="text-red-600 mb-3">{error}</p>
            <button type="button" onClick={onRetry} className="btn-secondary text-xs">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && conversations.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-12 px-4">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="font-medium text-gray-700 mb-1">No conversations yet</p>
            <p className="text-xs text-gray-400 mb-4">Start a direct or team conversation to begin messaging.</p>
            <button type="button" onClick={() => setShowNewConversation(true)} className="btn-primary text-xs px-3.5 py-2">
              Start a Conversation
            </button>
          </div>
        )}

        {!loading && !error && conversations.length > 0 && filteredConversations.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No conversations match "{searchQuery}".</p>
        )}

        {!loading &&
          !error &&
          filteredConversations.map((conversation) => (
            <ConversationListItem
              key={conversation.conversation_id}
              conversation={conversation}
              isSelected={conversation.conversation_id === selectedConversationId}
              displayUnreadCount={conversation.conversation_id === selectedConversationId ? 0 : conversation.unread_count}
              onSelect={onSelect}
            />
          ))}
      </div>
    </div>
  );
}
