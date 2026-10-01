import ConversationAvatar from './ConversationAvatar';
import { ChatConversation, getConversationTitle } from './types';

export default function ChatHeader({
  conversation,
  onBack,
  onToggleDetails,
}: {
  conversation: ChatConversation;
  onBack: () => void;
  onToggleDetails?: () => void;
}) {
  const title = getConversationTitle(conversation);
  const isTeam = conversation.type === 'team';

  return (
    <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200/80 bg-white/95 backdrop-blur-xs shadow-2xs z-10">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="lg:hidden p-1.5 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0 cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <ConversationAvatar conversation={conversation} size="sm" />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-slate-900 truncate">{title}</h2>
            {isTeam ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                Team Chat
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/60">
                Direct Message
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {onToggleDetails && (
          <button
            type="button"
            onClick={onToggleDetails}
            aria-label="View conversation details"
            title="View Details"
            className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/60 transition-colors cursor-pointer"
          >
            <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
