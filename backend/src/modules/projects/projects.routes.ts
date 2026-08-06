import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate } from '../../common/middleware/validate';
import * as projectsController from './projects.controller';
import {
  createProjectSchema,
  analyzeProjectSchema,
  createTaskSchema,
  updateProjectSchema,
  updateTaskSchema,
} from './projects.dto';

// Mounted at the API root -- mirrors the original flat path list, which mixes
// /projects/* and /tasks/* and /teams/:teamId/projects under one controller.
const router = Router();

router.get('/projects/public', authenticate, asyncHandler(projectsController.getAllPublicProjects));
router.get('/projects/:projectId/details', authenticate, asyncHandler(projectsController.getProjectDetails));
router.post('/projects', authenticate, validate(createProjectSchema), asyncHandler(projectsController.createProject));
router.get('/projects/my', authenticate, asyncHandler(projectsController.getMyProjects));
router.get('/teams/:teamId/projects', authenticate, asyncHandler(projectsController.getTeamProjects));
router.put('/projects/:projectId', authenticate, validate(updateProjectSchema), asyncHandler(projectsController.updateProject));
router.delete('/projects/:projectId', authenticate, asyncHandler(projectsController.deleteProject));
router.post('/projects/analyze', authenticate, validate(analyzeProjectSchema), asyncHandler(projectsController.analyzeProject));
router.post('/projects/:projectId/tasks', authenticate, validate(createTaskSchema), asyncHandler(projectsController.createTask));
router.get('/projects/:projectId/tasks', authenticate, asyncHandler(projectsController.getProjectTasks));
router.put('/tasks/:taskId', authenticate, validate(updateTaskSchema), asyncHandler(projectsController.updateTask));
router.delete('/tasks/:taskId', authenticate, asyncHandler(projectsController.deleteTask));
router.get('/tasks/my', authenticate, asyncHandler(projectsController.getMyTasks));

export default router;
