// Shared constants used by more than one module. Anything used by exactly
// one module stays local to that module instead of collecting here.

export const DEFAULT_TEAM_SIZE = 10;
export const DEFAULT_TEAM_TYPE = 'main';
export const DEFAULT_MEMBER_ROLE = 'member';

export const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODEL = 'llama-3.3-70b-versatile';
