import { env } from '../../../config/env';
import { AIProvider, AIMessage, AICompletionOptions } from './aiProvider.interface';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export class GeminiProvider implements AIProvider {
  async generateCompletion(
    messages: AIMessage[],
    options: AICompletionOptions = {}
  ): Promise<string> {
    if (!env.geminiApiKey) {
      throw new Error('Gemini AI provider is not configured: GEMINI_API_KEY is missing');
    }

    const contents = messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));

    const response = await fetch(
      `${GEMINI_API_URL}?key=${env.geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.max_tokens ?? 500,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API request failed with HTTP ${response.status}`);
    }

    const data: any = await response.json();

    const content =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('Gemini API returned an unexpected completion response');
    }

    return content;
  }
}