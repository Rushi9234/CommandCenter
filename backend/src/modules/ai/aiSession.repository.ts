import { query, queryOne } from '../../db/client';

export interface AISessionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export class AISessionRepository {
  async getSession(userId: string, scopeType: string, scopeId?: string | null) {
    let text = `
      SELECT * FROM ai_conversation_sessions
      WHERE user_id = $1 AND scope_type = $2 AND scope_id IS NOT DISTINCT FROM $3
    `;
    return queryOne<any>(text, [userId, scopeType, scopeId || null]);
  }

  async saveSession(userId: string, scopeType: string, scopeId: string | null, messages: AISessionMessage[]) {
    // Keep max 20 messages per session
    const trimmed = messages.slice(-20);
    const text = `
      INSERT INTO ai_conversation_sessions (user_id, scope_type, scope_id, messages, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, scope_type, scope_id) WHERE scope_id IS NOT NULL DO UPDATE SET
        messages = EXCLUDED.messages,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const textNull = `
      INSERT INTO ai_conversation_sessions (user_id, scope_type, scope_id, messages, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, scope_type) WHERE scope_id IS NULL DO UPDATE SET
        messages = EXCLUDED.messages,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const targetQuery = scopeId ? text : textNull;
    return queryOne<any>(targetQuery, [userId, scopeType, scopeId || null, JSON.stringify(trimmed)]);
  }
}

export const aiSessionRepository = new AISessionRepository();
