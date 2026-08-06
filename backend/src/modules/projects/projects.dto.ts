import { z } from 'zod';
import { requiredString } from '../../common/dto-helpers';

export const createProjectSchema = z.object({
  projectName: requiredString('Project name is required'),
  description: z.string().optional(),
  teamId: z.string().optional(),
  priority: z.string().optional(),
  deadline: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export const analyzeProjectSchema = z.object({
  projectName: requiredString('Project name and description are required'),
  description: requiredString('Project name and description are required'),
  requirements: z.string().optional(),
});

export const createTaskSchema = z.object({
  title: requiredString('Task title is required'),
  description: z.string().optional(),
  owner: z.string().optional(),
  contributors: z.array(z.string()).optional(),
  reviewer: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  priority: z.string().optional(),
});

export const updateProjectSchema = z.record(z.string(), z.any());
export const updateTaskSchema = z.record(z.string(), z.any());
