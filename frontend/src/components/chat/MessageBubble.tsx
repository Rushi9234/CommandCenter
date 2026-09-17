import { ChatMessage } from './types';
import { formatChatTime } from '../../utils/dateUtils';

export default function MessageBubble({
  message,
  isOwn,
  showSenderName,
  senderName,
  showTimestamp,
}: {
  message: ChatMessage;
  isOwn: boolean;
  showSenderName: boolean;
  senderName?: string;
  showTimestamp: boolean;
}) {
  const timeFormatted = formatChatTime(message.created_at);

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} my-0.5 group`}>
      <div className={`max-w-[78%] sm:max-w-[70%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        {showSenderName && !isOwn && senderName && (
          <span className="text-[11px] font-medium text-gray-500 mb-1 px-1">{senderName}</span>
        )}
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm transition-shadow ${
            isOwn
              ? 'bg-blue-600 text-white rounded-br-xs font-normal'
              : 'bg-gray-100/90 text-gray-900 border border-gray-200/60 rounded-bl-xs'
          }`}
        >
          {message.body}
        </div>
        {showTimestamp && timeFormatted && (
          <span className="text-[10px] text-gray-400 mt-1 px-1 font-medium">{timeFormatted}</span>
        )}
      </div>
    </div>
  );
}
