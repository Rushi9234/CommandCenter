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

export interface AIProvider {
  // Returns the completion text, or '' if the provider has nothing to
  // return (e.g. NullProvider, or a real provider's own failure once it
  // catches its own error internally). ai.service.ts's 8 functions
  // already treat a missing/unparseable result as "fall back" -- this
  // return type lets every provider reuse that existing logic instead of
  // each provider needing its own bespoke error contract.
  generateCompletion(messages: AIMessage[], options?: AICompletionOptions): Promise<string>;
}
