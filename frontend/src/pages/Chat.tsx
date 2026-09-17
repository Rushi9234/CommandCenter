import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useRealtime, type RealtimeEvent } from '../hooks/useRealtime';
import ConversationList from '../components/chat/ConversationList';
import ChatHeader from '../components/chat/ChatHeader';
import MessageList from '../components/chat/MessageList';
import ChatComposer from '../components/chat/ChatComposer';
import { ChatConversation, ChatMessage, mergeMessages } from '../components/chat/types';

// Chat V1 Task 6. Two panes on desktop (lg+), one pane at a time on
// mobile, switching between the conversation list and the active thread
// via the `conversation` query param -- no dynamic route segment, per
// the flat-route convention every other page in this app already uses
// (see notificationDestination.ts's own comment on why).
//
// Task 6 finding, not a defect introduced here: the task brief referenced
// a `GET /api/chat/unread-count` endpoint that does not exist in the
// actual backend (verified against chat.routes.ts). The per-conversation
// `unread_count` already returned by GET /api/chat/conversations is
// authoritative and sufficient -- this page and the Sidebar badge
// (useChatUnreadCount) both derive from that instead. No new backend
// endpoint was added to paper over this.
//
// Second known, deliberately UNSOLVED limitation carried over from Task
// 5: there is no mark-read endpoint. Unread counts shown here are exactly
// what the backend returns; the only "read" behavior this page provides
// is a local, non-persisted visual convenience (the currently open
// conversation displays as 0 unread in the list -- see
// ConversationList/ConversationListItem's own comments), never a fake
// API call and never a claim that the server has recorded anything.
export default function Chat() {
  const { user } = useAuth();
  const currentUserId = user?.user_id || '';
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedConversationId = searchParams.get('conversation');

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState('');
  const conversationsLoadedOnceRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [conversationUnavailable, setConversationUnavailable] = useState(false);
  // Bumped by the messages panel's own Retry button -- selectedConversationId
  // itself doesn't change on a retry, so the load-messages effect needs a
  // separate dependency to know a retry was requested.
  const [messagesRetryToken, setMessagesRetryToken] = useState(0);

  const [teamMemberNames, setTeamMemberNames] = useState<Record<string, Record<string, string>>>({});
  const [announcement, setAnnouncement] = useState('');

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollIntentRef = useRef<'bottom' | 'preserve' | null>(null);
  const preserveScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  // Stale-response race guard -- same version-token pattern already used
  // throughout this app (Teams.tsx/Goals.tsx/NotificationBell.tsx): every
  // messages-affecting fetch bumps this, and only the most recent call's
  // response is applied.
  const messagesRequestVersion = useRef(0);

  const selectedConversation = conversations.find((c) => c.conversation_id === selectedConversationId) || null;

  const loadConversations = async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setConversationsLoading(true);
    setConversationsError('');
    try {
      const res = await api.getChatConversations();
      const rawList: ChatConversation[] = res.data.data || [];
      const updatedList = rawList.map((c) =>
        c.conversation_id === selectedConversationId ? { ...c, unread_count: 0 } : c
      );
      setConversations(updatedList);
      conversationsLoadedOnceRef.current = true;
    } catch (error: any) {
      if (!options.silent || !conversationsLoadedOnceRef.current) {
        setConversationsError(error.response?.data?.error || 'Failed to load conversations');
      }
    } finally {
      if (!options.silent) setConversationsLoading(false);
    }
  };

  useEffect(() => {
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a conversation is selected and valid, mark it as read on the backend
  // and update local state so the unread count clears permanently.
  useEffect(() => {
    if (!selectedConversationId || !selectedConversation) return;

    api
      .markConversationRead(selectedConversationId)
      .then(() => {
        setConversations((prev) =>
          prev.map((c) =>
            c.conversation_id === selectedConversationId ? { ...c, unread_count: 0 } : c
          )
        );
      })
      .catch(() => {
        // Non-fatal mark-read error
      });
  }, [selectedConversationId, !!selectedConversation]);

  const isNearBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 150;
  };

  // Loads the newest page for `conversationId`, replacing any current
  // messages -- used on initial selection and when switching
  // conversations. Never fetches when the conversation isn't (yet, or
  // no longer) in the authoritative list -- see the file-level comment
  // on why that's treated as unavailable rather than a doomed request.
  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      setMessagesError('');
      setConversationUnavailable(false);
      setNextCursor(null);
      return;
    }
    if (conversationsLoading) return;

    if (!selectedConversation) {
      setConversationUnavailable(true);
      setMessages([]);
      return;
    }

    setConversationUnavailable(false);
    const requestVersion = ++messagesRequestVersion.current;
    setMessagesLoading(true);
    setMessagesError('');
    scrollIntentRef.current = 'bottom';

    api
      .getChatMessages(selectedConversationId)
      .then((res) => {
        if (messagesRequestVersion.current !== requestVersion) return;
        setMessages(res.data.data.messages.slice().reverse());
        setNextCursor(res.data.data.next_cursor);
      })
      .catch((error: any) => {
        if (messagesRequestVersion.current !== requestVersion) return;
        if (error.response?.status === 404) {
          setConversationUnavailable(true);
        } else {
          setMessagesError(error.response?.data?.error || 'Failed to load messages');
        }
      })
      .finally(() => {
        if (messagesRequestVersion.current === requestVersion) setMessagesLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId, conversationsLoading, !!selectedConversation, messagesRetryToken]);

  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (scrollIntentRef.current === 'bottom') {
      container.scrollTop = container.scrollHeight;
    } else if (scrollIntentRef.current === 'preserve' && preserveScrollRef.current) {
      const { scrollHeight: oldHeight, scrollTop: oldTop } = preserveScrollRef.current;
      container.scrollTop = oldTop + (container.scrollHeight - oldHeight);
    }
    scrollIntentRef.current = null;
    preserveScrollRef.current = null;
  }, [messages]);

  useEffect(() => {
    if (selectedConversation?.type !== 'team' || !selectedConversation.team_id) return;
    const teamId = selectedConversation.team_id;
    if (teamMemberNames[teamId]) return;
    api
      .getTeamMembers(teamId)
      .then((res) => {
        const map: Record<string, string> = {};
        (res.data.data || []).forEach((member: any) => {
          map[member.user_id] = member.full_name;
        });
        setTeamMemberNames((prev) => ({ ...prev, [teamId]: map }));
      })
      .catch(() => {
        // Non-fatal -- sender names simply won't resolve for this team
        // until a retry succeeds; messages themselves still render.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.team_id]);

  const getSenderName = (senderUserId: string): string | undefined => {
    if (senderUserId === currentUserId) return 'You';
    if (!selectedConversation?.team_id) return undefined;
    return teamMemberNames[selectedConversation.team_id]?.[senderUserId];
  };

  const handleSelectConversation = (conversationId: string) => {
    setSearchParams({ conversation: conversationId });
  };

  const handleBackToList = () => {
    setSearchParams({});
  };

  const handleConversationCreated = async (conversationId: string) => {
    await loadConversations();
    setSearchParams({ conversation: conversationId });
  };

  const handleLoadOlder = async () => {
    if (!selectedConversationId || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await api.getChatMessages(selectedConversationId, nextCursor);
      const container = messagesContainerRef.current;
      if (container) {
        preserveScrollRef.current = { scrollHeight: container.scrollHeight, scrollTop: container.scrollTop };
        scrollIntentRef.current = 'preserve';
      }
      setMessages((prev) => mergeMessages(prev, res.data.data.messages.slice().reverse()));
      setNextCursor(res.data.data.next_cursor);
    } catch {
      // Left as a silent no-op retry-by-reclicking -- the button simply
      // remains available; a persistent inline error here would compete
      // with the composer's own error region for attention.
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSend = async (body: string) => {
    if (!selectedConversationId) return;
    const res = await api.sendChatMessage(selectedConversationId, body);
    const newMessage: ChatMessage = res.data.data.message;
    scrollIntentRef.current = 'bottom';
    setMessages((prev) => mergeMessages(prev, [newMessage]));
    void loadConversations({ silent: true });
  };

  // Realtime: chat.message_created is a signal only (no message body) --
  // both branches always refresh from the REST API, never trust the
  // event payload for content. Sender-side duplicate outgoing bubbles
  // (the sender also receives their own direct-chat event) are
  // structurally impossible here: mergeMessages dedupes by message_id,
  // and the POST response already added this exact message before any
  // matching event could arrive.
  useRealtime((event: RealtimeEvent) => {
    if (event.type !== 'chat.message_created') return;

    if (event.conversationId && event.conversationId === selectedConversationId) {
      void api.markConversationRead(event.conversationId).catch(() => {});
    }

    void loadConversations({ silent: true });

    if (!event.conversationId || event.conversationId !== selectedConversationId) return;

    api
      .getChatMessages(event.conversationId)
      .then((res) => {
        const incoming: ChatMessage[] = res.data.data.messages.slice().reverse();
        const newlyArrived = incoming.filter((m) => !messages.some((existing) => existing.message_id === m.message_id));
        const fromOthers = newlyArrived.filter((m) => m.sender_user_id !== currentUserId);
        if (fromOthers.length > 0) {
          setAnnouncement(fromOthers.length === 1 ? 'New message received' : `${fromOthers.length} new messages received`);
          if (isNearBottom()) scrollIntentRef.current = 'bottom';
        }
        setMessages((prev) => mergeMessages(prev, incoming));
      })
      .catch(() => {
        // Best-effort -- the next successful realtime event or manual
        // reselect will reconcile.
      });
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-white">
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>

      <ConversationList
        conversations={conversations}
        loading={conversationsLoading}
        error={conversationsError}
        onRetry={() => void loadConversations()}
        selectedConversationId={selectedConversationId}
        currentUserId={currentUserId}
        onSelect={handleSelectConversation}
        onConversationCreated={handleConversationCreated}
        className={`w-full lg:w-80 lg:flex-shrink-0 border-r border-gray-200 ${
          selectedConversationId ? 'hidden lg:flex' : 'flex'
        }`}
      />

      <div className={`flex-1 min-w-0 flex-col ${selectedConversationId ? 'flex' : 'hidden lg:flex'}`}>
        {!selectedConversationId && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50/20">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 shadow-xs">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Select a conversation</h3>
            <p className="text-xs text-gray-500 max-w-xs">Choose a direct or team chat from the sidebar to start messaging.</p>
          </div>
        )}

        {selectedConversationId && conversationUnavailable && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 bg-gray-50/20">
            <p className="text-sm font-medium text-gray-700 mb-3">This conversation is unavailable.</p>
            <button type="button" onClick={handleBackToList} className="btn-secondary text-xs px-3.5 py-2">
              Back to conversations
            </button>
          </div>
        )}

        {selectedConversationId && selectedConversation && !conversationUnavailable && (
          <>
            <ChatHeader conversation={selectedConversation} onBack={handleBackToList} />
            <MessageList
              ref={messagesContainerRef}
              conversation={selectedConversation}
              messages={messages}
              currentUserId={currentUserId}
              loading={messagesLoading}
              error={messagesError}
              onRetry={() => {
                setMessagesError('');
                setMessagesRetryToken((prev) => prev + 1);
              }}
              hasOlder={nextCursor !== null}
              loadingOlder={loadingOlder}
              onLoadOlder={() => void handleLoadOlder()}
              getSenderName={getSenderName}
            />
            <ChatComposer onSend={handleSend} disabled={messagesLoading} />
          </>
        )}
      </div>
    </div>
  );
}
