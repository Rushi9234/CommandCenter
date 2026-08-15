import { env } from '../../../config/env';
import { AIProvider, AIMessage, AICompletionOptions } from './aiProvider.interface';
import { GroqProvider } from './groqProvider';
import { GeminiProvider } from './geminiProvider';
import { NullProvider } from './nullProvider';

let cachedProvider: AIProvider | null = null;

class FallbackAIProvider implements AIProvider {
  private primary: AIProvider;
  private fallback: AIProvider;

  constructor(primary: AIProvider, fallback: AIProvider) {
    this.primary = primary;
    this.fallback = fallback;
  }

  async generateCompletion(
    messages: AIMessage[],
    options: AICompletionOptions = {}
  ): Promise<string> {
    try {
      return await this.primary.generateCompletion(messages, options);
    } catch (primaryError) {
      console.error(
        '[AI] Primary provider failed, trying fallback provider:',
        primaryError
      );

      try {
        return await this.fallback.generateCompletion(messages, options);
      } catch (fallbackError) {
        console.error(
          '[AI] Fallback provider also failed:',
          fallbackError
        );

        throw fallbackError;
      }
    }
  }
}

export const getAIProvider = (): AIProvider => {
  if (cachedProvider) {
    return cachedProvider;
  }

  switch (env.aiProvider) {
    case 'none':
      cachedProvider = new NullProvider();
      break;

    case 'groq':
      cachedProvider = new FallbackAIProvider(
        new GroqProvider(),
        new GeminiProvider()
      );
      break;

    case 'gemini':
      cachedProvider = new FallbackAIProvider(
        new GeminiProvider(),
        new GroqProvider()
      );
      break;

    default:
      throw new Error(`Unsupported AI provider: ${env.aiProvider}`);
  }

  return cachedProvider;
};

export const resetAIProviderCache = (): void => {
  cachedProvider = null;
};