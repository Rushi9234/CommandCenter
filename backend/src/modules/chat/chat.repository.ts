import { query, queryOne, withTransaction } from '../../db/client';

// Chat V1 Task 2 -- conversation management only (get/list/create-
// conversation). Message read/write (chat_messages beyond this file's own
// get-or-create scaffolding) belongs to Task 3.
//
// CRITICAL, carried over unchanged from CHAT_ARCHITECTURE_AUDIT.md section
// C.1: conversation_participants is the authorization source ONLY for
// type='direct' conversations (its two fixed rows, written once at
// creation and never changed in V1). For type='team' conversations it is
// NEVER consulted for authorization -- authorization is always the live
// team_members check every other module already uses
// (teamsRepository.canAccessTeam), via common/middleware/
// requireConversationParticipant.ts. Participant rows for team
// conversations exist only as a lazily-written per-user read-cursor
// cache (see findOrCreateTeamConversation below) -- never treat their
// presence/absence as an access decision.

export interface Conversation {
  conversation_id: string;
  type: 'direct' | 'team';
  team_id: string | null;
  direct_pair_key: string | null;
  created_by: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
}

export interface ChatMessage {
  message_id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
  // BIGSERIAL -- returned as a string by node-pg (no custom OID-20 type
  // parser is registered anywhere in this app), which is also exactly why
  // it's carried as a string end-to-end (DTO, cursor, response) rather
  // than coerced to a JS number anywhere.
  seq: string;
}

export interface ConversationListRow {
  conversation_id: string;
  type: 'direct' | 'team';
  team_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  other_user_id: string | null;
  other_user_full_name: string | null;
  other_user_username: string | null;
  other_user_avatar_key: string | null;
  team_name: string | null;
  unread_count: number;
}

const CONVERSATION_COLUMNS = `
  conversation_id, type, team_id, direct_pair_key, created_by,
  last_message_at, last_message_preview, created_at
`;

export class ChatRepository {
  async getConversationById(conversationId: string): Promise<Conversation | null> {
    return queryOne<Conversation>(`SELECT ${CONVERSATION_COLUMNS} FROM conversations WHERE conversation_id = $1`, [
      conversationId,
    ]);
  }

