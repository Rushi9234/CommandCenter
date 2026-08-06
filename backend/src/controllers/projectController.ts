import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { dbService } from '../services/databaseService';
import { analyzeProjectWithAI } from '../services/aiService';

export const getAllPublicProjects = async (req: AuthRequest, res: Response) => {
  try {
    const projects = await dbService.getAllPublicProjects();
    
    const publicProjects = projects
      .filter((p: any) => p.is_public)
      .map((p: any) => ({
        project_id: p.project_id,
        project_name: p.project_name,
        status: p.status,
        priority: p.priority,
        team_id: p.team_id,
        created_at: p.created_at,
      }));

    res.json({
      success: true,
      data: publicProjects,
    });
  } catch (error: any) {
    console.error('Get public projects error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

export const getProjectDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.userId;

    const project = await dbService.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const canAccess = await dbService.canAccessProject(userId, projectId);
    
    if (!canAccess) {
      return res.json({
        success: true,
        data: {
          project_id: project.project_id,
          project_name: project.project_name,
          status: project.status,
          priority: project.priority,
          is_public: project.is_public,
          access_denied: true,
          message: 'Request access from team admin to view details',
        },
      });
    }

    res.json({
      success: true,
      data: {
        ...project,
        access_denied: false,
      },
    });
  } catch (error: any) {
    console.error('Get project details error:', error);
    res.status(500).json({ error: 'Failed to fetch project details' });
  }
};

export const createProject = async (req: AuthRequest, res: Response) => {
  try {
    const { projectName, description, teamId, priority, deadline, isPublic } = req.body;
    const userId = req.user!.userId;

    if (!projectName) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const project = await dbService.createProject({
      project_name: projectName,
      description: description || '',
      created_by: userId,
      team_id: teamId,
      priority: priority || 'medium',
      deadline: deadline ? new Date(deadline) : undefined,
      is_public: isPublic !== false
    });

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: project,
    });
  } catch (error: any) {
    console.error('Create project error:', error);
    res.status(400).json({ error: error.message || 'Failed to create project' });
  }
};

export const getMyProjects = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const projects = await dbService.getUserProjects(userId);

    res.json({
      success: true,
      data: projects,
    });
  } catch (error: any) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

export const getTeamProjects = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.params;
    const userId = req.user!.userId;

    const canAccess = await dbService.canAccessTeam(userId, teamId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied to this team' });
    }

    const projects = await dbService.getTeamProjects(teamId);

    res.json({
      success: true,
      data: projects,
    });
  } catch (error: any) {
    console.error('Get team projects error:', error);
    res.status(500).json({ error: 'Failed to fetch team projects' });
  }
};

export const updateProject = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const updates = req.body;
    const userId = req.user!.userId;

    const canAccess = await dbService.canAccessProject(userId, projectId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    const project = await dbService.updateProject(projectId, updates);

    res.json({
      success: true,
      message: 'Project updated successfully',
      data: project,
    });
  } catch (error: any) {
    console.error('Update project error:', error);
    res.status(400).json({ error: error.message || 'Failed to update project' });
  }
};

export const deleteProject = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.userId;

    const project = await dbService.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.created_by !== userId) {
      return res.status(403).json({ error: 'Only project creator can delete' });
    }

    await dbService.deleteProject(projectId);

    res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete project error:', error);
    res.status(400).json({ error: 'Failed to delete project' });
  }
};

export const analyzeProject = async (req: AuthRequest, res: Response) => {
  try {
    const { projectName, description, requirements } = req.body;

    if (!projectName || !description) {
      return res.status(400).json({ error: 'Project name and description are required' });
    }

    const analysis = await analyzeProjectWithAI(projectName, description, requirements);

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error: any) {
    console.error('Analyze project error:', error);
    res.status(500).json({ error: 'Failed to analyze project' });
  }
};

export const createTask = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { title, description, owner, contributors, reviewer, dependencies, priority } = req.body;
    const userId = req.user!.userId;

    if (!title) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const canAccess = await dbService.canAccessProject(userId, projectId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    const task = await dbService.createTask({
      project_id: projectId,
      title,
      description: description || '',
      owner: owner,
      contributors: contributors || [],
      reviewer: reviewer,
      dependencies: dependencies || [],
      priority: priority || 'medium',
      created_by: userId
    });

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: task,
    });
  } catch (error: any) {
    console.error('Create task error:', error);
    res.status(400).json({ error: error.message || 'Failed to create task' });
  }
};

export const getProjectTasks = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.userId;

    const canAccess = await dbService.canAccessProject(userId, projectId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    const tasks = await dbService.getProjectTasks(projectId);

    const tasksWithUsers = await Promise.all(
      tasks.map(async (task) => {
        const ownerUser = task.owner ? await dbService.getUserById(task.owner) : null;
        const contributorUsers = await Promise.all(
          task.contributors.map(async (id) => {
            const user = await dbService.getUserById(id);
            return user ? { user_id: user.user_id, username: user.username, full_name: user.full_name } : null;
          })
        );
        const reviewerUser = task.reviewer ? await dbService.getUserById(task.reviewer) : null;
        const dependencyTasks = await Promise.all(
          task.dependencies.map(async (id) => {
            const depTask = await dbService.getTask(id);
            return depTask ? { task_id: depTask.task_id, title: depTask.title, status: depTask.status } : null;
          })
        );

        return {
          ...task,
          owner_user: ownerUser ? {
            user_id: ownerUser.user_id,
            username: ownerUser.username,
            full_name: ownerUser.full_name,
          } : null,
          contributor_users: contributorUsers.filter(u => u !== null),
          reviewer_user: reviewerUser ? {
            user_id: reviewerUser.user_id,
            username: reviewerUser.username,
            full_name: reviewerUser.full_name,
          } : null,
          dependency_tasks: dependencyTasks.filter(t => t !== null),
        };
      })
    );

    res.json({
      success: true,
      data: tasksWithUsers,
    });
  } catch (error: any) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
};

export const updateTask = async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;
    const updates = req.body;

    const task = await dbService.updateTask(taskId, updates);

    res.json({
      success: true,
      message: 'Task updated successfully',
      data: task,
    });
  } catch (error: any) {
    console.error('Update task error:', error);
    res.status(400).json({ error: error.message || 'Failed to update task' });
  }
};

export const deleteTask = async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;
    await dbService.deleteTask(taskId);

    res.json({
      success: true,
      message: 'Task deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete task error:', error);
    res.status(400).json({ error: 'Failed to delete task' });
  }
};

export const getMyTasks = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const tasks = await dbService.getUserTasks(userId);

    res.json({
      success: true,
      data: tasks,
    });
  } catch (error: any) {
    console.error('Get my tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
};
