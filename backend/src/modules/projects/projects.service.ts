import { projectsRepository } from './projects.repository';
import { tasksRepository } from './tasks.repository';
import { usersRepository } from '../users/users.repository';
import { analyzeProjectWithAI } from '../ai/ai.service';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../common/errors';
import { privacyService, AI_DISABLED_MESSAGE } from '../privacy/privacy.service';
import { notificationsService } from '../notifications/notifications.service';
import { createRealtimeEvent, realtimeProvider } from '../../realtime/inMemoryRealtimeProvider';

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

  // Privacy fix (Projects UX + reliability pass): a non-member used to get
  // a "soft-denied" 200 response carrying project_name/status/priority/
  // is_public for ANY project ID, private or not -- a real info leak, not
  // just an incomplete payload, since it confirmed the project's existence
  // and identity to a caller with no access to it. A PUBLIC project's
  // summary fields are still returned here: GET /projects/public already
  // exposes the exact same fields for every public project to any
  // authenticated user by design (getAllPublicProjects below), so this
  // isn't a new exposure, only privacy -- not discoverability -- is being
  // closed. A genuinely private project now gets a hard 403, matching how
  // canWriteProject/isProjectCreator are enforced everywhere else in this
  // module, instead of a degraded-but-still-informative 200.
  async getProjectDetails(projectId: string, userId: string) {
    const project = await projectsRepository.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const canAccess = await projectsRepository.canAccessProject(userId, projectId);
    if (canAccess) {
      return { ...project, access_denied: false };
    }

    if (project.is_public) {
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

    throw new ForbiddenError('Access denied to this project');
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

    const task = await tasksRepository.createTask({
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

    await this.notifyTaskAssignmentChanges(task, { owner: null, reviewer: null, contributors: [] }, userId);

    // Publish realtime event for task creation. The event carries only the
    // project_id so subscribers can refetch the authoritative task list;
    // the full task data (including assignments) is fetched server-side.
    const project = await projectsRepository.getProject(projectId);
    if (project) {
      realtimeProvider.publish(createRealtimeEvent('task.created', { teamId: project.team_id }));
    }

    return task;
  }

  // Shared by createTask (previous = always empty/null -- any assignment
  // is new) and updateTask (previous = the pre-update row) so both call
  // sites use identical "did this assignment actually change" logic
  // rather than two subtly different implementations. Diffing is
  // necessary here: neither the create nor the update payload alone says
  // "this is a NEW assignment" vs "resent the same value" -- confirmed
  // during this feature's own audit that no such signal exists upstream.
  private async notifyTaskAssignmentChanges(
    task: { task_id: string; project_id: string; title: string },
    previous: { owner: string | null; reviewer: string | null; contributors: string[] },
    actorUserId: string
  ) {
    const project = await projectsRepository.getProject(task.project_id);
    const teamId = project?.team_id;

    const notifyIfNew = async (role: 'owner' | 'reviewer', newUserId: string | null | undefined, previousUserId: string | null) => {
      if (!newUserId || newUserId === previousUserId || newUserId === actorUserId) return;
      await notificationsService.notifyUser({
        recipientUserId: newUserId,
        category: `task.${role}_assigned`,
        preferenceGroup: 'task_assignment',
        title: role === 'owner' ? 'Task assigned to you' : 'You were assigned as reviewer',
        message: role === 'owner' ? `You were assigned as owner of "${task.title}"` : `You were assigned as reviewer of "${task.title}"`,
        taskId: task.task_id,
        projectId: task.project_id,
        teamId,
      });
    };

    await notifyIfNew('owner', (task as any).owner, previous.owner);
    await notifyIfNew('reviewer', (task as any).reviewer, previous.reviewer);

    const newContributors: string[] = Array.isArray((task as any).contributors) ? (task as any).contributors : [];
    const addedContributors = newContributors.filter((id) => !previous.contributors.includes(id) && id !== actorUserId);
    await Promise.all(
      addedContributors.map((recipientUserId) =>
        notificationsService.notifyUser({
          recipientUserId,
          category: 'task.contributor_assigned',
          preferenceGroup: 'task_assignment',
          title: 'You were added as a contributor',
          message: `You were added as a contributor on "${task.title}"`,
          taskId: task.task_id,
          projectId: task.project_id,
          teamId,
        })
      )
    );
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
  async updateTask(taskId: string, updates: Record<string, any>, userId?: string) {
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

    const updated = await tasksRepository.updateTask(taskId, updates);

    if (userId && updated) {
      await this.notifyTaskAssignmentChanges(
        updated,
        {
          owner: task.owner ?? null,
          reviewer: task.reviewer ?? null,
          contributors: Array.isArray(task.contributors) ? task.contributors : [],
        },
        userId
      );

      // Publish realtime event if status changed. Assignment events are
      // published via notifyTaskAssignmentChanges (which triggers
      // notification.created events), so we only emit this separate event
      // for status changes to avoid redundant updates.
      if (updates.status && task.status !== updates.status) {
        const project = await projectsRepository.getProject(task.project_id);
        if (project) {
          realtimeProvider.publish(createRealtimeEvent('task.status_changed', { teamId: project.team_id }));
        }
      }
    }

    return updated;
  }

  async deleteTask(taskId: string) {
    // Capture the task's project before deletion so we can publish the
    // realtime event afterward (the entity reference will be gone after
    // delete, but the notification/event delivery still needs the teamId
    // to route to the correct subscribers).
    const task = await tasksRepository.getTask(taskId);
    await tasksRepository.deleteTask(taskId);

    if (task) {
      const project = await projectsRepository.getProject(task.project_id);
      if (project) {
        realtimeProvider.publish(createRealtimeEvent('task.deleted', { teamId: project.team_id }));
      }
    }
  }

  getMyTasks(userId: string) {
    return tasksRepository.getUserTasks(userId);
  }
}

export const projectsService = new ProjectsService();
