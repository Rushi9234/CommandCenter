import { AIProvider, AIMessage, AICompletionOptions } from './aiProvider.interface';

// AI_PROVIDER=none: makes no external request at all. Returns '' --
// every one of ai.service.ts's 8 functions already treats a missing or
// unparseable completion as "use the fallback" (either via a falsy-string
// check like `content || 'fallback'`, or via a failed JSON-match that
// throws into their own catch block), so returning '' here reaches
// exactly the same fallback behavior each function already has, with no
// changes needed to ai.service.ts itself.
export class NullProvider implements AIProvider {
  async generateCompletion(_messages: AIMessage[], _options: AICompletionOptions = {}): Promise<string> {
    return '';
  }
}
