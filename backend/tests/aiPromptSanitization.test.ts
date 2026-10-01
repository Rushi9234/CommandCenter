import { getAIProvider } from '../src/modules/ai/providers/aiProviderFactory';

// Phase 3 security audit: verifies maskPII is actually applied at the
// prompt-construction boundary -- i.e. that raw PII never reaches
// getAIProvider().generateCompletion(), not just that maskPII exists
// somewhere. Mocks the provider factory itself (the exact external-call
// boundary), so these tests never make a real network call, matching
// aiProvider.test.ts's own existing convention for this module.
jest.mock('../src/modules/ai/providers/aiProviderFactory');

import {
  analyzeLog,
  generateMentorAdvice,
  analyzeProjectWithAI,
  generateLogSuggestions,
  generateProductivityInsights,
  chatWithAI,
  analyzeBlocker,
  generateWorkSummary,
  generateStandup,
} from '../src/modules/ai/ai.service';

const mockGenerateCompletion = jest.fn();

beforeEach(() => {
  mockGenerateCompletion.mockReset();
  mockGenerateCompletion.mockResolvedValue('{}');
  (getAIProvider as jest.Mock).mockReturnValue({ generateCompletion: mockGenerateCompletion });
});

// The exact string this app would send to Groq -- messages[0].content.
const promptSentToProvider = () => mockGenerateCompletion.mock.calls[0][0][0].content;

const LEAK_EMAIL = 'leak@example.com';
const LEAK_PHONE = '555-123-4567';
const LEAK_IP = '10.0.0.5';

