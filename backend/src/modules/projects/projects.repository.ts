import { query, queryOne, buildSetClause } from '../../db/client';

const PROJECT_UPDATABLE_COLUMNS = ['project_name', 'description', 'team_id', 'status', 'priority', 'is_public', 'deadline'];

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
    const built = buildSetClause(PROJECT_UPDATABLE_COLUMNS, updates, 2);
    if (!built) {
      return this.getProject(projectId);
    }

    const text = `
      UPDATE projects
      SET ${built.clause}, updated_at = CURRENT_TIMESTAMP
      WHERE project_id = $1
      RETURNING *
    `;

    return queryOne(text, [projectId, ...built.values]);
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

  // Milestone 5 review: canAccessProject alone let a 'viewer' -- a role the
  // model documents as read-only -- update a project, because it only
  // checked "is any kind of team member", not which role. This is the same
  // check with `role != 'viewer'` added to the team-membership branch;
  // creator ownership still bypasses role entirely, same as before.
  async canWriteProject(userId: string, projectId: string): Promise<boolean> {
    const text = `
      SELECT p.project_id FROM projects p
      WHERE p.project_id = $1 AND (
        p.created_by = $2 OR
        p.team_id IN (
          SELECT team_id FROM team_members WHERE user_id = $2 AND role != 'viewer'
        )
      )
    `;
    const result = await queryOne(text, [projectId, userId]);
    return result !== null;
  }

  // Milestone 5: delete keeps its own, narrower rule -- creator only, not
  // "creator or any team member" like canAccessProject. Unchanged from the
  // original behavior; pulled into the repository so requireAccess can call
  // it the same way it calls every other access check, instead of
  // projects.service.ts fetching the row and comparing created_by inline.
  async isProjectCreator(userId: string, projectId: string): Promise<boolean> {
    const result = await queryOne('SELECT project_id FROM projects WHERE project_id = $1 AND created_by = $2', [
      projectId,
      userId,
    ]);
    return result !== null;
  }
}

export const projectsRepository = new ProjectsRepository();
