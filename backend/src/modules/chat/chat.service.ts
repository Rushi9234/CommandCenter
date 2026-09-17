import { BadRequestError, ForbiddenError } from '../../common/errors';
import { chatRepository, ChatMessage, Conversation, ConversationListRow } from './chat.repository';
import { createRealtimeEvent, realtimeProvider } from '../../realtime/inMemoryRealtimeProvider';
import { notificationsService } from '../notifications/notifications.service';
import { usersRepository } from '../users/users.repository';
import { getLogger } from '../../common/logging/loggerFactory';
import { avatarStorageService } from '../avatars/avatars.storage';

// Chat V1 Task 4 -- team membership set used for team-chat notifications:
// every current role, matching this app's 5-tier team_members.role CHECK
// constraint exactly. Unlike notifyTeamMembersByRole's other call sites
// (which narrow to leadership roles for approval-style events), a new
// chat message is relevant to every current member regardless of role.
const ALL_TEAM_ROLES = ['owner', 'admin', 'manager', 'member', 'viewer'];

// Task 3 pagination defaults -- 50 is a reasonable default page for a
// message thread UI (enough to fill a typical viewport without an
// immediate second request), 100 is the hard cap requested by the task
// (never bypassable: an over-100 request is clamped, not honored).
const DEFAULT_MESSAGE_PAGE_SIZE = 50;
const MAX_MESSAGE_PAGE_SIZE = 100;

// Chat V1 Task 2 -- conversation management only. Message send/list/read
// belong to Task 3.

export interface ConversationListItem {
  conversation_id: string;
  type: 'direct' | 'team';
  team_id: string | null;
  team_name: string | null;
  other_user: {
    user_id: string;
    full_name: string;
    username: string;
    avatar_key?: string | null;
    avatar_url?: string | null;
  } | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
}

// '<smaller_user_id>:<larger_user_id>' -- order-independent so the two
// possible call orders for the same pair always produce the same key,
// which is what makes idx_conversations_direct_pair_unique work as a
// dedup guarantee at all.
const buildDirectPairKey = (userIdA: string, userIdB: string): string => {
  return [userIdA, userIdB].sort().join(':');
};

export interface MessageResponse {
  message_id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
  seq: string;
}

export interface MessagePage {
  messages: MessageResponse[];
  next_cursor: string | null;
}

const toMessageResponse = (row: ChatMessage): MessageResponse => ({
  message_id: row.message_id,
  conversation_id: row.conversation_id,
  sender_user_id: row.sender_user_id,
  body: row.body,
  created_at: row.created_at,
  seq: row.seq,
});

const toListItem = (row: ConversationListRow): ConversationListItem => ({
  conversation_id: row.conversation_id,
  type: row.type,
  team_id: row.team_id,
  team_name: row.team_name,
  other_user:
    row.type === 'direct'
      ? {
          user_id: row.other_user_id!,
          full_name: row.other_user_full_name!,
          username: row.other_user_username!,
          avatar_key: row.other_user_avatar_key || null,
          avatar_url: avatarStorageService.getAvatarUrl(row.other_user_avatar_key),
        }
      : null,
  last_message_preview: row.last_message_preview,
  last_message_at: row.last_message_at,
  unread_count: row.unread_count,
});

export class ChatService {
  async listConversations(userId: string): Promise<ConversationListItem[]> {
    const rows = await chatRepository.listConversationsForUser(userId);
    return rows.map(toListItem);
  }

  // other_user_id is client-supplied; everything else that decides
  // authorization or identity (the pair key, created_by, both participant
  // rows) is derived server-side from the authenticated caller and this
  // validated ID -- never taken from any other request field.
  async getOrCreateDirectConversation(callerId: string, otherUserId: string): Promise<Conversation> {
    if (otherUserId === callerId) {
      throw new BadRequestError('Cannot start a direct conversation with yourself');
    }

    // Restricting DMs to users who share a current team (per
    // CHAT_ARCHITECTURE_AUDIT.md section B) also collapses "otherUserId
    // doesn't exist" and "exists but shares no team" into the same check
    // -- see chatRepository.usersShareATeam's own comment. A user with no
    // shared team gets the same generic error whether or not the ID even
    // resolves to a real account.
    const shareATeam = await chatRepository.usersShareATeam(callerId, otherUserId);
    if (!shareATeam) {
      throw new ForbiddenError('You must share a team with this user to start a direct conversation');
    }

    const pairKey = buildDirectPairKey(callerId, otherUserId);
    return chatRepository.findOrCreateDirectConversation(callerId, otherUserId, callerId, pairKey);
  }

  // Team membership is already verified by the route's
  // requireTeamMembership(teamIdFromParams) middleware before this runs --
  // this method only performs the get-or-create, never re-derives
  // authorization (that would be a second, divergent source of truth).
  async getOrCreateTeamConversation(teamId: string, requestingUserId: string): Promise<Conversation> {
    return chatRepository.findOrCreateTeamConversation(teamId, requestingUserId);
  }

  // conversationId's own authorization (participant/live team_members
  // check) has already run in requireConversationParticipant before this
  // is ever called -- this method only handles pagination, never
  // re-derives access.
  async listMessages(conversationId: string, userId: string, rawCursor?: string, rawLimit?: string): Promise<MessagePage> {
    let pageSize = DEFAULT_MESSAGE_PAGE_SIZE;
    if (rawLimit !== undefined) {
      const parsedLimit = parseInt(rawLimit, 10);
      if (parsedLimit < 1) {
        throw new BadRequestError('limit must be at least 1');
      }
      pageSize = Math.min(parsedLimit, MAX_MESSAGE_PAGE_SIZE);
    }

    const cursor = rawCursor !== undefined ? rawCursor : null;
    const rows = await chatRepository.listMessages(conversationId, userId, cursor, pageSize + 1);

    const hasMore = rows.length > pageSize;
    const page = hasMore ? rows.slice(0, pageSize) : rows;

    return {
      messages: page.map(toMessageResponse),
      next_cursor: hasMore ? page[page.length - 1].seq : null,
    };
  }

