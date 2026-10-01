import { queryOne } from '../../db/client';

export class AIAuditRepository {
  async logQuery(auditData: {
    user_id: string;
    intent_category: string;
    scope_type?: string;
    scope_id?: string | null;
    tools_called?: string[];
    token_usage_input?: number;
    token_usage_output?: number;
    execution_time_ms?: number;
    status_code?: number;
  }) {
    const text = `
      INSERT INTO ai_query_audit_logs (
        user_id, intent_category, scope_type, scope_id, tools_called,
        token_usage_input, token_usage_output, execution_time_ms, status_code
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING log_id
    `;
    return queryOne<any>(text, [
      auditData.user_id,
      auditData.intent_category,
      auditData.scope_type || 'global',
      auditData.scope_id || null,
      auditData.tools_called || [],
      auditData.token_usage_input || 0,
      auditData.token_usage_output || 0,
      auditData.execution_time_ms || 0,
      auditData.status_code || 200,
    ]);
  }
}

export const aiAuditRepository = new AIAuditRepository();
