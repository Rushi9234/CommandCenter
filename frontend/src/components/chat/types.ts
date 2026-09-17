// Chat V1 -- shapes matching the backend's actual response contract
// exactly (chat.service.ts's ConversationListItem/MessageResponse on the
// backend). Kept in one file so every Chat component imports the same
// shape rather than each redeclaring its own inline type.

export interface ChatConversation {
  conversation_id: string;
  type: 'direct' | 'team';
  team_id: string | null;
  team_name: string | null;
  other_user: { user_id: string; full_name: string; username: string; avatar_key?: string | null; avatar_url?: string | null } | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface ChatMessage {
  message_id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
  // BIGSERIAL, returned as a string end-to-end (see backend
  // chat.repository.ts's own comment) -- never coerced to a JS number,
  // compared as BigInt where ordering matters (mergeMessages below).
  seq: string;
}

export const getConversationTitle = (conversation: ChatConversation): string =>
  conversation.type === 'direct' ? conversation.other_user?.full_name || 'Unknown user' : conversation.team_name || 'Team';

export const getInitials = (name?: string | null): string =>
  (name || '')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

// Merges two message arrays by message_id (POST response + a realtime-
// triggered refetch can both deliver the same message -- this is the
// single dedup point every caller uses), returned sorted ascending by
// seq (oldest first, for top-to-bottom rendering).
export const mergeMessages = (existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const byId = new Map<string, ChatMessage>();
  for (const message of existing) byId.set(message.message_id, message);
  for (const message of incoming) byId.set(message.message_id, message);
  return Array.from(byId.values()).sort((a, b) => (BigInt(a.seq) < BigInt(b.seq) ? -1 : BigInt(a.seq) > BigInt(b.seq) ? 1 : 0));
};
