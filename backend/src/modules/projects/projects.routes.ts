import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../common/middleware/asyncHandler';
import { validate } from '../../common/middleware/validate';
import { requireAccess } from '../../common/middleware/requireAccess';
import { requireTeamRoleIfSpecified, teamIdFromBody } from '../../common/middleware/requireTeamRole';
import { projectsRepository } from './projects.repository';
import { tasksRepository } from './tasks.repository';
import { teamsRepository } from '../teams/teams.repository';
import * as projectsController from './projects.controller';
import { createProjectSchema, analyzeProjectSchema, createTaskSchema, updateProjectSchema, updateTaskSchema } from './projects.dto';

// Milestone 5 review: viewer is documented as read-only, so it's excluded
// from the create-project allowlist (canWriteProject/canWriteTask below
// apply the same exclusion to update/delete).
const WRITE_ROLES = ['owner', 'admin', 'manager', 'member'];

// Mounted at the API root -- mirrors the original flat path list, which mixes
// /projects/* and /tasks/* and /teams/:teamId/projects under one controller.
const router = Router();

router.get('/projects/public', authenticate, asyncHandler(projectsController.getAllPublicProjects));
router.get('/projects/:projectId/details', authenticate, asyncHandler(projectsController.getProjectDetails));

// If the caller names a teamId, they must actually belong to it -- no check
// existed before, so any authenticated user could insert a project into a
// team they don't belong to just by putting that team's ID in the body.
router.post(
  '/projects',
  authenticate,
  validate(createProjectSchema),
  requireTeamRoleIfSpecified(teamIdFromBody, WRITE_ROLES),
  asyncHandler(projectsController.createProject)
);

router.get('/projects/my', authenticate, asyncHandler(projectsController.getMyProjects));

router.get(
  '/teams/:teamId/projects',
  authenticate,
  requireAccess((req) => teamsRepository.canAccessTeam(req.user!.userId, req.params.teamId), 'Access denied to this team'),
  asyncHandler(projectsController.getTeamProjects)
);

router.put(
  '/projects/:projectId',
  authenticate,
  requireAccess((req) => projectsRepository.canWriteProject(req.user!.userId, req.params.projectId), 'Access denied to this project'),
  validate(updateProjectSchema),
  asyncHandler(projectsController.updateProject)
);

// Delete keeps its narrower rule -- creator only, not "any team member".
router.delete(
  '/projects/:projectId',
  authenticate,
  requireAccess((req) => projectsRepository.isProjectCreator(req.user!.userId, req.params.projectId), 'Only project creator can delete'),
  asyncHandler(projectsController.deleteProject)
);

router.post('/projects/analyze', authenticate, validate(analyzeProjectSchema), asyncHandler(projectsController.analyzeProject));

router.post(
  '/projects/:projectId/tasks',
  authenticate,
  requireAccess((req) => projectsRepository.canWriteProject(req.user!.userId, req.params.projectId), 'Access denied to this project'),
  validate(createTaskSchema),
  asyncHandler(projectsController.createTask)
);

router.get(
  '/projects/:projectId/tasks',
  authenticate,
  requireAccess((req) => projectsRepository.canAccessProject(req.user!.userId, req.params.projectId), 'Access denied to this project'),
  asyncHandler(projectsController.getProjectTasks)
);

// Previously unprotected -- any authenticated user could update or delete
// any task by ID with no ownership/membership check at all.
router.put(
  '/tasks/:taskId',
  authenticate,
  requireAccess((req) => tasksRepository.canWriteTask(req.user!.userId, req.params.taskId), 'Access denied to this task'),
  validate(updateTaskSchema),
  asyncHandler(projectsController.updateTask)
);
router.delete(
  '/tasks/:taskId',
  authenticate,
  requireAccess((req) => tasksRepository.canWriteTask(req.user!.userId, req.params.taskId), 'Access denied to this task'),
  asyncHandler(projectsController.deleteTask)
);

router.get('/tasks/my', authenticate, asyncHandler(projectsController.getMyTasks));

export default router;
