import ConversationAvatar from './ConversationAvatar';
import { ChatConversation, getConversationTitle } from './types';

export default function ChatHeader({ conversation, onBack }: { conversation: ChatConversation; onBack: () => void }) {
  const title = getConversationTitle(conversation);

  return (
    <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-gray-200 bg-white/95 backdrop-blur-xs shadow-xs z-10">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="lg:hidden p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <ConversationAvatar conversation={conversation} size="sm" />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900 truncate">{title}</h2>
            {conversation.type === 'team' ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100/80 text-blue-800">
                Team Chat
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                Direct Message
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
