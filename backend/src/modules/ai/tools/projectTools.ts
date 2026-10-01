import { AIToolHandler, AIToolContext, aiToolRegistry } from './aiToolRegistry';
import { projectsRepository } from '../../projects/projects.repository';
import { tasksRepository } from '../../projects/tasks.repository';
import { blockersRepository } from '../../blockers/blockers.repository';
import { privacyService } from '../../privacy/privacy.service';
import { maskPII } from '../privacy-config';

export const getProjectSummaryTool: AIToolHandler<{ projectId: string }> = {
  name: 'getProjectSummary',
  description: 'Retrieve status, task completion progress, active blockers, high-priority tasks, and attention items for a project.',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'UUID of the target project' },
    },
    required: ['projectId'],
  },
  async authorize(ctx: AIToolContext, input: { projectId: string }): Promise<boolean> {
    if (!ctx.callerUserId || !input || !input.projectId) return false;
    const aiEnabled = await privacyService.isAiEnabledForUser(ctx.callerUserId);
    if (!aiEnabled) return false;

    return projectsRepository.canAccessProject(ctx.callerUserId, input.projectId);
  },
  async execute(ctx: AIToolContext, input: { projectId: string }) {
    const project = await projectsRepository.getProject(input.projectId);
    if (!project) {
      return {
        status: 'not_found',
        assigned_tasks: 0,
        completed_tasks: 0,
        active_blockers_count: 0,
        high_priority_tasks: [],
      };
    }

    const tasks = await tasksRepository.getProjectTasks(input.projectId);
    const assignedTasks = tasks.length;
    const completedTasks = tasks.filter(
      (t: any) => t.status === 'done' || t.status === 'completed'
    ).length;
    const completionRate = assignedTasks > 0 ? Math.round((completedTasks / assignedTasks) * 100) : 0;

    const highPriorityTasks = tasks
      .filter(
        (t: any) =>
          (t.priority === 'high' || t.priority === 'urgent') &&
          t.status !== 'done' &&
          t.status !== 'completed'
      )
      .slice(0, 5)
      .map((t: any) => ({
        task_id: t.task_id,
        project_id: project.project_id,
        title: maskPII(t.title || ''),
        status: t.status || 'todo',
        priority: t.priority || 'high',
      }));

    let activeBlockersCount = 0;
    let activeBlockers: Array<{ title: string; urgency: string }> = [];
    if (project.team_id) {
      const teamBlockers = await blockersRepository.getTeamBlockers(project.team_id);
      const openBlockers = teamBlockers.filter((b: any) => b.status !== 'resolved');
      activeBlockersCount = openBlockers.length;
      activeBlockers = openBlockers.slice(0, 5).map((b: any) => ({
        title: maskPII(b.title || ''),
        urgency: b.urgency || 'medium',
      }));
    }

    return {
      project_id: project.project_id,
      project_name: maskPII(project.project_name || ''),
      status: project.status || 'active',
      priority: project.priority || 'medium',
      task_counts: {
        assigned: assignedTasks,
        completed: completedTasks,
        completion_rate_pct: completionRate,
      },
      active_blockers_count: activeBlockersCount,
      active_blockers: activeBlockers,
      high_priority_tasks: highPriorityTasks,
    };
  },
};

aiToolRegistry.register(getProjectSummaryTool);
