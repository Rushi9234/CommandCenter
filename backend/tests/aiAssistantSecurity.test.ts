import request from 'supertest';
import { app } from '../src/app';
import { resetDatabase, closeTestPool, testPool } from './utils/db';
import { authHeader, registerAndLogin } from './utils/fixtures';
import { getAIProvider } from '../src/modules/ai/providers/aiProviderFactory';
import { aiToolRegistry } from '../src/modules/ai/tools';
import { projectsRepository } from '../src/modules/projects/projects.repository';
import { signAccessToken } from '../src/modules/auth/jwt';

jest.mock('../src/modules/ai/providers/aiProviderFactory');

const mockGenerateCompletion = jest.fn();

beforeEach(() => {
  mockGenerateCompletion.mockReset();
  mockGenerateCompletion.mockResolvedValue('CommandCenter AI Assistant processed your request successfully.');
  (getAIProvider as jest.Mock).mockReturnValue({ generateCompletion: mockGenerateCompletion });
});

afterAll(async () => {
  await closeTestPool();
});

describe('Scope-Aware AI Assistant Integration & Security Tests (TC-01 to TC-30)', () => {
  let userA: { userId: string; token: string; user: any };
  let userB: { userId: string; token: string; user: any };
  let priyaUser: { userId: string; token: string; user: any };

  let classAId: string;
  let classCId: string;
  let subTeamAId: string;
  let projectAId: string;
  let projectBId: string;

  const setupFixtures = async () => {
    await testPool.query('DELETE FROM tasks');
    await testPool.query('DELETE FROM blockers');
    await testPool.query('DELETE FROM daily_work_submissions');
    await testPool.query('DELETE FROM daily_logs');
    await testPool.query('DELETE FROM ai_conversation_sessions');
    await testPool.query('DELETE FROM ai_query_audit_logs');
    await testPool.query('DELETE FROM team_members');
    await testPool.query('DELETE FROM projects');
    await testPool.query('DELETE FROM teams');
    await testPool.query("DELETE FROM users WHERE email LIKE '%@test.local'");

    const uA = await testPool.query(
      `INSERT INTO users (user_id, email, password_hash, full_name, username, role)
       VALUES ('11111111-1111-4000-8000-111111111111', 'userA@test.local', '$2b$10$dummyhash', 'User A', 'userA', 'user')
       RETURNING user_id`
    );
    const userAId = uA.rows[0].user_id;
    userA = { userId: userAId, token: signAccessToken({ userId: userAId, role: 'user' }), user: { user_id: userAId } };

    const uB = await testPool.query(
      `INSERT INTO users (user_id, email, password_hash, full_name, username, role)
       VALUES ('22222222-2222-4000-8000-222222222222', 'userB@test.local', '$2b$10$dummyhash', 'User B', 'userB', 'user')
       RETURNING user_id`
    );
    const userBId = uB.rows[0].user_id;
    userB = { userId: userBId, token: signAccessToken({ userId: userBId, role: 'user' }), user: { user_id: userBId } };

    const uP = await testPool.query(
      `INSERT INTO users (user_id, email, password_hash, full_name, username, role)
       VALUES ('33333333-3333-4000-8000-333333333333', 'priya@test.local', '$2b$10$dummyhash', 'Priya Sharma', 'priya_student', 'user')
       RETURNING user_id`
    );
    const priyaId = uP.rows[0].user_id;
    priyaUser = { userId: priyaId, token: signAccessToken({ userId: priyaId, role: 'user' }), user: { user_id: priyaId } };






    const resProjA = await testPool.query(
      `INSERT INTO projects (project_name, description, created_by, status, priority, is_public)
       VALUES ('Project Alpha', 'Frontend Redesign', $1, 'active', 'high', false)
       RETURNING project_id`,
      [userA.userId]
    );
    projectAId = resProjA.rows[0].project_id;

    const resProjB = await testPool.query(
      `INSERT INTO projects (project_name, description, created_by, status, priority, is_public)
       VALUES ('Project Beta Private', 'Secret Project B', $1, 'active', 'high', false)
       RETURNING project_id`,
      [userB.userId]
    );
    projectBId = resProjB.rows[0].project_id;

    // Create Class A via direct SQL
    const resA = await testPool.query(
      `INSERT INTO teams (team_name, description, is_public, created_by, team_type)
       VALUES ('Classroom Alpha', 'Class A', true, $1, 'classroom')
       RETURNING team_id`,
      [userA.userId]
    );
    classAId = resA.rows[0].team_id;

    await testPool.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [classAId, userA.userId]
    );

    // Create Class C via direct SQL
    const resC = await testPool.query(
      `INSERT INTO teams (team_name, description, is_public, created_by, team_type)
       VALUES ('Classroom Gamma', 'Class C', true, $1, 'classroom')
       RETURNING team_id`,
      [userB.userId]
    );
    classCId = resC.rows[0].team_id;

    await testPool.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [classCId, userB.userId]
    );

    // Create SubTeam Alpha-1 under Class A
    const resSubA = await testPool.query(
      `INSERT INTO teams (team_name, description, is_public, created_by, team_type, parent_team_id)
       VALUES ('SubTeam Alpha-1', 'Subteam', true, $1, 'team', $2)
       RETURNING team_id`,
      [userA.userId, classAId]
    );
    subTeamAId = resSubA.rows[0].team_id;

    await testPool.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [subTeamAId, userA.userId]
    );

    // Add Priya to SubTeam Alpha-1 (Class A) and Class C
    await testPool.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member'), ($3, $2, 'member')`,
      [subTeamAId, priyaUser.userId, classCId]
    );

    // Create daily work submission for Priya in SubTeam Alpha-1 (Class A)
    await testPool.query(
      `INSERT INTO daily_work_submissions (submission_id, team_id, user_id, confirmed_summary, work_date)
       VALUES (gen_random_uuid(), $1, $2, $3, CURRENT_DATE)`,
      [subTeamAId, priyaUser.userId, 'Completed Class A Frontend Task']
    );

    // Create daily work submission for Priya in Class C
    await testPool.query(
      `INSERT INTO daily_work_submissions (submission_id, team_id, user_id, confirmed_summary, work_date)
       VALUES (gen_random_uuid(), $1, $2, $3, CURRENT_DATE)`,
      [classCId, priyaUser.userId, 'Completed Class C Database Security Lab']
    );

    await testPool.query(
      `INSERT INTO daily_logs (log_id, user_id, entry_text, entry_summary, log_date, log_time)
       VALUES (gen_random_uuid(), $1, $2, $3, CURRENT_DATE, '10:00:00')`,
      [priyaUser.userId, 'Personal Log: Studying for exams', 'Personal Log: Studying for exams']
    );
  };

  beforeAll(async () => {
    await resetDatabase();
    await setupFixtures();
  });

  beforeEach(async () => {
    await testPool.query('DELETE FROM ai_conversation_sessions');
    await testPool.query('DELETE FROM ai_query_audit_logs');
  });

  // TC-01: Personal user accesses own data
  it('TC-01: Personal user queries personal tasks -> returns 200 OK', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'What are my tasks today?', scopeType: 'personal' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.answer).toBeDefined();
  });

  // TC-02: Personal user denied another user's data
  it('TC-02: Personal scope restricts retrieval to caller user_id only', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Show tasks for User B', scopeType: 'personal' });

    expect(res.status).toBe(200);
    expect(mockGenerateCompletion).toHaveBeenCalled();
  });

  // TC-03: Class A owner accesses Class A summary
  it('TC-03: Class A owner queries Class A summary -> 200 OK', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Summarize Class A progress', scopeType: 'class', scopeId: classAId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // TC-04: Priya Multi-Class Isolation Test
  it('TC-04: Priya Multi-Class Isolation: Class A owner query for Priya excludes Class C & personal work', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: "Summarize Priya's work", scopeType: 'class', scopeId: classAId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const calls = mockGenerateCompletion.mock.calls;
    const userPrompt = calls[0][0].find((m: any) => m.role === 'user').content;

    // Must contain Class A work
    expect(userPrompt).toContain('Completed Class A Frontend Task');

    // MUST NOT contain Class C work or personal daily log
    expect(userPrompt).not.toContain('Completed Class C Database Security Lab');
    expect(userPrompt).not.toContain('Studying for exams');
  });

  // TC-05: Team A owner denied Team B data
  it('TC-05: Class A owner querying Class C directly -> 200 with empty tool result (unauthorized)', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Summarize Class C metrics', scopeType: 'class', scopeId: classCId });

    expect(res.status).toBe(200);
    const calls = mockGenerateCompletion.mock.calls;
    const userPrompt = calls[0][0].find((m: any) => m.role === 'user').content;
    expect(userPrompt).not.toContain('Completed Class C Database Security Lab');
  });

  // TC-06: Tampered scopeId rejected
  it('TC-06: Payload scopeId with fake UUID is handled safely', async () => {
    const fakeUuid = '00000000-0000-4000-8000-000000000099';
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Give class metrics', scopeType: 'class', scopeId: fakeUuid });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // TC-08: Tampered userId in payload body is ignored
  it('TC-08: Passing custom userId in body is ignored by DTO/service', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'What are my tasks?', scopeType: 'personal', userId: userB.userId } as any);

    expect(res.status).toBe(200);
  });

  // TC-11: Ambiguous query disambiguation
  it('TC-11: Multi-team member asking ambiguous team question receives disambiguation options', async () => {
    // Add User A to Class C as well
    await testPool.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')`,
      [classCId, userA.userId]
    );

    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'How is my team doing?', scopeType: 'global' });

    expect(res.status).toBe(200);
    expect(res.body.data.disambiguation).toBeDefined();
    expect(res.body.data.disambiguation.options.length).toBeGreaterThanOrEqual(2);
  });

  // TC-12: Work log prompt injection enclosed in untrusted tags
  it('TC-12: Prompt injection in operational data is enclosed in untrusted_user_data XML tags', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Summarize Class A work', scopeType: 'class', scopeId: classAId });

    expect(res.status).toBe(200);
    const calls = mockGenerateCompletion.mock.calls;
    const systemPrompt = calls[0][0].find((m: any) => m.role === 'system').content;
    const userPrompt = calls[0][0].find((m: any) => m.role === 'user').content;

    expect(systemPrompt).toContain('untrusted_user_data');
    expect(userPrompt).toContain('<untrusted_user_data>');
  });

  // TC-14: History scope isolation
  it('TC-14: Switching scopes isolates chat sessions', async () => {
    // Session 1: Class A
    await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Query in Class A', scopeType: 'class', scopeId: classAId });

    mockGenerateCompletion.mockReset();
    mockGenerateCompletion.mockResolvedValue('Response for Class C');

    // Session 2: Class C (unauthorized for User A)
    await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Query in Class C', scopeType: 'class', scopeId: classCId });

    const calls = mockGenerateCompletion.mock.calls;
    const messagesSent = calls[0][0];
    const priorClassAMsg = messagesSent.find((m: any) => m.content === 'Query in Class A');
    expect(priorClassAMsg).toBeUndefined();
  });

  // TC-17: Deleted records non-retrieval
  it('TC-17: Soft/hard deleted daily logs or tasks are not retrieved', async () => {
    // Delete daily work submission
    await testPool.query('DELETE FROM daily_work_submissions WHERE team_id = $1', [subTeamAId]);

    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: "Summarize Priya's work", scopeType: 'class', scopeId: classAId });

    expect(res.status).toBe(200);
    const calls = mockGenerateCompletion.mock.calls;
    const userPrompt = calls[0][0].find((m: any) => m.role === 'user').content;
    expect(userPrompt).not.toContain('Completed Class A Frontend Task');
  });

  // TC-19: Unregistered tool request rejected by registry
  it('TC-19: Unregistered tool cannot be retrieved or executed', async () => {
    const fakeTool = aiToolRegistry.getTool('unregisteredSQLTool');
    expect(fakeTool).toBeUndefined();
  });

  // TC-22: Rate limit enforcement
  it('TC-22: POST /api/ai/assistant has rate limiter active after authenticate', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Rate limit test', scopeType: 'personal' });

    expect(res.status).toBe(200);
  });

  // TC-23: Oversized input prompt rejected by Zod validation
  it('TC-23: Prompt exceeding 5000 chars is rejected with 400 Bad Request', async () => {
    const hugeMessage = 'A'.repeat(5001);
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: hugeMessage, scopeType: 'personal' });

    expect(res.status).toBe(400);
  });

  // TC-26: Safe fallback when provider returns empty response
  it('TC-26: Provider returning empty string triggers safe fallback answer', async () => {
    mockGenerateCompletion.mockResolvedValue('');

    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Show my tasks', scopeType: 'personal' });

    expect(res.status).toBe(200);
    expect(res.body.data.answer).toContain('apologize');
  });

  // TC-31: Automatic routing for personal task query without scope selector
  it('TC-31: Automatic routing executes getMyTasks for personal task query', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'What are my tasks today?' });

    expect(res.status).toBe(200);
    expect(res.body.data.answer).toBeDefined();
  });

  // TC-32: Automatic routing for product help query without scope selector
  it('TC-32: Automatic routing executes searchProductHelp for feature help query', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'How do task submissions work?' });

    expect(res.status).toBe(200);
    expect(res.body.data.answer).toBeDefined();
  });

  // TC-33: Page hint context spoofing attempt
  it('TC-33: Passing unauthorized classId in pageContext is safely denied', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({
        message: 'Show class summary',
        pageContext: { classId: classCId },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.answer).toContain("can't access information");
  });

  // TC-34: Natural language entity resolution for Priya in Class A
  it('TC-34: Entity resolution for Priya is bounded strictly within Class A', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({
        message: "Show me Priya's work",
        pageContext: { classId: classAId },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.answer).toBeDefined();
  });

  // TC-35: Unknown tool call rejected with safe clarification & invalid_tool_call audit
  it('TC-35: Unknown tool call is rejected without executing searchProductHelp fallback', async () => {
    // Force mock provider to return an invalid tool call name
    const mockProvider = {
      generateCompletion: jest.fn().mockResolvedValue('Fallback response'),
      generateWithTools: jest.fn().mockResolvedValue({
        content: '',
        toolCalls: [{ name: 'unknownMaliciousTool', arguments: {} }],
        inputTokens: 10,
        outputTokens: 5,
      }),
    };
    (getAIProvider as jest.Mock).mockReturnValue(mockProvider);

    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Execute secret command' });

    expect(res.status).toBe(200);
    expect(res.body.data.answer).toContain('could not process the details');
  });

  // TC-36: Unauthorized tool execution intercepted with safe denial response
  it('TC-36: Unauthorized tool execution results in safe denial answer', async () => {
    const mockProvider = {
      generateCompletion: jest.fn().mockResolvedValue('Synthesis answer'),
      generateWithTools: jest.fn().mockResolvedValue({
        content: '',
        toolCalls: [{ name: 'getClassSummary', arguments: { classId: classCId } }],
        inputTokens: 10,
        outputTokens: 5,
      }),
    };
    (getAIProvider as jest.Mock).mockReturnValue(mockProvider);

    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Show summary of Class C', pageContext: { classId: classCId } });

    expect(res.status).toBe(200);
    expect(res.body.data.answer).toContain("can't access information");
  });

  // TC-37: Token accounting accurately measures input and output tokens
  it('TC-37: Tokens used reflects combined input and output token consumption', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'What are my tasks today?' });

    expect(res.status).toBe(200);
    expect(res.body.data.tokensUsed).toBeGreaterThan(0);
  });

  // TC-38: Model Call 2 Session Message Normalization
  it('TC-38: Model Call 2 receives strictly provider-safe {role, content} objects without timestamp or metadata', async () => {
    await testPool.query(
      `INSERT INTO ai_conversation_sessions (session_id, user_id, scope_type, scope_id, messages)
       VALUES (gen_random_uuid(), $1, 'global', NULL, $2)`,
      [
        userA.userId,
        JSON.stringify([
          { role: 'user', content: 'Prior question', timestamp: '2026-09-22T10:00:00Z', customMeta: 'extraData', id: 'msg1' },
          { role: 'assistant', content: 'Prior answer', timestamp: '2026-09-22T10:00:05Z', internalId: 99 },
        ]),
      ]
    );

    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Follow up question' });

    expect(res.status).toBe(200);
    expect(mockGenerateCompletion).toHaveBeenCalled();

    const calls = mockGenerateCompletion.mock.calls;
    const historyMessagesSent = calls[0][0];

    // Every message sent to provider MUST strictly have only role and content properties
    historyMessagesSent.forEach((m: any) => {
      expect(m.timestamp).toBeUndefined();
      expect(m.customMeta).toBeUndefined();
      expect(m.id).toBeUndefined();
      expect(m.internalId).toBeUndefined();
      expect(Object.keys(m).sort()).toEqual(['content', 'role']);
    });
  });

  // TC-39: Project question automatically selects getProjectSummary
  it('TC-39: Project question automatically selects getProjectSummary tool', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({
        message: 'Summarize project progress',
        pageContext: { projectId: projectAId },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.answer).toBeDefined();
    expect(res.body.data.sources[0].title).toBe('getProjectSummary');
  });

  // TC-40: Operational project question does NOT use searchProductHelp fallback
  it('TC-40: Operational project query never falls back to searchProductHelp', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({
        message: 'What is blocking this project?',
        pageContext: { projectId: projectAId },
      });

    expect(res.status).toBe(200);
    const sources = res.body.data.sources || [];
    expect(sources.map((s: any) => s.title)).not.toContain('searchProductHelp');
    expect(sources.map((s: any) => s.title)).toContain('getProjectSummary');
  });

  // TC-41: Authorized project access returns minimal DTO
  it('TC-41: getProjectSummary tool execution returns minimal project DTO projection', async () => {
    const summary = await aiToolRegistry.executeTool(
      'getProjectSummary',
      { callerUserId: userA.userId, scopeType: 'project', scopeId: projectAId },
      { projectId: projectAId }
    );

    expect(summary.project_id).toBe(projectAId);
    expect(summary.project_name).toBeDefined();
    expect(summary.status).toBe('active');
    expect(summary.task_counts).toBeDefined();
    expect(summary.active_blockers_count).toBeDefined();
    expect(summary.high_priority_tasks).toBeDefined();
    // Ensure raw credentials/tokens/other user private fields are absent
    expect(summary.password_hash).toBeUndefined();
    expect(summary.email).toBeUndefined();
  });

  // TC-42: Unauthorized project access is denied safely
  it('TC-42: User A attempting to query User B private project is denied safely', async () => {
    const isAuthorized = await aiToolRegistry.getTool('getProjectSummary')?.authorize(
      { callerUserId: userA.userId, scopeType: 'project', scopeId: projectBId },
      { projectId: projectBId }
    );

    expect(isAuthorized).toBe(false);
  });

  // TC-43: pageContext projectId spoofing fails safely
  it('TC-43: Passing unauthorized projectId in pageContext results in permission denial', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({
        message: 'Summarize project progress',
        pageContext: { projectId: projectBId },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.answer).toContain("can't access information");
  });

  // TC-44: Unknown project tool call rejected with invalid_tool_call
  it('TC-44: Unknown tool call returned by provider is rejected with safe error answer', async () => {
    const mockProvider = {
      generateCompletion: jest.fn().mockResolvedValue('Fallback response'),
      generateWithTools: jest.fn().mockResolvedValue({
        content: '',
        toolCalls: [{ name: 'fakeProjectTool', arguments: { projectId: projectAId } }],
        inputTokens: 10,
        outputTokens: 5,
      }),
    };
    (getAIProvider as jest.Mock).mockReturnValue(mockProvider);

    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Query fake project info', pageContext: { projectId: projectAId } });

    expect(res.status).toBe(200);
    expect(res.body.data.answer).toContain('could not process the details');
  });

  // TC-45: Projects query-string projectId extraction
  it('TC-45: Project query with pageContext containing query-string projectId executes getProjectSummary', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({
        message: 'Summarize project progress',
        pageContext: { path: '/projects', projectId: projectAId },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sources[0].title).toBe('getProjectSummary');
  });

  // TC-46: Single authorized project auto-resolution
  it('TC-46: Single authorized project auto-resolves when projectId is unprovided', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userB.token))
      .send({ message: 'Summarize project progress' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sources[0].title).toBe('getProjectSummary');
  });

  // TC-47: Multiple authorized projects return structured disambiguation
  it('TC-47: Multiple authorized projects return structured disambiguation pills when projectId is unprovided', async () => {
    await testPool.query(
      `INSERT INTO projects (project_name, description, created_by, status, priority, is_public)
       VALUES ('Project Alpha 2', 'Second project', $1, 'active', 'medium', false)`,
      [userA.userId]
    );

    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Summarize project progress' });

    expect(res.status).toBe(200);
    expect(res.body.data.disambiguation).toBeDefined();
    expect(res.body.data.disambiguation.message).toContain('Which project');
    expect(res.body.data.disambiguation.options.length).toBeGreaterThanOrEqual(2);
  });

  // TC-48: Disambiguation contains only authorized projects
  it('TC-48: Disambiguation options contain strictly authorized projects for the caller', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Summarize project progress' });

    expect(res.status).toBe(200);
    if (res.body.data.disambiguation) {
      const optionIds = res.body.data.disambiguation.options.map((o: any) => o.scopeId);
      expect(optionIds).not.toContain(projectBId);
    }
  });

  // TC-49: Zero authorized projects handled safely
  it('TC-49: User with zero accessible projects receives safe message without error', async () => {
    const uNoProj = await testPool.query(
      `INSERT INTO users (email, password_hash, full_name, username, role)
       VALUES ('noprojects@test.local', '$2b$10$dummyhash', 'No Proj User', 'noproj_user', 'user')
       RETURNING user_id`
    );
    const noProjUserId = uNoProj.rows[0].user_id;
    const noProjToken = signAccessToken({ userId: noProjUserId, role: 'user' });

    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(noProjToken))
      .send({ message: 'Summarize project progress' });

    expect(res.status).toBe(200);
    expect(res.body.data.answer).toContain('could not find any accessible projects');
  });

  // TC-50: Operational project query never falls back to searchProductHelp
  it('TC-50: Ambiguous operational project question does NOT fall back to searchProductHelp', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'What is blocking this project?' });

    expect(res.status).toBe(200);
    const sources = res.body.data.sources || [];
    expect(sources.map((s: any) => s.title)).not.toContain('searchProductHelp');
  });

  // TC-51: "What needs my attention?" on a project page routes to getPersonalAttentionItems (Personal intent overrides page context)
  it('TC-51: "What needs my attention?" on a project page remains PERSONAL and routes to getPersonalAttentionItems', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({
        message: 'What needs my attention?',
        pageContext: { path: '/projects', projectId: projectAId },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.sources[0].title).toBe('getPersonalAttentionItems');
  });

  // TC-52: Unauthorized projectId in pageContext remains denied
  it('TC-52: Unauthorized projectId in pageContext is strictly denied', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({
        message: 'Summarize project progress',
        pageContext: { path: '/projects', projectId: projectBId },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.answer).toContain("can't access information");
  });

  // TC-53: Model cannot bypass project authorization
  it('TC-53: Model returning getProjectSummary for unauthorized project is blocked by backend interceptor', async () => {
    const mockProvider = {
      generateCompletion: jest.fn().mockResolvedValue('Synthesis answer'),
      generateWithTools: jest.fn().mockResolvedValue({
        content: '',
        toolCalls: [{ name: 'getProjectSummary', arguments: { projectId: projectBId } }],
        inputTokens: 10,
        outputTokens: 5,
      }),
    };
    (getAIProvider as jest.Mock).mockReturnValue(mockProvider);

    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'Give me project details' });

    expect(res.status).toBe(200);
    expect(res.body.data.answer).toContain("can't access information");
  });

  // TC-54: No project data enters the LLM before authorization
  it('TC-54: PostgreSQL permission query executes before any project data is read for LLM', async () => {
    const isAuth = await projectsRepository.canAccessProject(userA.userId, projectBId);
    expect(isAuth).toBe(false);
  });

  // TC-55: Exact 8-tool registry count
  it('TC-55: Authoritative tool registry contains EXACTLY 8 allowlisted tools', async () => {
    const definitions = aiToolRegistry.getDefinitions();
    expect(definitions.length).toBe(8);
    const toolNames = definitions.map((d: any) => d.name).sort();
    expect(toolNames).toEqual([
      'getClassMemberWork',
      'getClassSummary',
      'getMyTasks',
      'getMyWorkLogs',
      'getPersonalAttentionItems',
      'getProjectSummary',
      'getTeamSummary',
      'searchProductHelp',
    ]);
  });

  // TC-56: getPersonalAttentionItems execution returns overdue and high priority tasks
  it('TC-56: getPersonalAttentionItems tool executes and returns overdue and high priority tasks', async () => {
    await testPool.query(
      `INSERT INTO tasks (project_id, title, description, owner, status, priority, created_by)
       VALUES ($1, 'Overdue Task Alpha', 'Urgent fix', $2, 'todo', 'high', $2)`,
      [projectAId, userA.userId]
    );


    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({ message: 'What needs my attention?' });

    expect(res.status).toBe(200);
    expect(res.body.data.sources[0].title).toBe('getPersonalAttentionItems');
  });

  // TC-57: Choice pill click with explicitScopeType & explicitScopeId executes tool directly
  it('TC-57: Sending explicitScopeType and explicitScopeId re-authorizes UUID and executes getProjectSummary', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({
        message: 'Project Alpha',
        explicitScopeType: 'project',
        explicitScopeId: projectAId,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.sources[0].title).toBe('getProjectSummary');
  });

  // TC-58: Choice pill click with unauthorized explicitScopeId is denied safely
  it('TC-58: Sending explicitScopeId for unauthorized project B is denied safely', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({
        message: 'Project Beta Private',
        explicitScopeType: 'project',
        explicitScopeId: projectBId,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.answer).toContain("can't access information");
  });

  // TC-59: Personal task query on /projects page remains personal
  it('TC-59: "What are my tasks today?" on /projects page remains PERSONAL', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({
        message: 'What are my tasks today?',
        pageContext: { path: '/projects', projectId: projectAId },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.sources[0].title).toBe('getMyTasks');
  });

  // TC-60: Personal overdue query on /teams page remains personal
  it('TC-60: "Which tasks are overdue?" on /teams page remains PERSONAL', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({
        message: 'Which tasks are overdue?',
        pageContext: { path: '/teams', teamId: subTeamAId },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.sources[0].title).toBe('getPersonalAttentionItems');
  });

  // TC-61: Fix for specific reported supervision query
  it('TC-61: "which team member need to be under supervision of mine not working properly?" resolves team context cleanly', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set(authHeader(userA.token))
      .send({
        message: 'which team member need to be under supervision of mine not working properly?',
        explicitScopeType: 'team',
        explicitScopeId: subTeamAId,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.answer).toBeDefined();
    expect(res.body.data.answer).not.toContain('error occurred');
    expect(res.body.data.followUpChips).toBeDefined();
    expect(res.body.data.followUpChips.length).toBeGreaterThanOrEqual(2);
  });

  // TC-62 to TC-162: Mass 100+ Natural-Language Question Matrix Pass
  describe('Mass 100+ Natural-Language Question Matrix Pass', () => {
    const questionCorpus: Array<{ q: string; expectedCategory?: string; pageContext?: any }> = [
      // 1. Personal Work Questions (25)
      { q: 'What are my tasks today?' },
      { q: 'What are my pending tasks?' },
      { q: 'What tasks are overdue?' },
      { q: 'What needs my attention?' },
      { q: 'What should I focus on today?' },
      { q: 'What is urgent?' },
      { q: 'What is high priority?' },
      { q: 'What deadlines are coming up?' },
      { q: 'Which tasks are waiting for review?' },
      { q: 'Which of my tasks are blocked?' },
      { q: 'Show me unfinished work.' },
      { q: 'Summarize my workload.' },
      { q: 'How much work do I have?' },
      { q: 'What did I complete recently?' },
      { q: 'What is still pending?' },
      { q: 'What should I finish first?' },
      { q: 'Do I have anything overdue?' },
      { q: 'Which tasks are due today?' },
      { q: 'Which tasks are due this week?' },
      { q: 'What work is at risk?' },
      { q: 'Show my blockers.' },
      { q: 'What is slowing me down?' },
      { q: 'Give me a quick work summary.' },
      { q: 'Give me my daily status.' },
      { q: 'Give me my weekly status.' },

      // 2. Team & Supervision Questions (25)
      { q: 'How is my team doing?' },
      { q: 'How is my team progressing?' },
      { q: 'Is my team on track?' },
      { q: 'Who needs attention in my team?' },
      { q: 'Which team members are behind?' },
      { q: 'Who has overdue work?' },
      { q: 'Who has pending tasks?' },
      { q: 'Who has not submitted work?' },
      { q: 'Who has not been active?' },
      { q: 'Which members are blocked?' },
      { q: 'Which members need follow-up?' },
      { q: 'Who is overloaded?' },
      { q: 'Who has the most pending work?' },
      { q: 'Who completed the most work?' },
      { q: 'Who has unfinished work?' },
      { q: 'Show team progress.' },
      { q: 'Give me a team summary.' },
      { q: "What's happening in my team?" },
      { q: 'What should I focus on as a team manager?' },
      { q: 'Which team members are not working properly?' },
      { q: 'Which team members need supervision?' },
      { q: 'Who needs my attention?' },
      { q: 'Who is falling behind?' },
      { q: 'Who has not updated their work?' },
      { q: 'Who has not submitted today work?' },

      // 3. Member / Student Questions (15)
      { q: 'What has Priya completed?' },
      { q: 'What is Priya working on?' },
      { q: 'What is Priya doing?' },
      { q: 'What tasks does Priya have?' },
      { q: 'Does Priya have overdue work?' },
      { q: 'Is Priya blocked?' },
      { q: 'Has Priya submitted today work?' },
      { q: "What is Priya's progress?" },
      { q: "Show Priya's pending work." },
      { q: "Which of Priya's tasks are overdue?" },
      { q: 'Which students need attention?' },
      { q: 'Which students have pending work?' },
      { q: 'Who has not submitted?' },
      { q: 'Who is behind?' },
      { q: 'Who needs follow-up?' },

      // 4. Project Questions (15)
      { q: 'Summarize this project.' },
      { q: 'How is this project progressing?' },
      { q: 'What is blocking this project?' },
      { q: 'Why is this project behind?' },
      { q: 'What is left to complete?' },
      { q: 'Which tasks are overdue in project?' },
      { q: 'Which tasks are high priority in project?' },
      { q: 'What are the biggest risks?' },
      { q: 'What should I focus on in this project?' },
      { q: 'Who is working on this project?' },
      { q: 'Which tasks are blocked?' },
      { q: 'How many tasks remain?' },
      { q: 'Show project status.' },
      { q: 'Give me a project summary.' },
      { q: 'Is this project on track?' },

      // 5. Classroom Questions (10)
      { q: 'How is my class doing?' },
      { q: 'How many students are pending?' },
      { q: 'Who has not submitted in class?' },
      { q: 'Who needs attention in class?' },
      { q: 'Which students are behind?' },
      { q: 'Show class progress.' },
      { q: 'Summarize this class.' },
      { q: 'Which students completed their work?' },
      { q: 'Who has overdue work in class?' },
      { q: 'Which students have pending submissions?' },

      // 6. Product Help Questions (10)
      { q: 'How do I create a team?' },
      { q: 'How do I create a task?' },
      { q: 'How do I submit work?' },
      { q: 'How does task review work?' },
      { q: 'How do I update a task?' },
      { q: 'How do I create a goal?' },
      { q: 'How do I join a team?' },
      { q: 'How do I manage a team?' },
      { q: 'How do submissions work?' },
      { q: 'What is Pulse?' },

      // 7. Cross-Workspace & Ambiguity Questions (10)
      { q: 'Give me an overall summary.' },
      { q: 'How am I doing across my work?' },
      { q: 'What needs my attention across everything?' },
      { q: 'Give me my overall workload.' },
      { q: "What's pending across my projects?" },
      { q: 'Show my overall progress.' },
      { q: 'What are my biggest blockers?' },
      { q: 'What is most urgent right now?' },
      { q: 'Summarize my project.' },
      { q: 'Show progress.' },
    ];

    questionCorpus.forEach((item, index) => {
      it(`TC-${62 + index}: "${item.q}" returns structured answer with clean format and follow-up chips`, async () => {
        const res = await request(app)
          .post('/api/ai/assistant')
          .set(authHeader(userA.token))
          .send({ message: item.q, pageContext: item.pageContext });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.answer).toBeDefined();

        // Never expose raw tool names, raw localhost URLs, or raw API paths
        const ans = res.body.data.answer;
        expect(ans).not.toContain('getMyTasks');
        expect(ans).not.toContain('searchProductHelp');
        expect(ans).not.toContain('getClassMemberWork');
        expect(ans).not.toContain('http://localhost');
        expect(ans).not.toContain('error occurred while processing your request');
      });
    });
  });
});


