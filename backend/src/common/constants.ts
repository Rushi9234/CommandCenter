// Shared constants used by more than one module. Anything used by exactly
// one module stays local to that module instead of collecting here.

export const DEFAULT_TEAM_SIZE = 10;
export const DEFAULT_TEAM_TYPE = 'main';
export const DEFAULT_MEMBER_ROLE = 'member';

// GROQ_API_URL/GROQ_MODEL moved to modules/ai/providers/groqProvider.ts in
// Milestone 13 -- Groq-specific values belong with the Groq provider
// implementation, not in a file shared by unrelated modules.