describe('AI prompt PII masking -- Phase 3 security audit finding', () => {
  describe('already-masked functions (reconfirming existing behavior, not modified this milestone)', () => {
    it('analyzeLog masks email/phone/IP before the prompt reaches the provider', async () => {
      await analyzeLog(`Contact me at ${LEAK_EMAIL} or ${LEAK_PHONE} from ${LEAK_IP}`, {});
      const prompt = promptSentToProvider();
      expect(prompt).not.toContain(LEAK_EMAIL);
      expect(prompt).not.toContain(LEAK_PHONE);
      expect(prompt).not.toContain(LEAK_IP);
      expect(prompt).toContain('[EMAIL]');
      expect(prompt).toContain('[PHONE]');
      expect(prompt).toContain('[IP]');
    });

    it('chatWithAI masks the message and context', async () => {
      await chatWithAI(`email me at ${LEAK_EMAIL}`, `ctx with ${LEAK_IP}`);
      const prompt = promptSentToProvider();
      expect(prompt).not.toContain(LEAK_EMAIL);
      expect(prompt).not.toContain(LEAK_IP);
    });

    it('generateWorkSummary masks each entry', async () => {
      await generateWorkSummary([`reach me at ${LEAK_EMAIL}`]);
      const prompt = promptSentToProvider();
      expect(prompt).not.toContain(LEAK_EMAIL);
    });
  });

  describe('newly masked functions', () => {
    it('generateMentorAdvice masks the blocker text and each chat message', async () => {
      await generateMentorAdvice(
        `blocked, contact ${LEAK_EMAIL} for access`,
        [{ username: 'ada', message_text: `try ${LEAK_IP} instead` }],
        'unused context'
      );
      const prompt = promptSentToProvider();
      expect(prompt).not.toContain(LEAK_EMAIL);
      expect(prompt).not.toContain(LEAK_IP);
      expect(prompt).toContain('[EMAIL]');
      expect(prompt).toContain('[IP]');
      // username itself is untouched -- an identifier, not free text
      expect(prompt).toContain('ada:');
    });

    it('generateMentorAdvice still returns the existing fallback string on provider failure', async () => {
      mockGenerateCompletion.mockRejectedValue(new Error('provider down'));
      const result = await generateMentorAdvice('x', [], 'y');
      expect(result).toBe('I apologize, but I encountered an error generating advice. Please try again.');
    });

    it('analyzeProjectWithAI masks project name, description, and requirements', async () => {
      await analyzeProjectWithAI(`Project for ${LEAK_EMAIL}`, `contact ${LEAK_PHONE}`, `reach ${LEAK_IP}`);
      const prompt = promptSentToProvider();
      expect(prompt).not.toContain(LEAK_EMAIL);
      expect(prompt).not.toContain(LEAK_PHONE);
      expect(prompt).not.toContain(LEAK_IP);
    });

    it('analyzeProjectWithAI still returns the existing fallback shape on provider failure', async () => {
      mockGenerateCompletion.mockRejectedValue(new Error('provider down'));
      const result = await analyzeProjectWithAI('t', 'd');
      expect(result).toEqual({
        suggested_tasks: [],
        tech_stack: [],
        risks: ['Unable to analyze at this time'],
        timeline_estimate: 'Unknown',
        team_size_recommendation: 1,
      });
    });

    it('generateLogSuggestions masks each recent log entry', async () => {
      await generateLogSuggestions([`reach me at ${LEAK_EMAIL}`], []);
      const prompt = promptSentToProvider();
      expect(prompt).not.toContain(LEAK_EMAIL);
    });

    it('generateLogSuggestions still returns the existing fallback shape on provider failure', async () => {
      mockGenerateCompletion.mockRejectedValue(new Error('provider down'));
      const result = await generateLogSuggestions(['x'], []);
      expect(result).toEqual({
        suggestions: ['Describe your main task', 'Note any challenges', 'List accomplishments'],
        focus_areas: ['Tasks', 'Progress'],
        productivity_tip: 'Be specific and concise',
      });
    });

    it('analyzeBlocker masks title, description, and attempted -- but not the type label', async () => {
      await analyzeBlocker(`${LEAK_EMAIL} issue`, `contact ${LEAK_PHONE}`, 'technical', `tried ${LEAK_IP}`);
      const prompt = promptSentToProvider();
      expect(prompt).not.toContain(LEAK_EMAIL);
      expect(prompt).not.toContain(LEAK_PHONE);
      expect(prompt).not.toContain(LEAK_IP);
      expect(prompt).toContain('Type: technical');
    });

    it('analyzeBlocker still returns the existing fallback shape on provider failure', async () => {
      mockGenerateCompletion.mockRejectedValue(new Error('provider down'));
      const result = await analyzeBlocker('t', 'd', 'bug', 'a');
      expect(result).toEqual({ suggestions: [], root_cause: '', estimated_time: '' });
    });

    // Regression test: blockers.service.ts's real caller passes
    // body.attemptedSolutions straight through, and it's genuinely
    // optional (blockers.dto.ts) -- an earlier version of this fix called
    // maskPII(attempted) unconditionally, which threw on undefined
    // *before* analyzeBlocker's own try/catch ever ran, silently
    // preventing the provider from ever being called (caught only by
    // privacyEnforcement.test.ts's call-count assertion, not by this
    // file, until this test was added).
    it('analyzeBlocker does not throw when attempted is undefined (matches a real, legitimate caller)', async () => {
      const result = await analyzeBlocker('title', 'description', 'bug', undefined as any);
      expect(mockGenerateCompletion).toHaveBeenCalledTimes(1);
      expect(result).toEqual({});
    });

    it('generateStandup masks each bullet point', async () => {
      await generateStandup([{ username: 'ada', bullet_points: [`contact ${LEAK_EMAIL}`], sentiment_score: 0 }], []);
      const prompt = promptSentToProvider();
      expect(prompt).not.toContain(LEAK_EMAIL);
    });

    it('generateStandup still returns the existing fallback shape on provider failure', async () => {
      mockGenerateCompletion.mockRejectedValue(new Error('provider down'));
      const result = await generateStandup([{ username: 'ada', bullet_points: ['x'], sentiment_score: 0 }], []);
      expect(result).toEqual({ summary: 'Unable to generate standup', highlights: [], blockers: [], team_mood: 'neutral' });
    });
  });

  describe('function with nothing to mask (no free text enters the prompt)', () => {
    it('generateProductivityInsights sends only aggregate counts and returns the expected shape', async () => {
      mockGenerateCompletion.mockResolvedValue(
        JSON.stringify({ strengths: ['x'], improvements: [], recommendations: [], overall_assessment: 'ok' })
      );
      const result = await generateProductivityInsights([{}, {}], [{ status: 'done' }], 5);
      const prompt = promptSentToProvider();
      expect(prompt).not.toMatch(/[\w.-]+@[\w.-]+\.\w+/);
      expect(result.overall_assessment).toBe('ok');
    });
  });

  describe('functional equivalence -- non-sensitive content is unaffected', () => {
    it('ordinary text with no email/phone/IP passes through unchanged', async () => {
      await analyzeBlocker('Deploy failing', 'Build breaks on step 3', 'technical', 'Restarted CI twice');
      const prompt = promptSentToProvider();
      expect(prompt).toContain('Deploy failing');
      expect(prompt).toContain('Build breaks on step 3');
      expect(prompt).toContain('Restarted CI twice');
    });
  });
});
