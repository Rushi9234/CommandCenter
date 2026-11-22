# CommandCenter AI Assistant Future Work & Deferred Risk Backlog

This document maintains the permanent backlog of consciously deferred improvements, known non-blocking risks, and future security/scalability enhancements identified during the architecture freeze and implementation phases.

---

## 1. Consciously Deferred Enhancements

### Item FW-01: Multi-Modal (Image/Document Attachment) Analysis
- **Reason Deferred**: Initial scope focuses strictly on text-based product help and operational task/log/metrics intelligence.
- **Current Risk**: Low. Users can query text summaries of work and projects.
- **Trigger for Reconsideration**: Product requirement for analyzing uploaded code screenshots or design PDFs.
- **Suggested Future Direction**: Extend `AIAssistantRequestDTO` with `attachmentKeys[]` and process through vision-capable AI providers.

### Item FW-02: Native Vector Database Integration (pgvector extension)
- **Reason Deferred**: Static Help Center RAG operates efficiently over local in-memory embeddings of Markdown chunks (`backend/data/help/*.md`) without adding database infrastructure dependencies.
- **Current Risk**: Low. Product Help KB consists of static docs (< 500 KB total).
- **Trigger for Reconsideration**: Help documentation grows past 10 MB or requires real-time full-text search indexing.
- **Suggested Future Direction**: Enable PostgreSQL `pgvector` extension and create table `product_help_vectors`.

### Item FW-03: Realtime Streaming AI Responses (Server-Sent Events)
- **Reason Deferred**: Single-shot JSON responses simplify frontend state management, tool execution, and disambiguation flows.
- **Current Risk**: Low. Average query latency is < 2.5 seconds.
- **Trigger for Reconsideration**: User feedback requesting character-by-character typewriter streaming UI.
- **Suggested Future Direction**: Add `POST /api/ai/assistant/stream` endpoint emitting SSE events.

---

## 2. Identified Future Hardening

### Item FW-04: Advanced Prompt Injection Anomaly Scoring
- **Reason Deferred**: XML tag fencing (`<untrusted_user_work_log>`) and `maskPII()` provide robust defense-in-depth against prompt injection.
- **Current Risk**: Low. Operational data is filtered by PostgreSQL predicates before AI context assembly.
- **Trigger for Reconsideration**: Sophisticated jailbreak patterns detected in `ai_query_audit_logs`.
- **Suggested Future Direction**: Integrate a lightweight secondary classifier model to score incoming user prompts for adversarial jailbreak syntax.
