// Charter rule 2/13: business logic (ai.service.ts) must never call a
// vendor directly. Every provider implementation in this directory
// implements this one interface; ai.service.ts only ever talks to it
// through aiProviderFactory.ts, never to a concrete class.

export interface AIMessage {
  role: string;
  content: string;
}

export interface AICompletionOptions {
  temperature?: number;
  max_tokens?: number;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface AICompletionResult {
  content: string;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, any>;
  }>;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AIProvider {
  // Returns the completion text, or '' if the provider has nothing to
  // return (e.g. NullProvider, or a real provider's own failure once it
  // catches its own error internally). ai.service.ts's functions
  // treat a missing/unparseable result as "fall back".
  generateCompletion(messages: AIMessage[], options?: AICompletionOptions): Promise<string>;

  generateWithTools?(
    messages: AIMessage[],
    tools: AIToolDefinition[],
    options?: AICompletionOptions
  ): Promise<AICompletionResult>;
}
