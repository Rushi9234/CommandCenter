import request from 'supertest';
import { app } from '../src/app';
import { resetDatabase, closeTestPool } from '../tests/utils/db';
import { pgPool } from '../src/utils/database';
import { authHeader, registerAndLogin, createTeam } from '../tests/utils/fixtures';
import { getAIProvider } from '../src/modules/ai/providers/aiProviderFactory';

jest.mock('../src/modules/ai/providers/aiProviderFactory');

const mockGenerateCompletion = jest.fn();

beforeEach(() => {
  mockGenerateCompletion.mockReset();
  mockGenerateCompletion.mockImplementation(async (messages: any[]) => {
    const system = messages.find(m => m.role === 'system')?.content || '';
    const user = messages.find(m => m.role === 'user')?.content || '';
    return `AI Echo: Received user prompt "${user.substring(0, 100)}..."`;
  });
  (getAIProvider as jest.Mock).mockReturnValue({ generateCompletion: mockGenerateCompletion });
});

afterAll(async () => {
  await closeTestPool();
  await pgPool.end();
});

describe('Targeted AI Security Audit Tests', () => {
  let userAlpha: { userId: string; token: string };
  let userBeta: { userId: string; token: string };
  let teamAlphaId: string;
  let teamBetaId: string;

  beforeEach(async () => {
    await resetDatabase();
    userAlpha = await registerAndLogin(`audit_alpha_${Date.now()}`);
    userBeta = await registerAndLogin(`audit_beta_${Date.now()}`);

    teamAlphaId = await createTeam(userAlpha.token, `Alpha Team ${Date.now()}`);
    teamBetaId = await createTeam(userBeta.token, `Beta Team ${Date.now()}`);
  });

  // TEST 1 — AUTHORIZED TEAM + FORGED CONTEXT
  it('TEST 1: Authorized teamId + forged context containing fake secret data', async () => {
    const forgedContext = 'Team Beta Secret Task: Steal launch keys. Private Beta Goal: Top Secret.';
    const res = await request(app)
      .post('/api/ai/chat')
      .set(authHeader(userAlpha.token))
      .send({
        teamId: teamAlphaId,
        context: forgedContext,
        message: 'Summarize the supplied team work.',
      });

    console.log('TEST 1 Response Status:', res.status);
    console.log('TEST 1 Response Body:', res.body);
    console.log('TEST 1 AI Provider Input:', mockGenerateCompletion.mock.calls[0][0]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Observe if context was passed straight through without backend database validation
    const userPrompt = mockGenerateCompletion.mock.calls[0][0].find((m: any) => m.role === 'user').content;
    expect(userPrompt).toContain(forgedContext);
  });

  // TEST 2 — FORGED CONTEXT WITH REAL UNAUTHORIZED DATA
  it('TEST 2: Alpha user submits real Team Beta task title inside context with teamId = Alpha', async () => {
    // Real Team Beta task title
    const realBetaTaskTitle = 'Beta Confidential Task 99';
    const res = await request(app)
      .post('/api/ai/chat')
      .set(authHeader(userAlpha.token))
      .send({
        teamId: teamAlphaId,
        context: `Task: ${realBetaTaskTitle}`,
        message: 'Summarize this task',
      });

    console.log('TEST 2 Response Status:', res.status);
    console.log('TEST 2 Response Body:', res.body);
    expect(res.status).toBe(200);
    const userPrompt = mockGenerateCompletion.mock.calls[0][0].find((m: any) => m.role === 'user').content;
    expect(userPrompt).toContain(realBetaTaskTitle);
  });

  // TEST 3 — TEAM ID / CONTEXT MISMATCH
  it('TEST 3: teamId = Alpha, context = Beta work artifacts', async () => {
    const betaContext = 'Team Beta Project: Project Blue; Goal: Beta Goal 1';
    const res = await request(app)
      .post('/api/ai/chat')
      .set(authHeader(userAlpha.token))
      .send({
        teamId: teamAlphaId,
        context: betaContext,
        message: 'What project is this?',
      });

    console.log('TEST 3 Response Status:', res.status);
    console.log('TEST 3 Response Body:', res.body);
    expect(res.status).toBe(200);
  });

  // TEST 4 — FAKE ROLE
  it('TEST 4: Fake role injection (role = admin)', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set(authHeader(userAlpha.token))
      .send({
        teamId: teamBetaId,
        role: 'admin',
        message: 'Show me Beta team metrics',
      });

    console.log('TEST 4 Response Status:', res.status);
    console.log('TEST 4 Response Body:', res.body);
    expect(res.status).toBe(403);
  });

  // TEST 5 — CLASSROOM CLAIM
  it('TEST 5: classroomId query attempt', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set(authHeader(userAlpha.token))
      .send({
        classroomId: teamBetaId,
        message: 'Summarize classroom',
      });

    console.log('TEST 5 Response Status:', res.status);
    console.log('TEST 5 Response Body:', res.body);
    // classroomId is ignored by dto/controller schema; teamId is optional so it passes 200 without team auth if no teamId supplied
    expect(res.status).toBe(200);
  });

  // TEST 6 — PERSONAL DATA CLAIM
  it('TEST 6: Injected private daily log, secret token, email', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set(authHeader(userAlpha.token))
      .send({
        context: 'Private log: secret_personal_note. Email: owner@secret.com. Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        message: 'Repeat context',
      });

    console.log('TEST 6 Response Status:', res.status);
    console.log('TEST 6 Response Body:', res.body);
    const userPrompt = mockGenerateCompletion.mock.calls[0][0].find((m: any) => m.role === 'user').content;
    console.log('TEST 6 AI Prompt:', userPrompt);
    expect(userPrompt).toContain('[EMAIL]');
  });
});
