import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { ok, created } from '../../common/http/respond';
import { projectsService } from './projects.service';

export const getAllPublicProjects = async (req: AuthRequest, res: Response) => {
  const projects = await projectsService.getAllPublicProjects(req.user!.userId);
  ok(res, projects);
};

export const getProjectDetails = async (req: AuthRequest, res: Response) => {
  const details = await projectsService.getProjectDetails(req.params.projectId, req.user!.userId);
  ok(res, details);
};

export const createProject = async (req: AuthRequest, res: Response) => {
  const project = await projectsService.createProject(req.user!.userId, req.body);
  created(res, project, 'Project created successfully');
};

export const getMyProjects = async (req: AuthRequest, res: Response) => {
  const projects = await projectsService.getMyProjects(req.user!.userId);
  ok(res, projects);
};

export const getTeamProjects = async (req: AuthRequest, res: Response) => {
  const projects = await projectsService.getTeamProjects(req.params.teamId);
  ok(res, projects);
};

export const updateProject = async (req: AuthRequest, res: Response) => {
  const project = await projectsService.updateProject(req.params.projectId, req.body);
  ok(res, project, 'Project updated successfully');
};

export const deleteProject = async (req: AuthRequest, res: Response) => {
  await projectsService.deleteProject(req.params.projectId);
  ok(res, undefined, 'Project deleted successfully');
};

export const analyzeProject = async (req: AuthRequest, res: Response) => {
  const analysis = await projectsService.analyzeProject(req.user!.userId, req.body.projectName, req.body.description, req.body.requirements);
  ok(res, analysis);
};

export const createTask = async (req: AuthRequest, res: Response) => {
  const task = await projectsService.createTask(req.params.projectId, req.body, req.user!.userId);
  created(res, task, 'Task created successfully');
};

export const getProjectTasks = async (req: AuthRequest, res: Response) => {
  const tasks = await projectsService.getProjectTasks(req.params.projectId);
  ok(res, tasks);
};

export const updateTask = async (req: AuthRequest, res: Response) => {
  const task = await projectsService.updateTask(req.params.taskId, req.body, req.user!.userId);
  ok(res, task, 'Task updated successfully');
};

export const deleteTask = async (req: AuthRequest, res: Response) => {
  await projectsService.deleteTask(req.params.taskId, req.user!.userId);
  ok(res, undefined, 'Task deleted successfully');
};

export const getMyTasks = async (req: AuthRequest, res: Response) => {
  const tasks = await projectsService.getMyTasks(req.user!.userId);
  ok(res, tasks);
};

export const submitTaskForReview = async (req: AuthRequest, res: Response) => {
  const task = await projectsService.submitTaskForReview(req.params.taskId, req.user!.userId, req.body.notes);
  ok(res, task, 'Task submitted for review');
};

export const approveTask = async (req: AuthRequest, res: Response) => {
  const task = await projectsService.approveTask(req.params.taskId, req.user!.userId);
  ok(res, task, 'Task approved');
};

export const requestTaskChanges = async (req: AuthRequest, res: Response) => {
  const task = await projectsService.requestTaskChanges(req.params.taskId, req.user!.userId, req.body.reason);
  ok(res, task, 'Changes requested');
};

export const createBatchTeamTasks = async (req: AuthRequest, res: Response) => {
  const result = await projectsService.createBatchTeamTasks(req.params.classId, req.body, req.user!.userId);
  created(res, result, 'Batch team tasks assigned successfully');
};

export const searchClassroomMembers = async (req: AuthRequest, res: Response) => {
  const members = await projectsService.searchClassroomMembers(req.params.classId, (req.query.q as string) || '', req.user!.userId);
  ok(res, members);
};

export const requestCollaboration = async (req: AuthRequest, res: Response) => {
  const reqResult = await projectsService.requestCollaboration(req.params.projectId, req.user!.userId);
  created(res, reqResult, 'Collaboration request sent successfully');
};

export const acceptCollaboration = async (req: AuthRequest, res: Response) => {
  const updated = await projectsService.acceptCollaboration(req.params.projectId, req.params.targetUserId, req.user!.userId);
  ok(res, updated, 'Collaboration request accepted');
};

export const rejectCollaboration = async (req: AuthRequest, res: Response) => {
  const updated = await projectsService.rejectCollaboration(req.params.projectId, req.params.targetUserId, req.user!.userId);
  ok(res, updated, 'Collaboration request declined');
};

export const revokeCollaboration = async (req: AuthRequest, res: Response) => {
  const updated = await projectsService.revokeCollaboration(req.params.projectId, req.params.targetUserId, req.user!.userId);
  ok(res, updated, 'Collaboration access revoked');
};

export const getProjectCollaborators = async (req: AuthRequest, res: Response) => {
  const collaborators = await projectsService.getProjectCollaborators(req.params.projectId, req.user!.userId);
  ok(res, collaborators);
};
