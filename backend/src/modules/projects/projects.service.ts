import { projectsRepository } from './projects.repository';
import { tasksRepository } from './tasks.repository';
import { usersRepository } from '../users/users.repository';
import { teamsRepository } from '../teams/teams.repository';
import { analyzeProjectWithAI } from '../ai/ai.service';
import { NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '../../common/errors';
import { privacyService, AI_DISABLED_MESSAGE } from '../privacy/privacy.service';
import { notificationsService } from '../notifications/notifications.service';
import { createRealtimeEvent, realtimeProvider } from '../../realtime/inMemoryRealtimeProvider';
import { workStateHistoryService } from '../workStateHistory/workStateHistory.service';
import { goalsRepository } from '../goals/goals.repository';

export class ProjectsService {
  async getAllPublicProjects(userId?: string) {
    const projects = await projectsRepository.getAllPublicProjects(userId);

    return projects
      .filter((p: any) => p.is_public)
      .map((p: any) => ({
        project_id: p.project_id,
        project_name: p.project_name,
        description: p.description,
        status: p.status,
        priority: p.priority,
        team_id: p.team_id,
        created_by: p.created_by,
        owner_name: p.owner_name,
        owner_username: p.owner_username,
        collaboration_status: p.collaboration_status || null,
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

    if (project.is_public && project.team_id !== null) {
      return {
        project_id: project.project_id,
        project_name: project.project_name,
        description: project.description,
        status: project.status,
        priority: project.priority,
        is_public: project.is_public,
        created_by: project.created_by,
        owner_name: project.owner_name,
        owner_username: project.owner_username,
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

    const goalId = body.goalId || body.goal_id || null;
    if (goalId) {
      const isValidGoal = await tasksRepository.validateGoalInSameTeam(goalId, projectId);
      if (!isValidGoal) {
        throw new BadRequestError('Goal must belong to the same team as the task project');
      }
    }

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
      goal_id: goalId,
    });

    await this.notifyTaskAssignmentChanges(task, { owner: null, reviewer: null, contributors: [] }, userId);

    // Publish realtime event for task creation. The event carries only the
    // project_id so subscribers can refetch the authoritative task list;
    // the full task data (including assignments) is fetched server-side.
    const project = await projectsRepository.getProject(projectId);
    if (project?.team_id) {
      await workStateHistoryService.recordTransition({
        team_id: project.team_id,
        artifact_type: 'task',
        artifact_id: task.task_id,
        event_type: 'created',
        actor_id: userId,
        new_state: { title: task.title, status: task.status, priority: task.priority, owner: task.owner, goal_id: task.goal_id },
      });
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

    const goalId = updates.goalId !== undefined ? updates.goalId : updates.goal_id;
    if (goalId) {
      const isValidGoal = await tasksRepository.validateGoalInSameTeam(goalId, task.project_id);
      if (!isValidGoal) {
        throw new BadRequestError('Goal must belong to the same team as the task project');
      }
      updates.goal_id = goalId;
    } else if (goalId === null) {
      updates.goal_id = null;
    }

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
        if (project?.team_id) {
          let eventType = 'status_changed';
          if (updates.status === 'done') eventType = 'completed';
          else if (task.status === 'done' && updates.status !== 'done') eventType = 'reopened';

          await workStateHistoryService.recordTransition({
            team_id: project.team_id,
            artifact_type: 'task',
            artifact_id: taskId,
            event_type: eventType,
            actor_id: userId,
            previous_state: { status: task.status, owner: task.owner, priority: task.priority, goal_id: task.goal_id },
            new_state: { status: updated.status, owner: updated.owner, priority: updated.priority, goal_id: updated.goal_id },
          });

          realtimeProvider.publish(createRealtimeEvent('task.status_changed', { teamId: project.team_id }));
        }
      }
    }

    return updated;
  }

  async deleteTask(taskId: string, userId?: string) {
    // Capture the task's project before deletion so we can publish the
    // realtime event afterward and record historical state transition.
    const task = await tasksRepository.getTask(taskId);
    await tasksRepository.deleteTask(taskId);

    if (task) {
      const project = await projectsRepository.getProject(task.project_id);
      if (project?.team_id) {
        await workStateHistoryService.recordTransition({
          team_id: project.team_id,
          artifact_type: 'task',
          artifact_id: taskId,
          event_type: 'deleted',
          actor_id: userId || task.created_by,
          previous_state: { title: task.title, status: task.status, goal_id: task.goal_id },
        });
        realtimeProvider.publish(createRealtimeEvent('task.deleted', { teamId: project.team_id }));
      }
    }
  }

  getMyTasks(userId: string) {
    return tasksRepository.getUserTasks(userId);
  }

  async submitTaskForReview(taskId: string, userId: string, notes?: string) {
    const task = await tasksRepository.getTask(taskId);
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const isOwner = task.owner === userId;
    const isContributor = Array.isArray(task.contributors) && task.contributors.includes(userId);
    const isCreator = task.created_by === userId;
    const isAcceptedCollaborator = await projectsRepository.isAcceptedCollaborator(userId, task.project_id);

    if (!isOwner && !isContributor && !isCreator && !isAcceptedCollaborator) {
      throw new ForbiddenError('Only assigned owner, contributor, or project collaborator can submit task for review');
    }

    const updated = await tasksRepository.updateTask(taskId, { status: 'review' });
    const project = await projectsRepository.getProject(task.project_id);

    if (project?.team_id) {
      await workStateHistoryService.recordTransition({
        team_id: project.team_id,
        artifact_type: 'task',
        artifact_id: taskId,
        event_type: 'status_changed',
        actor_id: userId,
        previous_state: { status: task.status },
        new_state: { status: 'review', notes: notes || undefined },
      });

      realtimeProvider.publish(createRealtimeEvent('task.status_changed', { teamId: project.team_id }));
    }

    const reviewerId = task.reviewer || project?.created_by;
    const user = await usersRepository.getUserById(userId);
    const actorName = user?.full_name || 'Team Member';

    if (reviewerId && reviewerId !== userId) {
      await notificationsService.notifyUser({
        recipientUserId: reviewerId,
        category: 'task.review_requested',
        preferenceGroup: 'task_assignment',
        title: 'Task submitted for review',
        message: `${actorName} submitted "${task.title}" for review`,
        taskId,
        projectId: task.project_id,
        teamId: project?.team_id || undefined,
      });
    }

    return updated;
  }

  async approveTask(taskId: string, userId: string) {
    const task = await tasksRepository.getTask(taskId);
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const project = await projectsRepository.getProject(task.project_id);

    const isReviewer = task.reviewer === userId;
    const isProjectCreator = project?.created_by === userId;
    let isTeamLeader = false;
    if (project?.team_id) {
      const role = await teamsRepository.getMemberRole(userId, project.team_id);
      isTeamLeader = role === 'owner' || role === 'admin' || role === 'manager';
    }

    if (!isReviewer && !isProjectCreator && !isTeamLeader) {
      throw new ForbiddenError('Only authorized reviewer or team leader can approve task');
    }

    const updated = await tasksRepository.updateTask(taskId, { status: 'done', completed_at: new Date() });

    if (project?.team_id) {
      await workStateHistoryService.recordTransition({
        team_id: project.team_id,
        artifact_type: 'task',
        artifact_id: taskId,
        event_type: 'completed',
        actor_id: userId,
        previous_state: { status: task.status },
        new_state: { status: 'done', completed_at: new Date() },
      });

      realtimeProvider.publish(createRealtimeEvent('task.status_changed', { teamId: project.team_id }));
    }

    if (task.owner && task.owner !== userId) {
      await notificationsService.notifyUser({
        recipientUserId: task.owner,
        category: 'task.approved',
        preferenceGroup: 'task_assignment',
        title: 'Task Approved',
        message: `Your task "${task.title}" was approved!`,
        taskId,
        projectId: task.project_id,
        teamId: project?.team_id || undefined,
      });
    }

    if (task.goal_id) {
      try {
        const goal = await goalsRepository.getGoal(task.goal_id);
        if (goal && goal.created_by && goal.created_by !== userId) {
          const progressSummary = await goalsRepository.calculateHybridGoalProgress(task.goal_id);
          const newProgress = progressSummary.progress ?? goal.progress;
          const actor = await usersRepository.getUserById(userId);
          const actorName = actor?.full_name || 'A team member';
          await notificationsService.notifyUser({
            recipientUserId: goal.created_by,
            category: 'goal.progress_updated',
            preferenceGroup: 'goal_review',
            title: 'Goal Progress Updated',
            message: `${actorName} updated "${goal.title}" progress to ${newProgress}%.`,
            goalId: goal.goal_id,
            teamId: goal.team_id || project?.team_id || undefined,
          });
        }
      } catch (err) {
        console.error('[projects] Failed to notify goal owner on task approval:', err);
      }
    }

    return updated;
  }

  async requestTaskChanges(taskId: string, userId: string, reason: string) {
    const task = await tasksRepository.getTask(taskId);
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const project = await projectsRepository.getProject(task.project_id);

    const isReviewer = task.reviewer === userId;
    const isProjectCreator = project?.created_by === userId;
    let isTeamLeader = false;
    if (project?.team_id) {
      const role = await teamsRepository.getMemberRole(userId, project.team_id);
      isTeamLeader = role === 'owner' || role === 'admin' || role === 'manager';
    }

    if (!isReviewer && !isProjectCreator && !isTeamLeader) {
      throw new ForbiddenError('Only authorized reviewer or team leader can request changes');
    }

    const updated = await tasksRepository.updateTask(taskId, { status: 'in_progress' });

    if (project?.team_id) {
      await workStateHistoryService.recordTransition({
        team_id: project.team_id,
        artifact_type: 'task',
        artifact_id: taskId,
        event_type: 'status_changed',
        actor_id: userId,
        previous_state: { status: task.status },
        new_state: { status: 'in_progress', changes_requested_reason: reason },
      });

      realtimeProvider.publish(createRealtimeEvent('task.status_changed', { teamId: project.team_id }));
    }

    if (task.owner && task.owner !== userId) {
      await notificationsService.notifyUser({
        recipientUserId: task.owner,
        category: 'task.changes_requested',
        preferenceGroup: 'task_assignment',
        title: 'Changes Requested',
        message: `Changes requested on "${task.title}": ${reason}`,
        taskId,
        projectId: task.project_id,
        teamId: project?.team_id || undefined,
      });
    }

    return updated;
  }

  async createBatchTeamTasks(classId: string, taskBody: any, userId: string) {
    const role = await teamsRepository.getMemberRole(userId, classId);
    if (!role || (role !== 'owner' && role !== 'admin')) {
      throw new ForbiddenError('Only class owner/coordinator can perform batch team assignments');
    }

    const childTeams = await teamsRepository.getSubTeams(classId);
    if (childTeams.length === 0) {
      throw new BadRequestError('No sub-teams found in this classroom to assign work to');
    }

    const createdTasks = [];
    const actor = await usersRepository.getUserById(userId);
    const actorName = actor?.full_name || 'Class Owner';

    for (const team of childTeams) {
      let teamProjects = await projectsRepository.getTeamProjects(team.team_id);
      let project = teamProjects.find((p: any) => p.status === 'active') || teamProjects[0];

      if (!project) {
        project = await projectsRepository.createProject({
          project_name: `${team.team_name} Assignments`,
          description: `General assignment container for ${team.team_name}`,
          created_by: userId,
          team_id: team.team_id,
          priority: 'medium',
          is_public: true,
        });
      }

      let reviewerId = userId;
      if (taskBody.reviewerPolicy !== 'class_owner') {
        const teamMembers = await teamsRepository.getTeamMembers(team.team_id);
        const leader = teamMembers.find((m: any) => m.role === 'owner' || m.role === 'admin' || m.role === 'manager');
        if (leader) reviewerId = leader.user_id;
      }

      const task = await tasksRepository.createTask({
        project_id: project.project_id,
        title: taskBody.title,
        description: taskBody.description || '',
        reviewer: reviewerId,
        priority: taskBody.priority || 'medium',
        created_by: userId,
      });

      createdTasks.push(task);

      await notificationsService.notifyTeamMembersByRole(
        team.team_id,
        ['owner', 'admin', 'manager', 'member', 'viewer'],
        {
          category: 'task.team_assigned',
          preferenceGroup: 'task_assignment',
          title: 'New Team Work Assigned',
          message: `${actorName} assigned new work to ${team.team_name}: "${task.title}"`,
          taskId: task.task_id,
          projectId: project.project_id,
        },
        userId
      );

      await workStateHistoryService.recordTransition({
        team_id: team.team_id,
        artifact_type: 'task',
        artifact_id: task.task_id,
        event_type: 'created',
        actor_id: userId,
        new_state: { title: task.title, status: task.status, priority: task.priority },
      });

      realtimeProvider.publish(createRealtimeEvent('task.created', { teamId: team.team_id }));
    }

    return { count: createdTasks.length, tasks: createdTasks };
  }

  async searchClassroomMembers(classId: string, queryStr: string, userId: string) {
    const role = await teamsRepository.getMemberRole(userId, classId);
    if (!role) {
      throw new ForbiddenError('Access denied to this classroom');
    }

    const childTeams = await teamsRepository.getSubTeams(classId);
    const teamIds = [classId, ...childTeams.map((t: any) => t.team_id)];

    const allMembersArrays = await Promise.all(teamIds.map((tid) => teamsRepository.getTeamMembers(tid)));
    const userMap = new Map<string, any>();

    const q = (queryStr || '').toLowerCase().trim();

    for (const arr of allMembersArrays) {
      for (const m of arr) {
        if (!q || m.full_name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)) {
          if (!userMap.has(m.user_id)) {
            userMap.set(m.user_id, {
              user_id: m.user_id,
              full_name: m.full_name,
              username: m.username,
              email: m.email,
              avatar_key: m.avatar_key,
              role: m.role,
              team_id: m.team_id,
            });
          }
        }
      }
    }

    return Array.from(userMap.values());
  }

  async requestCollaboration(projectId: string, userId: string) {
    const project = await projectsRepository.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.created_by === userId) {
      throw new BadRequestError('You are the owner of this project');
    }
    if (!project.is_public) {
      throw new ForbiddenError('Cannot request collaboration on a private project');
    }

    const existing = await projectsRepository.getCollaborationRequest(projectId, userId);
    if (existing) {
      if (existing.status === 'pending') {
        throw new ConflictError('A collaboration request is already pending for this project');
      }
      if (existing.status === 'accepted') {
        throw new ConflictError('You are already an accepted collaborator on this project');
      }
      if (existing.status === 'rejected' || existing.status === 'revoked') {
        const updated = await projectsRepository.updateCollaborationStatus(projectId, userId, 'pending');
        const requester = await usersRepository.getUserById(userId);
        if (requester && project.created_by) {
          await notificationsService.notifyUser({
            recipientUserId: project.created_by,
            category: 'project.collaboration_requested',
            preferenceGroup: 'task_assignment',
            title: 'Project Collaboration Request',
            message: `${requester.full_name} requested to collaborate on "${project.project_name}"`,
            projectId: project.project_id,
          });
        }
        realtimeProvider.publish(createRealtimeEvent('project.collaboration_requested', { teamId: project.team_id || undefined }));
        return updated;
      }
    }

    const req = await projectsRepository.createCollaborationRequest(projectId, userId);

    const requester = await usersRepository.getUserById(userId);
    if (requester && project.created_by) {
      await notificationsService.notifyUser({
        recipientUserId: project.created_by,
        category: 'project.collaboration_requested',
        preferenceGroup: 'task_assignment',
        title: 'Project Collaboration Request',
        message: `${requester.full_name} wants to collaborate on "${project.project_name}"`,
        projectId: project.project_id,
      });
    }

    realtimeProvider.publish(createRealtimeEvent('project.collaboration_requested', { teamId: project.team_id || undefined }));
    return req;
  }

  async acceptCollaboration(projectId: string, targetUserId: string, actorUserId: string) {
    const isCreator = await projectsRepository.isProjectCreator(actorUserId, projectId);
    if (!isCreator) {
      throw new ForbiddenError('Only the project creator can accept collaboration requests');
    }

    const updated = await projectsRepository.updateCollaborationStatus(projectId, targetUserId, 'accepted');
    if (!updated) {
      throw new NotFoundError('Collaboration request not found');
    }

    const project = await projectsRepository.getProject(projectId);
    if (project) {
      await notificationsService.notifyUser({
        recipientUserId: targetUserId,
        category: 'project.collaboration_accepted',
        preferenceGroup: 'task_assignment',
        title: 'Collaboration Accepted',
        message: `Your request to collaborate on "${project.project_name}" was accepted!`,
        projectId,
      });
    }

    realtimeProvider.publish(createRealtimeEvent('project.collaboration_accepted', { teamId: project?.team_id || undefined }));
    return updated;
  }

  async rejectCollaboration(projectId: string, targetUserId: string, actorUserId: string) {
    const isCreator = await projectsRepository.isProjectCreator(actorUserId, projectId);
    if (!isCreator) {
      throw new ForbiddenError('Only the project creator can reject collaboration requests');
    }

    const updated = await projectsRepository.updateCollaborationStatus(projectId, targetUserId, 'rejected');
    if (!updated) {
      throw new NotFoundError('Collaboration request not found');
    }

    const project = await projectsRepository.getProject(projectId);
    if (project) {
      await notificationsService.notifyUser({
        recipientUserId: targetUserId,
        category: 'project.collaboration_rejected',
        preferenceGroup: 'task_assignment',
        title: 'Collaboration Request Declined',
        message: `Your request to collaborate on "${project.project_name}" was declined.`,
        projectId,
      });
    }

    return updated;
  }

  async revokeCollaboration(projectId: string, targetUserId: string, actorUserId: string) {
    const isCreator = await projectsRepository.isProjectCreator(actorUserId, projectId);
    if (!isCreator) {
      throw new ForbiddenError('Only the project creator can revoke collaboration access');
    }

    const updated = await projectsRepository.updateCollaborationStatus(projectId, targetUserId, 'revoked');
    if (!updated) {
      throw new NotFoundError('Collaboration request not found');
    }

    return updated;
  }

  async getProjectCollaborators(projectId: string, userId: string) {
    const canAccess = await projectsRepository.canAccessProject(userId, projectId);
    if (!canAccess) {
      throw new ForbiddenError('Access denied to this project');
    }
    return projectsRepository.getProjectCollaborators(projectId);
  }
}

export const projectsService = new ProjectsService();
