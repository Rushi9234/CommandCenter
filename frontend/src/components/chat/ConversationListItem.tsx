import ConversationAvatar from './ConversationAvatar';
import { ChatConversation, getConversationTitle } from './types';
import { formatConversationTime } from '../../utils/dateUtils';

export default function ConversationListItem({
  conversation,
  isSelected,
  displayUnreadCount,
  onSelect,
}: {
  conversation: ChatConversation;
  isSelected: boolean;
  displayUnreadCount: number;
  onSelect: (conversationId: string) => void;
}) {
  const title = getConversationTitle(conversation);
  const timestamp = conversation.last_message_at ? formatConversationTime(conversation.last_message_at) : '';

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.conversation_id)}
      aria-current={isSelected ? 'true' : undefined}
      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-150 relative ${
        isSelected
          ? 'bg-blue-50/90 text-blue-950 font-semibold shadow-sm border border-blue-100'
          : 'hover:bg-gray-50/90 text-gray-700 hover:text-gray-900'
      }`}
    >
      <ConversationAvatar conversation={conversation} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-sm truncate ${isSelected ? 'font-semibold text-blue-950' : 'font-medium text-gray-900'}`}>
              {title}
            </span>
            {conversation.type === 'team' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100/70 text-blue-800 flex-shrink-0">
                Team
              </span>
            )}
          </div>
          {timestamp && <span className="text-[11px] text-gray-400 font-medium flex-shrink-0">{timestamp}</span>}
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          <p className={`text-xs truncate ${isSelected ? 'text-blue-700/80 font-normal' : 'text-gray-500'}`}>
            {conversation.last_message_preview || 'No messages yet'}
          </p>
          {displayUnreadCount > 0 && (
            <span
              className="min-w-[20px] h-[20px] px-1.5 flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold shadow-sm flex-shrink-0"
              aria-label={`${displayUnreadCount} unread`}
            >
              {displayUnreadCount > 99 ? '99+' : displayUnreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
