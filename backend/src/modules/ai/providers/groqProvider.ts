import { env } from '../../../config/env';
import { AIProvider, AIMessage, AICompletionOptions } from './aiProvider.interface';

// Charter rule 5: Groq-specific code (its URL, its model name, the shape
// of its chat-completions request/response) lives only in this file.
// Nothing outside providers/ knows these exist.
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// Moved verbatim from ai.service.ts's old private callGroq -- same
// endpoint, same headers, same request shape, same response parsing.
// Errors are not caught here; they propagate to the caller exactly as
// they did before this milestone, so every one of ai.service.ts's 8
// functions' existing try/catch fallback behavior is unchanged.
export class GroqProvider implements AIProvider {
  async generateCompletion(messages: AIMessage[], options: AICompletionOptions = {}): Promise<string> {
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

    const data = (await response.json()) as any;
    return data.choices[0].message.content as string;
  }
}
