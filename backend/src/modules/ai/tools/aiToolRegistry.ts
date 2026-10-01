import { ForbiddenError } from '../../../common/errors';

export interface AIToolContext {
  callerUserId: string;
  scopeType?: 'global' | 'personal' | 'team' | 'class' | 'project';
  scopeId?: string;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface AIToolHandler<TInput = any, TOutput = any> {
  name: string;
  description: string;
  parameters: Record<string, any>;
  authorize(ctx: AIToolContext, input: TInput): Promise<boolean>;
  execute(ctx: AIToolContext, input: TInput): Promise<TOutput>;
}

class AIToolRegistry {
  private tools = new Map<string, AIToolHandler>();

  register(tool: AIToolHandler) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): AIToolHandler | undefined {
    return this.tools.get(name);
  }

  getDefinitions(): AIToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  async executeTool(name: string, ctx: AIToolContext, input: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Execution rejected: Tool '${name}' is not registered in the allowlisted tool registry.`);
    }

    const isAuthorized = await tool.authorize(ctx, input);
    if (!isAuthorized) {
      throw new ForbiddenError(`Authorization check failed for tool execution '${name}'.`);
    }

    return tool.execute(ctx, input);
  }
}

export const aiToolRegistry = new AIToolRegistry();
