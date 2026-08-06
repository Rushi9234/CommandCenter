import { query, queryOne } from '../../db/client';

// Moved verbatim from the old databaseService.ts (project methods).
export class ProjectsRepository {
  async createProject(projectData: {
    project_name: string;
    description?: string;
    created_by: string;
    team_id?: string;
    status?: string;
    priority?: string;
    is_public?: boolean;
    deadline?: Date;
  }) {
    const text = `
      INSERT INTO projects (
        project_name, description, created_by, team_id, status,
        priority, is_public, deadline
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const params = [
      projectData.project_name,
      projectData.description || null,
      projectData.created_by,
      projectData.team_id || null,
      projectData.status || 'planning',
      projectData.priority || 'medium',
      projectData.is_public !== false,
      projectData.deadline || null,
    ];

    return queryOne<any>(text, params);
  }

  async getProject(projectId: string) {
    const text = 'SELECT * FROM projects WHERE project_id = $1';
    return queryOne<any>(text, [projectId]);
  }

  async getUserProjects(userId: string) {
    const text = `
      SELECT * FROM projects
      WHERE created_by = $1 OR team_id IN (
        SELECT team_id FROM team_members WHERE user_id = $1
      )
      ORDER BY created_at DESC
    `;
    return query(text, [userId]);
  }

  async getAllPublicProjects() {
    const text = `
      SELECT * FROM projects
      WHERE is_public = true
      ORDER BY created_at DESC
    `;
    return query<any>(text);
  }

  async updateProject(projectId: string, updates: Record<string, any>) {
    // NOTE: preserved as-is -- same unallowlisted dynamic SET clause as the
    // original databaseService.ts. See users.repository.ts for the same
    // note; fixing this is out of scope for this architecture-only milestone.
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const text = `
      UPDATE projects
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE project_id = $1
      RETURNING *
    `;

    const params = [projectId, ...Object.values(updates)];
    return queryOne(text, params);
  }

  async deleteProject(projectId: string) {
    const text = 'DELETE FROM projects WHERE project_id = $1';
    return query(text, [projectId]);
  }

  async getTeamProjects(teamId: string) {
    const text = `
      SELECT * FROM projects
      WHERE team_id = $1
      ORDER BY created_at DESC
    `;
    return query(text, [teamId]);
  }

  async canAccessProject(userId: string, projectId: string): Promise<boolean> {
    const text = `
      SELECT p.project_id FROM projects p
      WHERE p.project_id = $1 AND (
        p.created_by = $2 OR
        p.team_id IN (
          SELECT team_id FROM team_members WHERE user_id = $2
        )
      )
    `;
    const result = await queryOne(text, [projectId, userId]);
    return result !== null;
  }
}

export const projectsRepository = new ProjectsRepository();
