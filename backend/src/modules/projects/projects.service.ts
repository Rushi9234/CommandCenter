import { projectsRepository } from './projects.repository';
import { tasksRepository } from './tasks.repository';
import { usersRepository } from '../users/users.repository';
import { analyzeProjectWithAI } from '../ai/ai.service';
import { NotFoundError } from '../../common/errors';
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

  // Milestone 5: base gate (requireAccess + canAccessProject) moved to
  // projects.routes.ts.
  createTask(projectId: string, body: any, userId: string) {
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

  async getProjectTasks(projectId: string) {
    const tasks = await tasksRepository.getProjectTasks(projectId);

    return Promise.all(
      tasks.map(async (task: any) => {
        const ownerUser = task.owner ? await usersRepository.getUserById(task.owner) : null;
        const contributorUsers = await Promise.all(
          task.contributors.map(async (id: string) => {
            const user = await usersRepository.getUserById(id);
            return user ? { user_id: user.user_id, username: user.username, full_name: user.full_name } : null;
          })
        );
        const reviewerUser = task.reviewer ? await usersRepository.getUserById(task.reviewer) : null;
        const dependencyTasks = await Promise.all(
          task.dependencies.map(async (id: string) => {
            const depTask = await tasksRepository.getTask(id);
            return depTask ? { task_id: depTask.task_id, title: depTask.title, status: depTask.status } : null;
          })
        );

        return {
          ...task,
          owner_user: ownerUser
            ? { user_id: ownerUser.user_id, username: ownerUser.username, full_name: ownerUser.full_name }
            : null,
          contributor_users: contributorUsers.filter((u) => u !== null),
          reviewer_user: reviewerUser
            ? { user_id: reviewerUser.user_id, username: reviewerUser.username, full_name: reviewerUser.full_name }
            : null,
          dependency_tasks: dependencyTasks.filter((t) => t !== null),
        };
      })
    );
  }

  // Milestone 5: base gate (requireAccess + tasksRepository.canAccessTask)
  // moved to projects.routes.ts. Previously had no check of any kind.
  updateTask(taskId: string, updates: Record<string, any>) {
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
