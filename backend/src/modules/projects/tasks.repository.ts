import { query, queryOne, buildSetClause } from '../../db/client';

const TASK_UPDATABLE_COLUMNS = [
  'title',
  'description',
  'owner',
  'contributors',
  'reviewer',
  'dependencies',
  'status',
  'priority',
  'completed_at',
];

// Moved verbatim from the old databaseService.ts (task methods). Tasks live
// inside the projects module rather than a separate top-level module -- they
// are a sub-resource of Project in every route (/projects/:id/tasks,
// /tasks/:id) and in the original controller, so splitting them further
// would add a module boundary the codebase doesn't actually have yet.
export class TasksRepository {
  async createTask(taskData: {
    project_id: string;
    title: string;
    description?: string;
    owner?: string;
    contributors?: any;
    reviewer?: string;
    dependencies?: any;
    priority?: string;
    created_by: string;
  }) {
    const text = `
      INSERT INTO tasks (
        project_id, title, description, owner, contributors, reviewer,
        dependencies, priority, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const params = [
      taskData.project_id,
      taskData.title,
      taskData.description || null,
      taskData.owner || null,
      JSON.stringify(taskData.contributors || []),
      taskData.reviewer || null,
      JSON.stringify(taskData.dependencies || []),
      taskData.priority || 'medium',
      taskData.created_by,
    ];

    return queryOne<any>(text, params);
  }

  async getProjectTasks(projectId: string) {
    const text = `
      SELECT * FROM tasks
      WHERE project_id = $1
      ORDER BY created_at DESC
    `;
    return query<any>(text, [projectId]);
  }

  async getTask(taskId: string) {
    const text = 'SELECT * FROM tasks WHERE task_id = $1';
    return queryOne<any>(text, [taskId]);
  }

  async updateTask(taskId: string, updates: Record<string, any>) {
    const built = buildSetClause(TASK_UPDATABLE_COLUMNS, updates, 2);
    if (!built) {
      return this.getTask(taskId);
    }

    const text = `
      UPDATE tasks
      SET ${built.clause}, updated_at = CURRENT_TIMESTAMP
      WHERE task_id = $1
      RETURNING *
    `;

    return queryOne(text, [taskId, ...built.values]);
  }

  async deleteTask(taskId: string) {
    const text = 'DELETE FROM tasks WHERE task_id = $1';
    return query(text, [taskId]);
  }

  async getUserTasks(userId: string) {
    const text = `
      SELECT t.* FROM tasks t
      INNER JOIN projects p ON t.project_id = p.project_id
      WHERE t.created_by = $1 OR p.team_id IN (
        SELECT team_id FROM team_members WHERE user_id = $1
      )
      ORDER BY t.created_at DESC
    `;
    return query<any>(text, [userId]);
  }

  // Milestone 5: a task's own access rule is its parent project's --
  // mirrors projects.repository.ts's canAccessProject exactly (project
  // creator, or a member of the project's team) rather than inventing a
  // separate rule. Used by requireAccess on the task update/delete routes,
  // which had no authorization check of any kind before this milestone.
  async canAccessTask(userId: string, taskId: string): Promise<boolean> {
    const text = `
      SELECT tk.task_id FROM tasks tk
      INNER JOIN projects p ON tk.project_id = p.project_id
      WHERE tk.task_id = $1 AND (
        p.created_by = $2 OR
        p.team_id IN (SELECT team_id FROM team_members WHERE user_id = $2)
      )
    `;
    const result = await queryOne(text, [taskId, userId]);
    return result !== null;
  }
}

export const tasksRepository = new TasksRepository();
