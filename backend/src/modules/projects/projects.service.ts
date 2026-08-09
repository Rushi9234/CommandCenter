import { projectsRepository } from './projects.repository';
import { tasksRepository } from './tasks.repository';
import { usersRepository } from '../users/users.repository';
import { analyzeProjectWithAI } from '../ai/ai.service';
import { NotFoundError, BadRequestError } from '../../common/errors';
import { privacyService, AI_DISABLED_MESSAGE } from '../privacy/privacy.service';

export class ProjectsService {
  async getAllPublicProjects() {
    const projects = await projectsRepository.getAllPublicProjects();

    return projects
      .filter((p: any) => p.is_public)
      .map((p: any) => ({
        project_id: p.project_id,
        project_name: p.project_name,
        status: p.status,
        priority: p.priority,
        team_id: p.team_id,
        created_at: p.created_at,
      }));
  }

  async getProjectDetails(projectId: string, userId: string) {
    const project = await projectsRepository.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const canAccess = await projectsRepository.canAccessProject(userId, projectId);

    if (!canAccess) {
      return {
        project_id: project.project_id,
        project_name: project.project_name,
        status: project.status,
        priority: project.priority,
        is_public: project.is_public,
        access_denied: true,
        message: 'Request access from team admin to view details',
      };
    }

    return { ...project, access_denied: false };
  }

  createProject(userId: string, body: any) {
    return projectsRepository.createProject({
      project_name: body.projectName,
      description: body.description || '',
      created_by: userId,
      team_id: body.teamId,
      priority: body.priority || 'medium',
      deadline: body.deadline ? new Date(body.deadline) : undefined,
      is_public: body.isPublic !== false,
    });
  }

  getMyProjects(userId: string) {
    return projectsRepository.getUserProjects(userId);
  }

  // Milestone 5: base gate (requireAccess + teamsRepository.canAccessTeam)
  // moved to projects.routes.ts.
  getTeamProjects(teamId: string) {
    return projectsRepository.getTeamProjects(teamId);
  }

  // Milestone 5: base gate (requireAccess + canAccessProject) moved to
  // projects.routes.ts.
  updateProject(projectId: string, updates: Record<string, any>) {
    return projectsRepository.updateProject(projectId, updates);
  }

  // Milestone 5: base gate (requireAccess + isProjectCreator) moved to
  // projects.routes.ts.
  async deleteProject(projectId: string) {
    await projectsRepository.deleteProject(projectId);
  }

  async analyzeProject(userId: string, projectName: string, description: string, requirements?: string) {
    const aiEnabled = await privacyService.isAiEnabledForUser(userId);
    if (!aiEnabled) {
      return {
        suggested_tasks: [],
        tech_stack: [],
        risks: [],
        timeline_estimate: AI_DISABLED_MESSAGE,
        team_size_recommendation: 0,
      };
    }

    return analyzeProjectWithAI(projectName, description, requirements);
  }

  // Milestone 39: owner/reviewer/contributors/dependencies had no
  // validation beyond UUID *shape* (Milestone 35) -- any well-formed UUID
  // was accepted regardless of whether it belonged to a real user, a
  // team member of this project, or (for dependencies) a task in this
  // same project at all. Reuses canAccessProject exactly as it already
  // gates the caller's own access to the project -- the same rule now
  // also gates who can be REFERENCED by it, rather than inventing a
  // separate membership model. A nonexistent/random UUID can never match
  // canAccessProject's own existence-implying join, so this closes
  // existence and membership in the one check.
  private async validateTaskReferences(projectId: string, updates: Record<string, any>, currentTaskId?: string) {
    const referencedUserIds = [updates.owner, updates.reviewer, ...(updates.contributors || [])].filter(Boolean);

    for (const targetUserId of referencedUserIds) {
      const isMember = await projectsRepository.canAccessProject(targetUserId, projectId);
      if (!isMember) {
        throw new BadRequestError('owner/reviewer/contributors must be members of this project\'s team');
      }
    }

    if (updates.dependencies && updates.dependencies.length > 0) {
      if (currentTaskId && updates.dependencies.includes(currentTaskId)) {
        throw new BadRequestError('A task cannot depend on itself');
      }

      const allInProject = await tasksRepository.tasksExistInProject(updates.dependencies, projectId);
      if (!allInProject) {
        throw new BadRequestError('dependencies must reference existing tasks in the same project');
      }
    }
  }

