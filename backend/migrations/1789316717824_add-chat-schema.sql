-- Up Migration
-- Chat V1 schema (CHAT_ARCHITECTURE_AUDIT.md sections C/K.1). Database-only
-- slice -- no routes/controllers/services/repositories/DTOs/frontend exist
-- yet; this migration exists so the schema can be reviewed and applied on
-- its own before any application code is written against it.
--
-- Three tables: conversations (a direct 1:1 or a team's single group
-- conversation), conversation_participants (fixed 2-row membership for
-- direct conversations, plus a lazily-written per-user read cursor for
-- both types), and chat_messages (named distinctly from the pre-existing
-- blocker-comment `messages` table -- that table is untouched by this
-- migration).
--
-- CRITICAL authorization design, carried over unchanged from the audit:
-- for type='team' conversations, conversation_participants is NEVER the
-- authorization source. Authorization is always a live query against the
-- existing team_members table (conversations.team_id -> team_members),
-- the same way requireTeamRole/getMemberRole already work everywhere
-- else in this codebase. team_members has no soft delete (removal is a
-- hard DELETE), so this gives instant, automatic access revocation on
-- removal with no separate sync step and no materialized participant
-- list to go stale. conversation_participants rows for team
-- conversations are only ever a per-user last-read cursor cache, written
-- lazily on first read/visit -- not written here, and not part of this
-- migration.
--
-- For type='direct' conversations, the two conversation_participants
-- rows ARE authoritative -- fixed for the conversation's lifetime in V1
-- (no leave/remove concept yet).
CREATE TABLE conversations (
    conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('direct', 'team')),
    team_id UUID REFERENCES teams(team_id) ON DELETE CASCADE,
    direct_pair_key VARCHAR(73),
    created_by UUID NOT NULL REFERENCES users(user_id),
    last_message_at TIMESTAMP,
    last_message_preview VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- At most one team conversation per team, and at most one direct
-- conversation per unordered user pair (direct_pair_key is populated by
-- the application as '<smaller_user_id>:<larger_user_id>' so the pair is
-- order-independent). Both are partial indexes -- the column is NULL for
-- the other conversation `type`, so NULLs never collide.
CREATE UNIQUE INDEX idx_conversations_team_unique ON conversations(team_id) WHERE type = 'team';
CREATE UNIQUE INDEX idx_conversations_direct_pair_unique ON conversations(direct_pair_key) WHERE type = 'direct';

CREATE TABLE conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    last_read_seq BIGINT,
    last_read_at TIMESTAMP,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id)
);

-- "List my conversations" always starts from user_id.
CREATE INDEX idx_conversation_participants_user ON conversation_participants(user_id);

-- Named chat_messages, not messages -- the existing `messages` table
-- (blocker comment threads, blocker_id-scoped) is unrelated and is not
-- modified by this migration. seq is a global monotonic BIGSERIAL used
-- purely as an opaque cursor value: gen_random_uuid() message_id is not
-- sortable, so pagination and unread-count range queries key off seq,
-- not message_id or created_at (multiple messages can share the same
-- created_at millisecond).
CREATE TABLE chat_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seq BIGSERIAL NOT NULL,
    conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- The one index this table needs: "messages in conversation X, newest
-- first" covers both cursor pagination (WHERE conversation_id = $1 AND
-- seq < $cursor) and unread counting (WHERE conversation_id = $1 AND
-- seq > $last_read_seq).
CREATE INDEX idx_chat_messages_conversation_seq ON chat_messages(conversation_id, seq DESC);

-- Down Migration

DROP TABLE chat_messages;
DROP TABLE conversation_participants;
DROP TABLE conversations;
