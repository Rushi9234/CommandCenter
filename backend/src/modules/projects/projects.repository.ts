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
    const text = `
      SELECT p.*, u.full_name as owner_name, u.username as owner_username
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.user_id
      WHERE p.project_id = $1
    `;
    return queryOne<any>(text, [projectId]);
  }

  async getUserProjects(userId: string) {
    const text = `
      SELECT p.*, u.full_name as owner_name, u.username as owner_username
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.user_id
      WHERE p.created_by = $1 OR (
        p.team_id IS NOT NULL AND p.team_id IN (
          SELECT team_id FROM team_members WHERE user_id = $1
        )
      ) OR EXISTS (
        SELECT 1 FROM project_collaborators
        WHERE project_id = p.project_id AND user_id = $1 AND status = 'accepted'
      )
      ORDER BY p.created_at DESC
    `;
    return query(text, [userId]);
  }

  async getAllPublicProjects(userId?: string) {
    const text = `
      SELECT p.*, u.full_name as owner_name, u.username as owner_username, pc.status as collaboration_status
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.user_id
      LEFT JOIN project_collaborators pc ON pc.project_id = p.project_id AND pc.user_id = $1
      WHERE p.is_public = true
      ORDER BY p.created_at DESC
    `;
    return query<any>(text, [userId || null]);
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
      SELECT p.*, u.full_name as owner_name, u.username as owner_username
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.user_id
      WHERE p.team_id = $1
      ORDER BY p.created_at DESC
    `;
    return query(text, [teamId]);
  }

  async canAccessProject(userId: string, projectId: string): Promise<boolean> {
    const text = `
      SELECT p.project_id FROM projects p
      WHERE p.project_id = $1 AND (
        p.created_by = $2 OR
        p.is_public = true OR
        (p.team_id IS NOT NULL AND p.team_id IN (
          SELECT team_id FROM team_members WHERE user_id = $2
        )) OR
        EXISTS (
          SELECT 1 FROM project_collaborators
          WHERE project_id = p.project_id AND user_id = $2 AND status = 'accepted'
        )
      )
    `;
    const result = await queryOne(text, [projectId, userId]);
    return result !== null;
  }

  async canWriteProject(userId: string, projectId: string): Promise<boolean> {
    const text = `
      SELECT p.project_id FROM projects p
      WHERE p.project_id = $1 AND (
        p.created_by = $2 OR
        (p.team_id IS NOT NULL AND p.team_id IN (
          SELECT team_id FROM team_members WHERE user_id = $2 AND role != 'viewer'
        )) OR
        EXISTS (
          SELECT 1 FROM project_collaborators
          WHERE project_id = p.project_id AND user_id = $2 AND status = 'accepted'
        )
      )
    `;
    const result = await queryOne(text, [projectId, userId]);
    return result !== null;
  }

  async isProjectCreator(userId: string, projectId: string): Promise<boolean> {
    const result = await queryOne('SELECT project_id FROM projects WHERE project_id = $1 AND created_by = $2', [
      projectId,
      userId,
    ]);
    return result !== null;
  }

  async createCollaborationRequest(projectId: string, userId: string) {
    const text = `
      INSERT INTO project_collaborators (project_id, user_id, status)
      VALUES ($1, $2, 'pending')
      ON CONFLICT (project_id, user_id) DO UPDATE SET
        status = 'pending',
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    return queryOne<any>(text, [projectId, userId]);
  }

  async getCollaborationRequest(projectId: string, userId: string) {
    const text = 'SELECT * FROM project_collaborators WHERE project_id = $1 AND user_id = $2';
    return queryOne<any>(text, [projectId, userId]);
  }

  async getProjectCollaborators(projectId: string) {
    const text = `
      SELECT pc.*, u.full_name, u.username, u.email, u.avatar_key
      FROM project_collaborators pc
      JOIN users u ON pc.user_id = u.user_id
      WHERE pc.project_id = $1
      ORDER BY pc.requested_at DESC
    `;
    return query<any>(text, [projectId]);
  }

  async updateCollaborationStatus(projectId: string, userId: string, status: string) {
    const text = `
      UPDATE project_collaborators
      SET status = $3, updated_at = CURRENT_TIMESTAMP
      WHERE project_id = $1 AND user_id = $2
      RETURNING *
    `;
    return queryOne<any>(text, [projectId, userId, status]);
  }

  async isAcceptedCollaborator(userId: string, projectId: string): Promise<boolean> {
    const text = `
      SELECT 1 FROM project_collaborators
      WHERE project_id = $1 AND user_id = $2 AND status = 'accepted'
    `;
    const result = await queryOne(text, [projectId, userId]);
    return result !== null;
  }
}

export const projectsRepository = new ProjectsRepository();