  // Milestone 5: base gate (requireAccess + canAccessProject) moved to
  // projects.routes.ts.
  async createTask(projectId: string, body: any, userId: string) {
    await this.validateTaskReferences(projectId, body);

    return tasksRepository.createTask({
      project_id: projectId,
      title: body.title,
      description: body.description || '',
      owner: body.owner,
      contributors: body.contributors || [],
      reviewer: body.reviewer,
      dependencies: body.dependencies || [],
      priority: body.priority || 'medium',
      created_by: userId,
    });
  }

  // Milestone 42: used to fetch each task's owner/reviewer/contributors/
  // dependencies with its own per-ID SELECT inside a per-task Promise.all
  // -- for a project with N tasks (nothing caps N) each carrying up to 50
  // contributors + 50 dependencies (M40's per-task cap), that's up to
  // ~102N DB round trips for one GET. Any team member with ordinary write
  // access could create many tasks and turn every subsequent read of the
  // list into an increasingly expensive query, with no cap on N to stop
  // it. Replaced with exactly two bulk ANY($1) queries (all referenced
  // users, all referenced tasks) regardless of how many tasks/references
  // exist, then joined in memory -- same output shape, O(1) round trips
  // instead of O(N).
  async getProjectTasks(projectId: string) {
    const tasks = await tasksRepository.getProjectTasks(projectId);

    const userIds = new Set<string>();
    const dependencyIds = new Set<string>();
    for (const task of tasks) {
      if (task.owner) userIds.add(task.owner);
      if (task.reviewer) userIds.add(task.reviewer);
      for (const id of task.contributors) userIds.add(id);
      for (const id of task.dependencies) dependencyIds.add(id);
    }

    const [users, dependencyTasks] = await Promise.all([
      usersRepository.getUsersByIds(Array.from(userIds)),
      tasksRepository.getTasksByIds(Array.from(dependencyIds)),
    ]);

    const userById = new Map(users.map((u: any) => [u.user_id, u]));
    const taskById = new Map(dependencyTasks.map((t: any) => [t.task_id, t]));

    const toPublicUser = (id: string | null) => {
      const user = id ? userById.get(id) : null;
      return user ? { user_id: user.user_id, username: user.username, full_name: user.full_name } : null;
    };

    return tasks.map((task: any) => ({
      ...task,
      owner_user: toPublicUser(task.owner),
      contributor_users: task.contributors.map(toPublicUser).filter((u: any) => u !== null),
      reviewer_user: toPublicUser(task.reviewer),
      dependency_tasks: task.dependencies
        .map((id: string) => taskById.get(id))
        .filter((t: any) => t !== undefined)
        .map((t: any) => ({ task_id: t.task_id, title: t.title, status: t.status })),
    }));
  }

  // Milestone 5: base gate (requireAccess + tasksRepository.canAccessTask)
  // moved to projects.routes.ts. Previously had no check of any kind.
  // Milestone 35: completed_at is not client-writable (excluded from
  // updateTaskSchema) -- derived here instead, so a task can never end up
  // "done" with no completion timestamp, or reopened while still carrying
  // a stale one.
  // Milestone 39: same reference validation as createTask, applied to
  // whichever of owner/reviewer/contributors/dependencies the update
  // actually touches -- the task's own project_id has to be looked up
  // first since, unlike createTask, the route only carries a taskId.
  async updateTask(taskId: string, updates: Record<string, any>) {
    const task = await tasksRepository.getTask(taskId);
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    await this.validateTaskReferences(task.project_id, updates, taskId);

    if (updates.status === 'done') {
      updates.completed_at = new Date();
    } else if (updates.status) {
      updates.completed_at = null;
    }

    return tasksRepository.updateTask(taskId, updates);
  }

  async deleteTask(taskId: string) {
    await tasksRepository.deleteTask(taskId);
  }

  getMyTasks(userId: string) {
    return tasksRepository.getUserTasks(userId);
  }
}

export const projectsService = new ProjectsService();
