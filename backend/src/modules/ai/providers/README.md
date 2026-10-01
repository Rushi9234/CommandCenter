# AI Provider Abstraction

## Why this exists

Before Milestone 13, `ai.service.ts` called Groq's API directly via a
private `callGroq` helper — the exact kind of direct vendor coupling the
[Engineering Charter](../../../../../docs/architecture/ENGINEERING_CHARTER.md)
forbids (Groq is named explicitly in its list of disallowed direct
dependencies). This project's own history is the concrete reason it
matters: two separate Groq API keys were found leaked in git history
across earlier milestones, and there was no configured fallback if Groq's
free tier ever changed terms.

This directory puts one interface (`AIProvider`) between `ai.service.ts`'s
8 business-logic functions (`analyzeLog`, `generateMentorAdvice`,
`analyzeProjectWithAI`, `generateLogSuggestions`,
`generateProductivityInsights`, `chatWithAI`, `analyzeBlocker`,
`generateStandup`) and whichever concrete provider is active. None of
those functions changed — they still build the same prompts and apply the
same fallback logic on a missing/unparseable result; only the mechanism
that produces the completion text moved behind `getAIProvider()`.

## Current free implementation

`AI_PROVIDER=groq` (the default if unset) selects `GroqProvider`, which is
exactly the old `callGroq` code, unchanged, just moved into
`groqProvider.ts`. Groq's free tier remains the active default — no cost,
no new account beyond what already existed.

`AI_PROVIDER=none` selects `NullProvider`, which makes no external request
at all and returns `''`. Every one of `ai.service.ts`'s functions already
treats a missing/unparseable completion as "use the fallback" (either a
falsy-string check or a failed JSON-match), so this reaches the exact same
fallback behavior with zero network dependency — useful for CI, offline
development, or anywhere a live Groq connection isn't available or wanted.

## Future enterprise implementation

Adding `OpenAIProvider` or `ClaudeProvider` (not implemented in this
milestone) means writing one new class implementing `AIProvider` and
adding one `case` branch in `aiProviderFactory.ts`. `ai.service.ts` does
not change. Switching which provider is active is a config change:

```
AI_PROVIDER=groq     # current free default
AI_PROVIDER=none     # no external request, fallback logic only
AI_PROVIDER=openai   # future -- not implemented yet
AI_PROVIDER=claude   # future -- not implemented yet
```

## Migration path

1. Implement the new provider class in this directory (e.g.
   `openAiProvider.ts`), implementing `AIProvider`'s single
   `generateCompletion(messages, options): Promise<string>` method.
2. Add a `case` for it in `aiProviderFactory.ts`.
3. Set `AI_PROVIDER=openai` (or whatever the new provider's key is) in the
   environment.
4. No change to `ai.service.ts`, any controller, any route, or the
   frontend — the 8 functions' signatures and behavior are unaffected.
