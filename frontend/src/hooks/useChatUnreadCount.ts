import { useEffect, useState } from 'react';
import * as api from '../services/api';
import { useRealtime, type RealtimeEvent } from './useRealtime';

// Chat V1 Task 6 finding: the backend has no dedicated GET
// /api/chat/unread-count endpoint (verified against the actual
// chat.routes.ts -- only conversations/messages endpoints exist). The
// per-conversation `unread_count` already returned by GET
// /api/chat/conversations is authoritative, so the Sidebar badge sums
// those client-side instead of a second server-side calculation or a
// new endpoint.
export function useChatUnreadCount(): number {
  const [unreadTotal, setUnreadTotal] = useState(0);

  const refresh = async () => {
    try {
      const res = await api.getChatConversations();
      const conversations = res.data.data || [];
      const total = conversations.reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0);
      setUnreadTotal(total);
    } catch {
      // Silent -- a failed background badge refresh isn't worth an error
      // state; the next successful fetch (a realtime event, or actually
      // opening /chat) corrects it. Matches NotificationBell's own
      // refreshUnreadCount contract exactly.
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtime((event: RealtimeEvent) => {
    if (event.type === 'chat.message_created') void refresh();
  });

  return unreadTotal;
}
