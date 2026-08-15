import { env } from '../../../config/env';
import { AIProvider, AIMessage, AICompletionOptions } from './aiProvider.interface';

// Charter rule 5: Groq-specific code (URL, model, request/response shape)
// stays isolated in this provider. Business logic never depends on
// Groq-specific details.
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

export class GroqProvider implements AIProvider {
  async generateCompletion(
    messages: AIMessage[],
    options: AICompletionOptions = {}
  ): Promise<string> {
    if (!env.groqApiKey) {
      throw new Error('Groq AI provider is not configured: GROQ_API_KEY is missing');
    }

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 500,
      }),
    });

    // Never assume an unsuccessful Groq response has the normal
    // `choices[0].message.content` shape. Throw a safe provider-level error
    // so ai.service.ts can apply its existing fallback behavior without
    // exposing response bodies or credentials.
    if (!response.ok) {
      throw new Error(`Groq API request failed with HTTP ${response.status}`);
    }

    let data: any;

    try {
      data = await response.json();
    } catch {
      throw new Error('Groq API returned an invalid JSON response');
    }

    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('Groq API returned an unexpected completion response');
    }

    return content;
  }
}