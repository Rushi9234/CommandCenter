import { query, queryOne } from '../../db/client';

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
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const text = `
      UPDATE tasks
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE task_id = $1
      RETURNING *
    `;

    const params = [taskId, ...Object.values(updates)];
    return queryOne(text, params);
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
}

export const tasksRepository = new TasksRepository();