  // The authorization source for DIRECT conversations only -- see the
  // file-level comment. Never used to authorize a team conversation.
  async isDirectParticipant(conversationId: string, userId: string): Promise<boolean> {
    const result = await queryOne(
      `SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    return result !== null;
  }

  // Collapses "the target user doesn't exist" and "exists but shares no
  // team with the caller" into the same negative result -- a nonexistent
  // user has zero team_members rows, so this query already returns null
  // for both cases. chat.service.ts turns both into the same generic 403,
  // never distinguishing them (no user-existence enumeration oracle).
  async usersShareATeam(userIdA: string, userIdB: string): Promise<boolean> {
    const result = await queryOne(
      `SELECT 1 FROM team_members tm1
       INNER JOIN team_members tm2 ON tm1.team_id = tm2.team_id
       WHERE tm1.user_id = $1 AND tm2.user_id = $2
       LIMIT 1`,
      [userIdA, userIdB]
    );
    return result !== null;
  }

  // Chat V1 Task 4: the authoritative recipient list for a direct
  // conversation's realtime/notification fan-out -- always exactly the 2
  // fixed rows written at creation (see findOrCreateDirectConversation),
  // never a client-supplied list.
  async getDirectParticipantUserIds(conversationId: string): Promise<string[]> {
    const rows = await query<{ user_id: string }>(
      `SELECT user_id FROM conversation_participants WHERE conversation_id = $1`,
      [conversationId]
    );
    return rows.map((row) => row.user_id);
  }

  // Race-safe get-or-create for a direct conversation between two users.
  // direct_pair_key ('<smaller_user_id>:<larger_user_id>', computed by the
  // caller) plus the partial unique index idx_conversations_direct_pair_
  // unique is the ONLY uniqueness guarantee -- not this function's own
  // control flow. Two concurrent calls for the same pair: whichever INSERT
  // reaches Postgres second blocks on the unique index until the first
  // commits, then (per ON CONFLICT DO NOTHING) affects zero rows and falls
  // through to the SELECT, returning the exact row the first call created.
  // This is never a read-then-insert race -- the database's own unique
  // index is what decides who wins.
  async findOrCreateDirectConversation(
    userIdA: string,
    userIdB: string,
    createdBy: string,
    pairKey: string
  ): Promise<Conversation> {
    return withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO conversations (type, created_by, direct_pair_key)
         VALUES ('direct', $1, $2)
         ON CONFLICT (direct_pair_key) WHERE type = 'direct' DO NOTHING
         RETURNING ${CONVERSATION_COLUMNS}`,
        [createdBy, pairKey]
      );

      if (inserted.rows.length > 0) {
        const conversation = inserted.rows[0] as Conversation;
        // Newly created -- the two fixed participant rows are written in
        // the SAME transaction as the conversation row, so a direct
        // conversation can never exist without exactly its two
        // participants, and no third row can ever be added later (no
        // code path in this module inserts a third participant).
        await client.query(
          `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)`,
          [conversation.conversation_id, userIdA, userIdB]
        );
        return conversation;
      }

      const existing = await client.query(
        `SELECT ${CONVERSATION_COLUMNS} FROM conversations WHERE direct_pair_key = $1 AND type = 'direct'`,
        [pairKey]
      );
      return existing.rows[0] as Conversation;
    });
  }

  // Race-safe get-or-create for a team's single canonical conversation.
  // Same ON CONFLICT DO NOTHING + fallback SELECT pattern as the direct
  // variant above, guarded by idx_conversations_team_unique instead.
  async findOrCreateTeamConversation(teamId: string, requestingUserId: string): Promise<Conversation> {
    return withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO conversations (type, team_id, created_by)
         VALUES ('team', $1, $2)
         ON CONFLICT (team_id) WHERE type = 'team' DO NOTHING
         RETURNING ${CONVERSATION_COLUMNS}`,
        [teamId, requestingUserId]
      );

      let conversation: Conversation;
      if (inserted.rows.length > 0) {
        conversation = inserted.rows[0] as Conversation;
      } else {
        const existing = await client.query(
          `SELECT ${CONVERSATION_COLUMNS} FROM conversations WHERE team_id = $1 AND type = 'team'`,
          [teamId]
        );
        conversation = existing.rows[0] as Conversation;
      }

      // Lazily ensure the REQUESTING user has a read-cursor row -- a cache
      // only, never an authorization source for team conversations (see
      // the file-level comment). Deliberately NOT written for every
      // current team member, only for whoever has actually requested this
      // conversation; safe to upsert unconditionally since ON CONFLICT DO
      // NOTHING makes repeat calls (get, not create) a no-op here.
      await client.query(
        `INSERT INTO conversation_participants (conversation_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (conversation_id, user_id) DO NOTHING`,
        [conversation.conversation_id, requestingUserId]
      );

      return conversation;
    });
  }

  // Single query, no N+1: direct conversations (participant-scoped) UNIONed
  // with team conversations (live team_members-scoped -- matching the
  // authorization model exactly, so a team the caller just joined appears
  // here immediately and one they were just removed from disappears
  // immediately, with no separate sync step to forget). last_read_seq is
  // NULL when the caller has never read that conversation (no
  // conversation_participants row yet for a team conversation they've
  // never opened, or a row whose last_read_seq is still NULL) --
  // COALESCE(..., 0) below treats that as "nothing read yet", so every
  // existing message correctly counts as unread rather than being
  // under-counted.
  async listConversationsForUser(userId: string): Promise<ConversationListRow[]> {
    return query<ConversationListRow>(
      `WITH direct_convos AS (
         SELECT
           c.conversation_id, c.type, c.team_id, c.last_message_at, c.last_message_preview, c.created_at,
           other_u.user_id AS other_user_id, other_u.full_name AS other_user_full_name, other_u.username AS other_user_username, other_u.avatar_key AS other_user_avatar_key,
           NULL::varchar AS team_name,
           cp_self.last_read_seq AS last_read_seq,
           NULL::timestamp AS membership_joined_at
         FROM conversations c
         INNER JOIN conversation_participants cp_self
           ON cp_self.conversation_id = c.conversation_id AND cp_self.user_id = $1
         INNER JOIN conversation_participants cp_other
           ON cp_other.conversation_id = c.conversation_id AND cp_other.user_id != $1
         INNER JOIN users other_u ON other_u.user_id = cp_other.user_id
         WHERE c.type = 'direct'
       ),
       team_convos AS (
         SELECT
           c.conversation_id, c.type, c.team_id,
           latest_m.created_at AS last_message_at,
           LEFT(latest_m.body, 200) AS last_message_preview,
           c.created_at,
           NULL::uuid AS other_user_id, NULL::varchar AS other_user_full_name, NULL::varchar AS other_user_username, NULL::text AS other_user_avatar_key,
           t.team_name AS team_name,
           cp.last_read_seq AS last_read_seq,
           tm.joined_at AS membership_joined_at
         FROM conversations c
         INNER JOIN team_members tm ON tm.team_id = c.team_id AND tm.user_id = $1
         INNER JOIN teams t ON t.team_id = c.team_id
         LEFT JOIN conversation_participants cp
           ON cp.conversation_id = c.conversation_id AND cp.user_id = $1
         LEFT JOIN LATERAL (
           SELECT created_at, body FROM chat_messages m
           WHERE m.conversation_id = c.conversation_id
             AND m.created_at >= tm.joined_at
           ORDER BY m.seq DESC
           LIMIT 1
         ) latest_m ON true
         WHERE c.type = 'team'
       ),
       combined AS (
         SELECT * FROM direct_convos
         UNION ALL
         SELECT * FROM team_convos
       )
       SELECT
         combined.conversation_id, combined.type, combined.team_id,
         combined.last_message_at, combined.last_message_preview, combined.created_at,
         combined.other_user_id, combined.other_user_full_name, combined.other_user_username, combined.other_user_avatar_key,
         combined.team_name,
         (
           SELECT COUNT(*)::int FROM chat_messages m
           WHERE m.conversation_id = combined.conversation_id
             AND (combined.type != 'team' OR m.created_at >= combined.membership_joined_at)
             AND m.seq > COALESCE(combined.last_read_seq, 0)
             AND m.sender_user_id != $1
         ) AS unread_count
       FROM combined
       ORDER BY combined.last_message_at DESC NULLS LAST, combined.created_at DESC
       LIMIT 100`,
      [userId]
    );
  }

  // Chat V1 Task 3 & Task 4 -- cursor pagination on seq, strictly bounded by the caller's active team membership epoch.
  async listMessages(conversationId: string, userId: string, cursor: string | null, limitPlusOne: number): Promise<ChatMessage[]> {
    const params: any[] = [conversationId, userId];
    let cursorClause = '';
    if (cursor !== null) {
      params.push(cursor);
      cursorClause = `AND m.seq < $${params.length}`;
    }
    params.push(limitPlusOne);

    return query<ChatMessage>(
      `SELECT m.message_id, m.conversation_id, m.sender_user_id, m.body, m.created_at, m.seq
       FROM chat_messages m
       INNER JOIN conversations c ON c.conversation_id = m.conversation_id
       LEFT JOIN team_members tm ON c.type = 'team' AND tm.team_id = c.team_id AND tm.user_id = $2
       WHERE m.conversation_id = $1
         AND (c.type != 'team' OR m.created_at >= tm.joined_at)
         ${cursorClause}
       ORDER BY m.seq DESC
       LIMIT $${params.length}`,
      params
    );
  }

  // Inserts the message and updates conversations.last_message_at/
  // last_message_preview in one transaction -- both succeed or both roll
  // back. The metadata UPDATE deliberately does NOT use this
  // transaction's own just-inserted row's values as literal parameters;
  // instead it re-derives them from a fresh "current highest-seq message"
  // subquery.
  async sendMessage(conversationId: string, senderUserId: string, body: string): Promise<ChatMessage> {
    return withTransaction(async (client) => {
      // Own statement, before the INSERT, on purpose -- see the
      // method-level comment above (both hazards it documents).
      await client.query('SELECT conversation_id FROM conversations WHERE conversation_id = $1 FOR UPDATE', [
        conversationId,
      ]);

      const inserted = await client.query(
        `INSERT INTO chat_messages (conversation_id, sender_user_id, body)
         VALUES ($1, $2, $3)
         RETURNING message_id, conversation_id, sender_user_id, body, created_at, seq`,
        [conversationId, senderUserId, body]
      );
      const message = inserted.rows[0] as ChatMessage;

      // LEFT(latest.body, 200) matches conversations.last_message_preview's
      // own VARCHAR(200) column limit exactly -- plain-text truncation,
      // no markup/rendering behavior introduced.
      await client.query(
        `UPDATE conversations c
         SET last_message_at = latest.created_at,
             last_message_preview = LEFT(latest.body, 200)
         FROM (
           SELECT created_at, body FROM chat_messages
           WHERE conversation_id = $1
           ORDER BY seq DESC
           LIMIT 1
         ) latest
         WHERE c.conversation_id = $1`,
        [conversationId]
      );

      return message;
    });
  }

  // Advances the user's read cursor in conversation_participants to the
  // latest message's seq in this conversation. Idempotent; never moves
  // the cursor backwards. Strictly respects historical membership boundary.
  async markConversationRead(conversationId: string, userId: string): Promise<void> {
    const maxSeqRow = await queryOne<{ max_seq: string | null }>(
      `SELECT MAX(m.seq)::text AS max_seq
       FROM chat_messages m
       INNER JOIN conversations c ON c.conversation_id = m.conversation_id
       LEFT JOIN team_members tm ON c.type = 'team' AND tm.team_id = c.team_id AND tm.user_id = $2
       WHERE m.conversation_id = $1
         AND (c.type != 'team' OR m.created_at >= tm.joined_at)`,
      [conversationId, userId]
    );
    const targetSeq = maxSeqRow?.max_seq ? BigInt(maxSeqRow.max_seq) : 0n;

    await query(
      `INSERT INTO conversation_participants (conversation_id, user_id, last_read_seq, last_read_at)
       VALUES ($1, $2, $3::bigint, CURRENT_TIMESTAMP)
       ON CONFLICT (conversation_id, user_id) DO UPDATE
       SET last_read_seq = GREATEST(conversation_participants.last_read_seq, EXCLUDED.last_read_seq),
           last_read_at = CASE
             WHEN EXCLUDED.last_read_seq >= COALESCE(conversation_participants.last_read_seq, 0) THEN CURRENT_TIMESTAMP
             ELSE conversation_participants.last_read_at
           END`,
      [conversationId, userId, targetSeq.toString()]
    );
  }
}

export const chatRepository = new ChatRepository();
