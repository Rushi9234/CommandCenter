import { AIToolHandler, AIToolContext, aiToolRegistry } from './aiToolRegistry';
import { tasksRepository } from '../../projects/tasks.repository';
import { logsRepository } from '../../logs/logs.repository';
import { privacyService } from '../../privacy/privacy.service';
import { maskPII } from '../privacy-config';

export const getMyTasksTool: AIToolHandler<{ status?: string }> = {
  name: 'getMyTasks',
  description: 'Retrieve tasks assigned to or owned by the authenticated caller.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] },
    },
  },
  async authorize(ctx: AIToolContext): Promise<boolean> {
    if (!ctx.callerUserId) return false;
    return privacyService.isAiEnabledForUser(ctx.callerUserId);
  },
  async execute(ctx: AIToolContext, input: { status?: string }) {
    // Force callerUserId — ignore any client-supplied userId
    const userTasks = await tasksRepository.getUserTasks(ctx.callerUserId);
    let filtered = userTasks;
    if (input.status) {
      filtered = userTasks.filter((t: any) => t.status === input.status);
    }
    return filtered.slice(0, 20).map((t: any) => ({
      task_id: t.task_id,
      project_id: t.project_id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      deadline: t.deadline || null,
      project_name: t.project_name || 'Project',
    }));
  },
};

export const getMyWorkLogsTool: AIToolHandler<{ limit?: number }> = {
  name: 'getMyWorkLogs',
  description: 'Retrieve personal daily work logs for the authenticated caller.',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Number of logs to retrieve (max 14)' },
    },
  },
  async authorize(ctx: AIToolContext): Promise<boolean> {
    if (!ctx.callerUserId) return false;
    return privacyService.isAiEnabledForUser(ctx.callerUserId);
  },
  async execute(ctx: AIToolContext, input: { limit?: number }) {
    // Force callerUserId — ignore any client-supplied userId
    const userLogs = await logsRepository.getUserLogs(ctx.callerUserId);
    const maxLimit = Math.min(input.limit || 14, 14);
    return userLogs.slice(0, maxLimit).map((l: any) => ({
      log_id: l.log_id,
      log_date: l.log_date,
      summary: maskPII(l.entry_summary || l.entry_text || ''),
      bullet_points: (l.bullet_points || []).map((b: string) => maskPII(b)),
    }));
  },
};

export const getPersonalAttentionItemsTool: AIToolHandler<{}> = {
  name: 'getPersonalAttentionItems',
  description: 'Retrieve overdue tasks, high-priority work items, and assigned blockers across all authorized workspaces for the caller.',
  parameters: {
    type: 'object',
    properties: {},
  },
  async authorize(ctx: AIToolContext): Promise<boolean> {
    if (!ctx.callerUserId) return false;
    return privacyService.isAiEnabledForUser(ctx.callerUserId);
  },
  async execute(ctx: AIToolContext) {
    // Aggregates caller's overdue tasks, high-priority work, and assigned blockers across all authorized workspaces
    const userTasks = await tasksRepository.getUserTasks(ctx.callerUserId);

    const now = new Date();
    const overdueTasks = userTasks.filter((t: any) => {
      if (t.status === 'done' || t.status === 'completed') return false;
      if (!t.deadline) return false;
      return new Date(t.deadline) < now;
    });

    const highPriorityTasks = userTasks.filter((t: any) => {
      if (t.status === 'done' || t.status === 'completed') return false;
      return t.priority === 'high' || t.priority === 'urgent';
    });

    return {
      overdue_tasks: overdueTasks.slice(0, 5).map((t: any) => ({
        task_id: t.task_id,
        project_id: t.project_id,
        title: maskPII(t.title || ''),
        status: t.status || 'todo',
        priority: t.priority || 'medium',
        deadline: t.deadline || null,
        project_name: maskPII(t.project_name || 'Project'),
      })),
      high_priority_tasks: highPriorityTasks.slice(0, 5).map((t: any) => ({
        task_id: t.task_id,
        project_id: t.project_id,
        title: maskPII(t.title || ''),
        status: t.status || 'todo',
        priority: t.priority || 'high',
        deadline: t.deadline || null,
        project_name: maskPII(t.project_name || 'Project'),
      })),
    };
  },
};

aiToolRegistry.register(getMyTasksTool);
aiToolRegistry.register(getMyWorkLogsTool);
aiToolRegistry.register(getPersonalAttentionItemsTool);