  // sender_user_id is always the authenticated caller -- never accepted
  // from any request field. `conversation` is the same row
  // requireConversationParticipant already fetched and authorized (passed
  // through from req.conversation by the controller) -- this method never
  // re-fetches or re-derives it, and never re-checks authorization.
  async sendMessage(conversation: Conversation, senderUserId: string, body: string): Promise<MessageResponse> {
    const message = await chatRepository.sendMessage(conversation.conversation_id, senderUserId, body);
    const response = toMessageResponse(message);

    // Fetched once and reused by both side effects below (rather than
    // each independently re-querying it) -- it's the same authoritative
    // pair for both a direct conversation's realtime fan-out and its
    // notification recipient, so there's nothing to gain from asking
    // twice. Left `null` for team conversations, where neither side
    // effect below needs a participant list at all.
    const directParticipantUserIds =
      conversation.type === 'direct' ? await chatRepository.getDirectParticipantUserIds(conversation.conversation_id) : null;

    // Everything below runs strictly AFTER the line above resolves --
    // chatRepository.sendMessage's own withTransaction has already
    // COMMITted by the time an `await` on it returns. A client must never
    // receive a realtime signal, or a notification, for a message that
    // could still roll back; this ordering is what guarantees that.
    // Each side effect is independently wrapped so a realtime failure
    // can't skip notifications (or vice versa), and so that NEITHER can
    // ever turn this already-successful send into a 500 for the caller,
    // or affect the message, which is already durably persisted at this
    // point regardless of what happens next.
    await this.publishChatMessageCreated(conversation, directParticipantUserIds);
    await this.notifyAboutChatMessage(conversation, senderUserId, directParticipantUserIds);

    return response;
  }

  private async publishChatMessageCreated(
    conversation: Conversation,
    directParticipantUserIds: string[] | null
  ): Promise<void> {
    try {
      if (conversation.type === 'team') {
        // Rely entirely on InMemoryRealtimeProvider's existing team-scoped
        // delivery (subscription.teamIds.has(event.teamId)) -- one publish
        // call reaches every currently-connected subscriber for this team,
        // with no manual enumeration of team members here.
        realtimeProvider.publish(
          createRealtimeEvent('chat.message_created', {
            teamId: conversation.team_id!,
            conversationId: conversation.conversation_id,
          })
        );
      } else {
        // One event per participant, INCLUDING the sender -- a sender
        // with multiple open tabs/sessions must stay in sync too.
        // Recipients come only from the authoritative
        // conversation_participants rows, never from any request input.
        for (const participantUserId of directParticipantUserIds!) {
          realtimeProvider.publish(
            createRealtimeEvent('chat.message_created', {
              recipientUserId: participantUserId,
              conversationId: conversation.conversation_id,
            })
          );
        }
      }
    } catch (error) {
      // The message is already committed to Postgres by the time this can
      // ever run -- never rolled back, never rethrown here. A later
      // frontend refetch/reconnect recovers it; this is the same
      // best-effort realtime contract notifyUser's own publish already
      // has (notifications.service.ts).
      getLogger().error('Chat realtime publish failed -- message remains persisted', {
        event: 'chat.realtime_publish_failed',
        conversationId: conversation.conversation_id,
      });
    }
  }

  async markConversationRead(conversationId: string, userId: string): Promise<void> {
    await chatRepository.markConversationRead(conversationId, userId);
  }

  private async notifyAboutChatMessage(
    conversation: Conversation,
    senderUserId: string,
    directParticipantUserIds: string[] | null
  ): Promise<void> {
    try {
      const sender = await usersRepository.getUserById(senderUserId);
      const senderName = sender?.full_name || 'a teammate';

      if (conversation.type === 'direct') {
        // The OTHER authoritative participant only -- the sender is never
        // notified about their own message.
        const recipientUserId = directParticipantUserIds!.find((id) => id !== senderUserId);
        if (recipientUserId) {
          await notificationsService.notifyUser({
            recipientUserId,
            category: 'chat.message_created',
            preferenceGroup: 'chat_message',
            title: 'New message',
            message: `You have a new message from ${senderName}`,
            conversationId: conversation.conversation_id,
          });
        }
      } else {
        // notifyTeamMembersByRole re-derives the CURRENT member list from
        // team_members itself (teamsRepository.getTeamMembers) at call
        // time -- a member removed between the send and this call is
        // already excluded, with no separate sync step, the same live-
        // membership guarantee every other team-scoped operation in this
        // app already has. excludeUserId (senderUserId) keeps the sender
        // from notifying themselves.
        await notificationsService.notifyTeamMembersByRole(
          conversation.team_id!,
          ALL_TEAM_ROLES,
          {
            category: 'chat.message_created',
            preferenceGroup: 'chat_message',
            title: 'New message',
            message: `You have a new message from ${senderName} in your team chat`,
            conversationId: conversation.conversation_id,
          },
          senderUserId
        );
      }
    } catch (error) {
      // Same best-effort contract as publishChatMessageCreated above --
      // the message remains persisted regardless of a notification
      // failure. notifyUser/notifyTeamMembersByRole already never throw
      // internally; this guards the sender-lookup and recipient-derivation
      // steps around them.
      getLogger().error('Chat notification failed -- message remains persisted', {
        event: 'chat.notification_failed',
        conversationId: conversation.conversation_id,
      });
    }
  }
}

export const chatService = new ChatService();
