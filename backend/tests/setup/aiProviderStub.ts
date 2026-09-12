// Stubs global fetch for every test by default, so any code path that
// exercises a real GroqProvider/GeminiProvider instance WITHOUT its own
// jest.spyOn(...) never makes a real network call to Groq/Gemini's live
// APIs. fetch is the ONLY external call either provider makes (confirmed:
// no other backend module calls fetch at all -- grep across src/), so this
// is scoped tightly to exactly the AI-provider boundary and cannot affect
// email, database, or any other subsystem.
//
// Why this exists: AI_PROVIDER defaults to 'groq' (config/env.ts) and is
// left that way in CI (backend/.env.test), because several existing test
// files (privacyEnforcement.test.ts, rateLimit.test.ts,
// finalAuditHardening.test.ts) rely on jest.spyOn(GroqProvider.prototype,
// 'generateCompletion') to control the AI response's exact content --
// that spy only ever fires if the real factory actually constructs a
// GroqProvider instance, which only happens when AI_PROVIDER='groq'.
// Setting AI_PROVIDER=none in CI would silently break every one of those
// tests (aiProviderFactory would return a NullProvider instead, and the
// spy would simply never be called), so that option was rejected after
// verifying this dependency, not assumed to be safe.
//
// Most OTHER test files never touch AI directly at all, but routinely
// trigger it indirectly (creating a daily log, blocker, or project all
// call into ai.service.ts). Before this stub, those tests made a REAL
// network request to Groq's live API using CI's placeholder API key,
// which fails with a genuine HTTP 401, then falls through to Gemini
// (whose key is entirely unset in CI), which throws immediately -- both
// errors are swallowed by ai.service.ts's own per-function try/catch (so
// no test assertion was ever actually affected), but this made CI depend
// on real outbound internet access to a third-party API for zero test
// value, and produced confusing error-shaped console noise that made a
// genuine CI report (from an automated reviewer) look like a real test
// failure when it was not.
//
// Any test that spies directly on GroqProvider.prototype.generateCompletion
// (or mocks the whole aiProviderFactory module, as aiPromptSanitization.test.ts
// does) is completely unaffected by this stub: spying on/mocking the method
// replaces its entire implementation, so the real body -- and therefore
// fetch -- is never reached for those tests either way, regardless of
// whether this stub is active.
const stubbedGroqResponse = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(stubbedGroqResponse() as unknown as Response);
});

afterEach(() => {
  fetchSpy.mockRestore();
});
