import { env } from '../../../config/env';
import { AIProvider } from './aiProvider.interface';
import { GroqProvider } from './groqProvider';
import { NullProvider } from './nullProvider';

// The one place that decides which AIProvider implementation is active,
// based on the AI_PROVIDER env var (config/env.ts) -- ai.service.ts calls
// getAIProvider() and never imports a concrete provider class directly.
// Adding a future provider (OpenAI, Claude) means adding one class
// implementing AIProvider and one branch here -- no change to
// ai.service.ts's 8 functions or anything that calls them.
let cachedProvider: AIProvider | null = null;

export const getAIProvider = (): AIProvider => {
  if (cachedProvider) {
    return cachedProvider;
  }

  switch (env.aiProvider) {
    case 'none':
      cachedProvider = new NullProvider();
      break;
    case 'groq':
    default:
      // Free-first default (Engineering Charter rule 1): an unrecognized
      // value falls back to the free Groq provider rather than failing
      // the whole AI feature closed.
      cachedProvider = new GroqProvider();
      break;
  }

  return cachedProvider;
};

// Test-only: forces the next getAIProvider() call to re-read env.aiProvider
// and re-select instead of reusing the cached instance.
export const resetAIProviderCache = (): void => {
  cachedProvider = null;
};
