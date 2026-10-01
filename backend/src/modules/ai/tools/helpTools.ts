import { AIToolHandler, AIToolContext, aiToolRegistry } from './aiToolRegistry';
import { searchHelpCenterDocs } from '../rag/helpRagService';
import { privacyService } from '../../privacy/privacy.service';

export const searchProductHelpTool: AIToolHandler<{ query: string }> = {
  name: 'searchProductHelp',
  description: 'Search static product documentation and help articles for feature information and FAQs.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search term or question about CommandCenter features' },
    },
    required: ['query'],
  },
  async authorize(ctx: AIToolContext): Promise<boolean> {
    if (!ctx.callerUserId) return false;
    return privacyService.isAiEnabledForUser(ctx.callerUserId);
  },
  async execute(ctx: AIToolContext, input: { query: string }) {
    const results = searchHelpCenterDocs(input.query || '', 3);
    return results.map((r) => ({
      title: r.title,
      content: r.content,
      sourceFile: r.sourceFile,
    }));
  },
};

aiToolRegistry.register(searchProductHelpTool);
