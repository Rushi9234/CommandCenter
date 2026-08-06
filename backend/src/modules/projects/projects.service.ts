import { projectsRepository } from './projects.repository';
import { tasksRepository } from './tasks.repository';
import { teamsRepository } from '../teams/teams.repository';
import { usersRepository } from '../users/users.repository';
import { analyzeProjectWithAI } from '../ai/ai.service';
import { ForbiddenError, NotFoundError } from '../../common/errors';

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

  async getTeamProjects(teamId: string, userId: string) {
    const canAccess = await teamsRepository.canAccessTeam(userId, teamId);
    if (!canAccess) {
      throw new ForbiddenError('Access denied to this team');
    }
    return projectsRepository.getTeamProjects(teamId);
  }

  async updateProject(projectId: string, updates: Record<string, any>, userId: string) {
    const canAccess = await projectsRepository.canAccessProject(userId, projectId);
    if (!canAccess) {
      throw new ForbiddenError('Access denied to this project');
    }
    return projectsRepository.updateProject(projectId, updates);
  }

  async deleteProject(projectId: string, userId: string) {
    const project = await projectsRepository.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.created_by !== userId) {
      throw new ForbiddenError('Only project creator can delete');
    }
    await projectsRepository.deleteProject(projectId);
  }

  analyzeProject(projectName: string, description: string, requirements?: string) {
    return analyzeProjectWithAI(projectName, description, requirements);
  }

  async createTask(projectId: string, body: any, userId: string) {
    const canAccess = await projectsRepository.canAccessProject(userId, projectId);
    if (!canAccess) {
      throw new ForbiddenError('Access denied to this project');
    }

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

  async getProjectTasks(projectId: string, userId: string) {
    const canAccess = await projectsRepository.canAccessProject(userId, projectId);
    if (!canAccess) {
      throw new ForbiddenError('Access denied to this project');
    }

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
